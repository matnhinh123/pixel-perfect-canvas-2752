import type { GeoPoint } from "@/types";

const R = 6371; // km

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function polylineLengthKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i - 1]!;
    const q = coords[i]!;
    total += haversineKm({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] });
  }
  return total;
}

export function bboxOf(coords: [number, number][]): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let minLat = Infinity,
    minLng = Infinity,
    maxLat = -Infinity,
    maxLng = -Infinity;
  for (const [lat, lng] of coords) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Decode a Google/GraphHopper encoded polyline (precision 1e5, lat/lng order). */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
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
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

/** Index + distance (km) of the geometry vertex closest to `p`. */
export function nearestVertex(
  coords: [number, number][],
  p: GeoPoint,
): { index: number; km: number } {
  let best = { index: -1, km: Infinity };
  coords.forEach(([lat, lng], i) => {
    const km = haversineKm(p, { lat, lng });
    if (km < best.km) best = { index: i, km };
  });
  return best;
}

/** Point at fraction t (0..1) along a polyline — used to place toll markers that lack coordinates. */
export function pointAlong(coords: [number, number][], t: number): GeoPoint | null {
  if (coords.length === 0) return null;
  const total = polylineLengthKm(coords);
  let target = total * Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i - 1]!;
    const q = coords[i]!;
    const seg = haversineKm({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] });
    if (target <= seg) {
      const f = seg === 0 ? 0 : target / seg;
      return { lat: p[0] + (q[0] - p[0]) * f, lng: p[1] + (q[1] - p[1]) * f };
    }
    target -= seg;
  }
  const last = coords[coords.length - 1]!;
  return { lat: last[0], lng: last[1] };
}
