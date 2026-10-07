import { LOCATIONS } from "@/mock-data/locations";
import { PROVIDER_ONLY_GATES } from "@/mock-data/tollCatalog";
import { activeTollGates } from "@/services/routing/tollGates";
import { tr } from "@/lib/i18n";
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteInstruction,
  RouteRequest,
  TollStation,
} from "@/types";
import { bboxOf, haversineKm, nearestVertex, pointAlong, polylineLengthKm } from "./geo";
import { searchLocations } from "./locationSearch";
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

/** Synchronous core, also used to build seed data so seeded numbers match a recalculation. */
export function computeMockRoutes(
  req: RouteRequest,
  calculatedAt = new Date().toISOString(),
): RouteCalculation[] {
  if (req.points.length < 2)
    throw new RouteProviderError(
      tr(
        "Cần có ít nhất điểm đi và điểm đến.",
        "At least an origin and a destination are required.",
      ),
      "INVALID_REQUEST",
    );
  const first = req.points[0]!;
  const last = req.points[req.points.length - 1]!;
  if (req.points.length === 2 && haversineKm(first, last) < 0.05)
    throw new RouteProviderError(
      tr("Điểm đi và điểm đến trùng nhau.", "Origin and destination are the same location."),
      "ZERO_RESULTS",
    );

  const baseWarnings: string[] = [];
  let capacity = req.capacityKg;
  if ((req.vehicle === "Truck" || req.vehicle === "Container") && !capacity) {
    capacity = 10000;
    baseWarnings.push(
      tr(
        "Chưa nhập tải trọng cho xe tải/container — tạm tính 10.000 kg.",
        "Capacity not provided for truck/container — assumed 10,000 kg.",
      ),
    );
  }
  const cls = tollClassIndex(req.vehicle, capacity);
  if (cls === null)
    baseWarnings.push(
      tr(
        "Xe máy không được đi cao tốc — không áp dụng trạm thu phí.",
        "Motorcycles are not allowed on expressways — toll gates are not applied.",
      ),
    );
  const peak = isPeakHour(req.departureTime);
  if (peak)
    baseWarnings.push(
      tr(
        "Khởi hành giờ cao điểm — thời gian ước tính đã cộng thêm 10%.",
        "Peak-hour departure — estimated time includes an extra 10%.",
      ),
    );

  const geometries = VARIANTS.map((v) => {
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

  // Toll gates are detected on the recommended geometry; the other variants swap some of them.
  const base = geometries[0]!;
  let ferrySkipped = false;
  const baseStations: TollStation[] =
    cls === null
      ? []
      : activeTollGates()
          .map((g) => ({ g, near: nearestVertex(base, g) }))
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
  if (ferrySkipped)
    baseWarnings.push(
      tr(
        "Đã tránh phà — tuyến đi vòng qua cầu.",
        "Ferry avoided — the route detours via a bridge.",
      ),
    );

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
    const detourKm = ferrySkipped ? 4 : 0;
    const distance = Math.round((polylineLengthKm(geometry) * ROAD_FACTOR + detourKm) * 10) / 10;
    const speed = SPEED_KMH[req.vehicle] + (distance > 80 ? 14 : 0);
    const estimatedTime = Math.round(
      ((distance / speed) * 60 * VARIANTS[v]!.timeFactor + (req.points.length - 2) * 5) *
        (peak ? 1.1 : 1),
    );
    // Snap toll markers onto this variant's polyline.
    const tollStations = stationsFor(v, geometry).map((t) => {
      if (t.lat == null || t.lng == null) return t;
      const p = geometry[nearestVertex(geometry, { lat: t.lat, lng: t.lng }).index]!;
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
      label: tr(`Tuyến ${v + 1}`, `Route ${v + 1}`),
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
export const computeMockRoute = (req: RouteRequest, calculatedAt?: string): RouteCalculation => {
  const best = computeMockRoutes(req, calculatedAt)[0]!;
  const { id: _id, label: _label, recommended: _rec, ...rest } = best;
  return rest;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockRouteProvider implements RouteProvider {
  readonly name = "mock" as const;

  async calculateRoute(req: RouteRequest) {
    await delay(700);
    return computeMockRoute(req);
  }

  async calculateRoutes(req: RouteRequest) {
    await delay(700);
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
