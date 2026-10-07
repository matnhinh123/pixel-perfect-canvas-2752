// Pure mapping from Vietmap API v4 payloads to the MoveX model. Runs on the server proxy.
// Contract checked against https://maps.vietmap.vn/docs/map-api/route-version/route-v4/
// (Route v3 / Route Tolls / v1.1 are deprecated — not used).
import type { LocationSuggestion, RouteCalculation, RouteRequest, TollStation } from "@/types";
import { bboxOf, decodePolyline, pointAlong } from "./geo";
import { inferFeeType, requestTollClass, tollClassLabel } from "./RouteProvider";

export interface VietmapToll {
  id?: number | string;
  name?: string;
  address?: string;
  type?: string;
  price?: number;
}

export interface VietmapPath {
  distance?: number; // meters
  time?: number; // ms
  points_encoded?: boolean;
  bbox?: number[];
  points?: unknown;
  instructions?: { distance?: number; time?: number; text?: string; street_name?: string }[];
  toll_cost?: number;
  tolls?: VietmapToll[];
}

export interface VietmapRouteResponse {
  code?: string;
  messages?: string | null;
  paths?: VietmapPath[];
}

/** Accept every documented geometry shape: encoded string, GeoJSON LineString, or raw coordinate array. */
export function toLatLngGeometry(
  points: unknown,
  encoded: boolean | undefined,
): [number, number][] {
  if (typeof points === "string") return decodePolyline(points);
  const raw: unknown =
    points && typeof points === "object" && "coordinates" in points
      ? (points as { coordinates: unknown }).coordinates
      : points;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is [number, number] =>
        Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number",
    )
    .map(([a, b]) => {
      // Vietnam: lat 8..24, lng 102..110 — use the value range to detect [lng,lat] vs [lat,lng].
      if (encoded === false && a > 90) return [b, a] as [number, number];
      return a > 90 ? ([b, a] as [number, number]) : ([a, b] as [number, number]);
    });
}

/** Split distance by road class from instruction street names (QL = national, CT/Cao tốc = expressway). */
export function classifyRoads(ins: { distance?: number; street_name?: string; text?: string }[]) {
  const out = { national: 0, expressway: 0, other: 0 };
  for (const i of ins) {
    const name = `${i.street_name ?? ""} ${i.text ?? ""}`.toLowerCase();
    const km = (i.distance ?? 0) / 1000;
    if (/cao tốc|\bct\b|expressway/.test(name)) out.expressway += km;
    else if (/quốc lộ|\bql\s?\d|national/.test(name)) out.national += km;
    else out.other += km;
  }
  return {
    national: Math.round(out.national),
    expressway: Math.round(out.expressway),
    other: Math.round(out.other),
  };
}

/** Every path Vietmap returned, as MoveX alternatives (the first path is the recommended one). */
export function normalizeVietmapRoutes(
  res: VietmapRouteResponse,
  req: RouteRequest,
): RouteCalculation[] {
  const n = Math.max(1, res.paths?.length ?? 0);
  return Array.from({ length: n }, (_, i) => ({
    ...normalizeVietmapRoute(res, req, i),
    id: `ALT-${i + 1}`,
    label: `Tuyến ${i + 1}`,
    recommended: i === 0,
  }));
}

export function normalizeVietmapRoute(
  res: VietmapRouteResponse,
  req: RouteRequest,
  index = 0,
): RouteCalculation {
  const path = res.paths?.[index];
  if (!path)
    throw new Error(res.messages || `Vietmap returned no route (${res.code ?? "ZERO_RESULTS"})`);
  const geometry = toLatLngGeometry(path.points, path.points_encoded);
  const cls = requestTollClass(req);
  const tolls = path.tolls ?? [];
  const tollStations: TollStation[] = tolls.map((t, i) => {
    // Vietmap v4 does not return toll coordinates — spread markers along the path and flag them as approximate.
    const pos = pointAlong(geometry, (i + 1) / (tolls.length + 1));
    return {
      id: String(t.id ?? i),
      name: t.name ?? `Toll ${i + 1}`,
      address: t.address ?? "",
      feeType: inferFeeType(t.name ?? ""),
      price: t.price ?? 0,
      vehicleTollGroup: tollClassLabel(cls),
      passCount: 1,
      source: "Vietmap",
      ...(pos ? { lat: pos.lat, lng: pos.lng, positionApproximate: true } : {}),
    };
  });
  const summed = tollStations.reduce((s, t) => s + t.price * t.passCount, 0);
  const warnings: string[] = [];
  if (res.messages) warnings.push(String(res.messages));
  if (typeof path.toll_cost === "number" && path.toll_cost !== summed)
    warnings.push(
      `Vietmap toll_cost (${path.toll_cost}) differs from the sum of toll gates (${summed}); using toll_cost.`,
    );
  if (tollStations.some((t) => t.positionApproximate))
    warnings.push(
      "Toll station positions on the map are approximate (Vietmap does not return toll coordinates).",
    );

  const bb = path.bbox;
  return {
    distance: Math.round(((path.distance ?? 0) / 1000) * 10) / 10,
    estimatedTime: Math.round((path.time ?? 0) / 60000),
    geometry,
    bbox: bb && bb.length === 4 ? [bb[0]!, bb[1]!, bb[2]!, bb[3]!] : bboxOf(geometry),
    instructions: (path.instructions ?? []).map((ins) => ({
      text: ins.text ?? "",
      distanceM: ins.distance ?? 0,
      timeMs: ins.time ?? 0,
      ...(ins.street_name ? { streetName: ins.street_name } : {}),
    })),
    tollCost: typeof path.toll_cost === "number" ? path.toll_cost : summed,
    tollStations,
    warnings,
    roadTypes: classifyRoads(path.instructions ?? []),
    provider: "vietmap",
    calculatedAt: new Date().toISOString(),
  };
}

export function normalizeVietmapAutocomplete(items: unknown): LocationSuggestion[] {
  if (!Array.isArray(items)) return [];
  return items.map(
    (it: { ref_id?: string; name?: string; address?: string; display?: string }, i) => ({
      id: it.ref_id ?? String(i),
      name: it.name ?? it.display ?? "",
      address: it.address ?? it.display ?? "",
      source: "vietmap" as const,
    }),
  );
}

export function normalizeVietmapPlace(
  p: { lat?: number; lng?: number; name?: string; display?: string; address?: string },
  refId: string,
): LocationSuggestion {
  if (typeof p.lat !== "number" || typeof p.lng !== "number")
    throw new Error("Vietmap place has no coordinates");
  return {
    id: refId,
    name: p.name ?? p.display ?? "",
    address: p.display ?? p.address ?? "",
    lat: p.lat,
    lng: p.lng,
    source: "vietmap",
  };
}
