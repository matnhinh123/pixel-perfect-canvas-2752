// Real road geometry for the mock provider, from the public OSRM demo server (no key, CORS enabled).
// Self-contained (no imports) so scripts/gen-seed-roads.ts can run it directly with Node.

export interface RoadPath {
  geometry: [number, number][]; // [lat, lng]
  distanceKm: number;
}

type LatLng = { lat: number; lng: number };

const OSRM = "https://router.project-osrm.org/route/v1/driving";
/** Douglas–Peucker tolerance in degrees (~90 m): keeps the road shape, drops most vertices. */
const SIMPLIFY_DEG = 0.0008;

function decode(str: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0,
    lat = 0,
    lng = 0;
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let result = 0,
        shift = 0,
        b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < str.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export function encodePolyline(coords: [number, number][]): string {
  let out = "",
    pLat = 0,
    pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [la, ln] of coords) {
    const lat = Math.round(la * 1e5),
      lng = Math.round(ln * 1e5);
    enc(lat - pLat);
    enc(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

export const decodeRoad = decode;

function simplify(pts: [number, number][], tol = SIMPLIFY_DEG): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ay, ax] = pts[a]!;
    const [by, bx] = pts[b]!;
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let max = -1,
      idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = pts[i]!;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px,
        ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx > 0 && max > tol * tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

interface OsrmRoute {
  distance: number;
  geometry: string;
}

async function legAlternatives(a: LatLng, b: LatLng, alternatives: boolean): Promise<RoadPath[]> {
  const url = `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=polyline${alternatives ? "&alternatives=3" : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const body = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
  if (body.code !== "Ok" || !body.routes?.length) throw new Error(`OSRM ${body.code ?? "error"}`);
  return body.routes.map((r) => ({
    geometry: simplify(decode(r.geometry)),
    distanceKm: r.distance / 1000,
  }));
}

/**
 * Up to `count` road-following routes through all points. Each leg is routed separately; the
 * alternatives of the longest leg(s) produce the route variants (OSRM only returns alternatives
 * for two-point requests).
 */
export async function fetchRoadRoutes(points: LatLng[], count = 3): Promise<RoadPath[]> {
  if (points.length < 2) return [];
  const legs = await Promise.all(
    points.slice(1).map((b, i) => legAlternatives(points[i]!, b, count > 1)),
  );
  const order = legs
    .map((l, i) => ({ i, km: l[0]!.distanceKm }))
    .sort((x, y) => y.km - x.km)
    .map((x) => x.i);
  const choices: number[][] = [legs.map(() => 0)];
  for (const li of order) {
    for (let k = 1; k < legs[li]!.length && choices.length < count; k++) {
      const c = legs.map(() => 0);
      c[li] = k;
      choices.push(c);
    }
    if (choices.length >= count) break;
  }
  return choices.map((c) => {
    const geometry: [number, number][] = [];
    let distanceKm = 0;
    c.forEach((k, li) => {
      const leg = legs[li]![k]!;
      geometry.push(...(li === 0 ? leg.geometry : leg.geometry.slice(1)));
      distanceKm += leg.distanceKm;
    });
    return { geometry, distanceKm: Math.round(distanceKm * 10) / 10 };
  });
}
