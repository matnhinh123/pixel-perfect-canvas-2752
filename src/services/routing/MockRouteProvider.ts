import { LOCATIONS } from "@/mock-data/locations";
import { MOCK_TOLL_GATES, PROVIDER_ONLY_GATES } from "@/mock-data/tollCatalog";
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteInstruction,
  RouteRequest,
  TollStation,
} from "@/types";
import { bboxOf, haversineKm, nearestVertex, pointAlong, polylineLengthKm } from "./geo";
import { searchLocations } from "./locationSearch";
import type { RoadPath } from "./roadRouting";
import {
  RouteProviderError,
  tollClassIndex,
  tollClassLabel,
  type RouteProvider,
} from "./RouteProvider";

export { normalizeText } from "./locationSearch";

const ROAD_FACTOR = 1.18;

/** Plausible road-class split: long hauls are mostly national road + expressway, short ones mostly urban. */
function mockRoadTypes(distance: number, vehicle: RouteRequest["vehicle"]) {
  const [n, e] = distance > 300 ? [0.64, 0.31] : distance > 60 ? [0.5, 0.4] : [0.35, 0.15];
  const expressway = vehicle === "Motorcycle" ? 0 : Math.round(distance * e);
  const national = Math.round(distance * (vehicle === "Motorcycle" ? n + e : n));
  return { national, expressway, other: Math.max(0, Math.round(distance - national - expressway)) };
}
const SPEED_KMH: Record<RouteRequest["vehicle"], number> = {
  Car: 48,
  Motorcycle: 35,
  Truck: 42,
  Container: 38,
};

/** Same-request route variants. Tuyến 1 is the recommended one; 2 favours expressways, 3 is the shortest. */
const VARIANTS = [
  { bend: (s: number) => 0.07 * s, timeFactor: 1 },
  { bend: (s: number) => -0.12 * s, timeFactor: 0.94 },
  { bend: (s: number) => 0.02 * s, timeFactor: 1.06 },
] as const;

function curvedSegment(
  a: [number, number],
  b: [number, number],
  steps: number,
  bend: (sign: number) => number,
): [number, number][] {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  // Deterministic gentle bend so the same request always yields the same geometry.
  const k = bend(Math.sin(a[0] * 37 + b[1] * 11) > 0 ? 1 : -1);
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(Math.PI * t) * k;
    out.push([a[0] + dy * t + dx * off, a[1] + dx * t - dy * off]);
  }
  return out;
}

const isPeakHour = (departure?: string) => {
  const h = Number(departure?.slice(11, 13));
  return Number.isFinite(h) && ((h >= 6 && h < 9) || (h >= 16 && h < 19));
};

/** Extra vertices so every segment is ≤ ~1 km — toll gates are matched against this, not the simplified line. */
function densify(g: [number, number][]): [number, number][] {
  const out: [number, number][] = g.length ? [g[0]!] : [];
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1]!,
      b = g[i]!;
    const n = Math.ceil(haversineKm({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }));
    for (let k = 1; k <= n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/**
 * Synchronous core, also used to build seed data so seeded numbers match a recalculation.
 * With `roads` (real road geometry, one per alternative) the routes follow actual roads;
 * without, a deterministic curved line between the stops is used.
 */
export function computeMockRoutes(
  req: RouteRequest,
  calculatedAt = new Date().toISOString(),
  roads?: RoadPath[] | null,
): RouteCalculation[] {
  if (req.points.length < 2)
    throw new RouteProviderError(
      "At least an origin and a destination are required.",
      "INVALID_REQUEST",
    );
  const first = req.points[0]!;
  const last = req.points[req.points.length - 1]!;
  if (req.points.length === 2 && haversineKm(first, last) < 0.05)
    throw new RouteProviderError("Origin and destination are the same location.", "ZERO_RESULTS");

  const baseWarnings: string[] = [];
  let capacity = req.capacityKg;
  if ((req.vehicle === "Truck" || req.vehicle === "Container") && !capacity) {
    capacity = 10000;
    baseWarnings.push("Capacity not provided for truck/container — assumed 10,000 kg.");
  }
  const cls = tollClassIndex(req.vehicle, capacity);
  if (cls === null)
    baseWarnings.push("Motorcycles are not allowed on expressways — toll gates are not applied.");
  // Real router output (distance + duration) is reported as-is, without mock adjustments.
  const routed = !!roads?.length && roads.every((r) => r.durationMin != null);
  const peak = !routed && isPeakHour(req.departureTime);
  if (peak) baseWarnings.push("Khởi hành giờ cao điểm — thời gian ước tính đã cộng thêm 10%.");

  const curved = VARIANTS.map((v) => {
    const g: [number, number][] = [];
    for (let i = 1; i < req.points.length; i++) {
      const a = req.points[i - 1]!;
      const b = req.points[i]!;
      // ~1 vertex per 2 km so toll-gate proximity checks work on long legs too.
      const steps = Math.max(24, Math.ceil(haversineKm(a, b) / 2));
      const seg = curvedSegment([a.lat, a.lng], [b.lat, b.lng], steps, v.bend);
      g.push(...(i === 1 ? seg : seg.slice(1)));
    }
    return g;
  });
  const geometries = roads?.length ? roads.map((r) => r.geometry) : curved;
  const dense = geometries.map(densify);

  // Toll gates are detected on the recommended geometry; the other variants swap some of them.
  const base = dense[0]!;
  let ferrySkipped = false;
  const baseStations: TollStation[] =
    cls === null
      ? []
      : MOCK_TOLL_GATES.map((g) => ({ g, near: nearestVertex(base, g) }))
          .filter((h) => h.near.km < 3.5)
          .filter((h) => {
            if (req.avoidFerry && h.g.feeType === "Ferry") ferrySkipped = true;
            return !(req.avoidFerry && h.g.feeType === "Ferry");
          })
          .sort((x, y) => x.near.index - y.near.index)
          .map(({ g }) => ({
            id: g.id,
            code: g.code,
            name: g.name,
            address: g.province,
            feeType: g.feeType,
            price: g.prices[cls]!,
            vehicleTollGroup: tollClassLabel(cls),
            passCount: 1,
            source: "Mock" as const,
            reconciled: true,
            lat: g.lat,
            lng: g.lng,
          }));
  if (ferrySkipped && !routed) baseWarnings.push("Đã tránh phà — tuyến đi vòng qua cầu.");

  const providerOnly = (idx: number, geometry: [number, number][], t: number): TollStation => {
    const gate = PROVIDER_ONLY_GATES[idx]!;
    const pos = pointAlong(geometry, t);
    return {
      id: `PV-${idx + 1}`,
      name: gate.name,
      feeType: "Toll",
      price: gate.prices[cls ?? 0]!,
      vehicleTollGroup: tollClassLabel(cls),
      passCount: 1,
      source: "Mock",
      reconciled: false,
      ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
    };
  };

  const stationsFor = (variant: number, geometry: [number, number][]): TollStation[] => {
    if (variant === 0 || baseStations.length === 0) return baseStations;
    if (variant === 1) {
      // Expressway option: skips the most expensive gate, pays one gate unknown to master data.
      const skip = baseStations.reduce((m, t) => (t.price > m.price ? t : m), baseStations[0]!);
      const kept = baseStations.length > 1 ? baseStations.filter((t) => t !== skip) : baseStations;
      return [...kept, providerOnly(0, geometry, 0.4)];
    }
    return [...baseStations, providerOnly(1, geometry, 0.6)];
  };

  return geometries.map((geometry, v) => {
    const warnings = [...baseWarnings];
    const detourKm = ferrySkipped && !routed ? 4 : 0;
    const roadKm = roads?.[v]?.distanceKm ?? polylineLengthKm(geometry) * ROAD_FACTOR;
    const distance = Math.round((roadKm + detourKm) * 10) / 10;
    const speed = SPEED_KMH[req.vehicle] + (distance > 80 ? 14 : 0);
    const routedMin = roads?.[v]?.durationMin;
    const estimatedTime =
      routed && routedMin != null
        ? Math.round(routedMin)
        : Math.round(
            ((distance / speed) * 60 * (VARIANTS[v]?.timeFactor ?? 1) +
              (req.points.length - 2) * 5) *
              (peak ? 1.1 : 1),
          );
    // Snap toll markers onto this variant's polyline.
    const line = dense[v]!;
    const tollStations = stationsFor(v, line).map((t) => {
      if (t.lat == null || t.lng == null) return t;
      const p = line[nearestVertex(line, { lat: t.lat, lng: t.lng }).index]!;
      return { ...t, lat: p[0], lng: p[1] };
    });

    const names = req.points.map((p) => p.name || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`);
    const instructions: RouteInstruction[] = names.map((n, i) => ({
      text:
        i === 0
          ? `Depart from ${n}`
          : i === names.length - 1
            ? `Arrive at ${n}`
            : `Pass via waypoint ${n}`,
      distanceM: i === 0 ? 0 : Math.round((distance * 1000) / (names.length - 1)),
      timeMs: i === 0 ? 0 : Math.round((estimatedTime * 60000) / (names.length - 1)),
    }));

    return {
      id: `ALT-${v + 1}`,
      label: `Tuyến ${v + 1}`,
      recommended: v === 0,
      distance,
      estimatedTime,
      geometry,
      bbox: bboxOf(geometry),
      instructions,
      tollCost: tollStations.reduce((s, t) => s + t.price * t.passCount, 0),
      tollStations,
      warnings,
      roadTypes: mockRoadTypes(distance, req.vehicle),
      provider: "mock" as const,
      calculatedAt,
    };
  });
}

/** Single best route (return legs, seed data). */
export const computeMockRoute = (
  req: RouteRequest,
  calculatedAt?: string,
  road?: RoadPath | null,
): RouteCalculation => {
  const best = computeMockRoutes(req, calculatedAt, road ? [road] : null)[0]!;
  const { id: _id, label: _label, recommended: _rec, ...rest } = best;
  return rest;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Offline provider (tests, no network). Road routing lives in OsrmRouteProvider / VietmapRouteProvider. */
export class MockRouteProvider implements RouteProvider {
  readonly name = "mock" as const;

  async calculateRoute(req: RouteRequest) {
    await delay(300);
    return computeMockRoute(req);
  }

  async calculateRoutes(req: RouteRequest) {
    await delay(300);
    return computeMockRoutes(req);
  }

  async searchLocation(text: string): Promise<LocationSuggestion[]> {
    await delay(150);
    return searchLocations(LOCATIONS, text, text.trim() ? 8 : 12).map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      source: "master" as const,
    }));
  }

  async resolveLocation(s: LocationSuggestion) {
    return s;
  }

  async getRouteTolls(req: RouteRequest) {
    const r = await this.calculateRoute(req);
    return { tollCost: r.tollCost, tollStations: r.tollStations };
  }
}
