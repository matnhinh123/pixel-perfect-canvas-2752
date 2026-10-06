import { LOCATIONS } from "@/mock-data/locations";
import { MOCK_TOLL_GATES } from "@/mock-data/tollCatalog";
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteInstruction,
  RouteRequest,
  TollStation,
} from "@/types";
import { bboxOf, haversineKm, nearestVertex, polylineLengthKm } from "./geo";
import {
  RouteProviderError,
  tollClassIndex,
  tollClassLabel,
  type RouteProvider,
} from "./RouteProvider";

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

export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

function curvedSegment(a: [number, number], b: [number, number], steps = 24): [number, number][] {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  // Deterministic gentle bend so the same request always yields the same geometry.
  const sign = Math.sin(a[0] * 37 + b[1] * 11) > 0 ? 1 : -1;
  const k = 0.07 * sign;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bend = Math.sin(Math.PI * t) * k;
    out.push([a[0] + dy * t + dx * bend, a[1] + dx * t - dy * bend]);
  }
  return out;
}

/** Synchronous core, also used to build seed data so seeded numbers match a recalculation. */
export function computeMockRoute(
  req: RouteRequest,
  calculatedAt = new Date().toISOString(),
): RouteCalculation {
  if (req.points.length < 2)
    throw new RouteProviderError(
      "At least an origin and a destination are required.",
      "INVALID_REQUEST",
    );
  const first = req.points[0]!;
  const last = req.points[req.points.length - 1]!;
  if (req.points.length === 2 && haversineKm(first, last) < 0.05)
    throw new RouteProviderError("Origin and destination are the same location.", "ZERO_RESULTS");

  const warnings: string[] = [];
  const geometry: [number, number][] = [];
  for (let i = 1; i < req.points.length; i++) {
    const a = req.points[i - 1]!;
    const b = req.points[i]!;
    // ~1 vertex per 2 km so toll-gate proximity checks work on long legs too.
    const steps = Math.max(24, Math.ceil(haversineKm(a, b) / 2));
    const seg = curvedSegment([a.lat, a.lng], [b.lat, b.lng], steps);
    geometry.push(...(i === 1 ? seg : seg.slice(1)));
  }

  const distance = Math.round(polylineLengthKm(geometry) * ROAD_FACTOR * 10) / 10;
  const speed = SPEED_KMH[req.vehicle] + (distance > 80 ? 14 : 0);
  const estimatedTime = Math.round((distance / speed) * 60 + (req.points.length - 2) * 5);

  let capacity = req.capacityKg;
  if ((req.vehicle === "Truck" || req.vehicle === "Container") && !capacity) {
    capacity = 10000;
    warnings.push("Capacity not provided for truck/container — assumed 10,000 kg.");
  }
  const cls = tollClassIndex(req.vehicle, capacity);
  const tollStations: TollStation[] = [];
  if (cls === null) {
    warnings.push("Motorcycles are not allowed on expressways — toll gates are not applied.");
  } else {
    const hits = MOCK_TOLL_GATES.map((g) => ({ g, near: nearestVertex(geometry, g) }))
      .filter((h) => h.near.km < 3.5)
      .sort((x, y) => x.near.index - y.near.index);
    for (const { g, near } of hits) {
      const v = geometry[near.index]!;
      tollStations.push({
        id: g.id,
        code: g.code,
        name: g.name,
        address: g.address,
        feeType: g.feeType,
        price: g.prices[cls]!,
        vehicleTollGroup: tollClassLabel(cls),
        passCount: 1,
        source: "Mock",
        lat: v[0],
        lng: v[1],
      });
    }
  }

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
    distance,
    estimatedTime,
    geometry,
    bbox: bboxOf(geometry),
    instructions,
    tollCost: tollStations.reduce((s, t) => s + t.price * t.passCount, 0),
    tollStations,
    warnings,
    roadTypes: mockRoadTypes(distance, req.vehicle),
    provider: "mock",
    calculatedAt,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockRouteProvider implements RouteProvider {
  readonly name = "mock" as const;

  async calculateRoute(req: RouteRequest) {
    await delay(700);
    return computeMockRoute(req);
  }

  async searchLocation(text: string): Promise<LocationSuggestion[]> {
    await delay(150);
    const q = normalizeText(text.trim());
    if (q.length < 1)
      return LOCATIONS.slice(0, 12).map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        lat: l.lat,
        lng: l.lng,
        source: "master" as const,
      }));
    return LOCATIONS.filter((l) => normalizeText(`${l.name} ${l.address}`).includes(q))
      .slice(0, 8)
      .map((l) => ({
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
