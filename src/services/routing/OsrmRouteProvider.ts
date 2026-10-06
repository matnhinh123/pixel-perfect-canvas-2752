import type { LocationSuggestion, RouteCalculation, RouteRequest } from "@/types";
import { computeMockRoutes, MockRouteProvider } from "./MockRouteProvider";
import { simplify, type RoadPath } from "./roadRouting";
import { RouteProviderError, type RouteProvider } from "./RouteProvider";

/**
 * Road routing via the public OSRM demo server (OpenStreetMap data, no key, CORS enabled).
 * Geometry, distance and duration come from OSRM; toll stations, road-type split and warnings
 * still come from the mock catalog — OSRM does not return tolls.
 */
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 15000;
/** Douglas–Peucker tolerance (~5 m): visually identical, keeps localStorage records small. */
const SIMPLIFY_DEG = 0.00005;

interface OsrmRoute {
  distance: number; // m
  duration: number; // s
  geometry: { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]
}

async function fetchOsrm(req: RouteRequest, alternatives: boolean): Promise<RoadPath[]> {
  const coords = req.points.map((p) => `${p.lng},${p.lat}`).join(";");
  // OSRM only computes alternatives for two-point requests; with waypoints it returns one route.
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&alternatives=${alternatives}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch {
    throw new RouteProviderError(
      "Không kết nối được máy chủ OSRM. Kiểm tra mạng rồi thử lại.",
      "NETWORK",
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
    routes?: OsrmRoute[];
  } | null;
  if (res.status === 429)
    throw new RouteProviderError("Máy chủ OSRM đang quá tải — thử lại sau ít giây.", "RATE_LIMIT");
  if (body?.code === "NoRoute" || (body?.code === "Ok" && !body.routes?.length))
    throw new RouteProviderError("Không tìm thấy tuyến đường bộ giữa các điểm.", "ZERO_RESULTS");
  if (!res.ok || body?.code !== "Ok")
    throw new RouteProviderError(
      `OSRM lỗi: ${body?.message ?? body?.code ?? `HTTP ${res.status}`}`,
      "ERROR_UNKNOWN",
    );
  return body.routes!.map((r) => ({
    geometry: simplify(
      r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      SIMPLIFY_DEG,
    ),
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
  }));
}

const toCalcs = (req: RouteRequest, roads: RoadPath[]): RouteCalculation[] =>
  computeMockRoutes(req, new Date().toISOString(), roads).map((c, i) => ({
    ...c,
    // Exact OSRM values (computeMockRoutes rounds distance to 0.1 km already).
    distance: Math.round(roads[i]!.distanceKm * 10) / 10,
    estimatedTime: Math.round(roads[i]!.durationMin!),
    provider: "osrm" as const,
  }));

export class OsrmRouteProvider implements RouteProvider {
  readonly name = "osrm" as const;
  private readonly places = new MockRouteProvider();

  async calculateRoute(req: RouteRequest) {
    const {
      id: _id,
      label: _label,
      recommended: _rec,
      ...rest
    } = toCalcs(req, (await fetchOsrm(req, false)).slice(0, 1))[0]!;
    return rest;
  }

  async calculateRoutes(req: RouteRequest) {
    return toCalcs(req, await fetchOsrm(req, true));
  }

  searchLocation(text: string): Promise<LocationSuggestion[]> {
    return this.places.searchLocation(text);
  }

  async resolveLocation(s: LocationSuggestion) {
    return s;
  }

  async getRouteTolls(req: RouteRequest) {
    const r = await this.calculateRoute(req);
    return { tollCost: r.tollCost, tollStations: r.tollStations };
  }
}
