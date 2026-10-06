// Server-only Vietmap client. The API key lives in the VIETMAP_API_KEY environment variable and
// never reaches the browser — the frontend only calls the internal /api/vietmap/* proxy.
import type { RouteRequest } from "@/types";
import { vietmapVehicle } from "@/services/routing/RouteProvider";
import {
  normalizeVietmapAutocomplete,
  normalizeVietmapPlace,
  normalizeVietmapRoute,
  normalizeVietmapRoutes,
  type VietmapRouteResponse,
} from "@/services/routing/vietmapNormalize";

const BASE = "https://maps.vietmap.vn/api";

export const getVietmapKey = () => {
  const key = typeof process !== "undefined" ? process.env["VIETMAP_API_KEY"] : undefined;
  return key && key.trim() ? key.trim() : null;
};

export class VietmapHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function getJson(url: URL) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new VietmapHttpError(
      `Vietmap returned a non-JSON response (HTTP ${res.status})`,
      502,
      "BAD_GATEWAY",
    );
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string; messages?: string })?.message ??
      (body as { messages?: string })?.messages;
    throw new VietmapHttpError(
      msg || `Vietmap HTTP ${res.status}`,
      res.status === 401 || res.status === 403 ? 502 : res.status,
      "VIETMAP_ERROR",
    );
  }
  return body;
}

export async function vietmapRoute(req: RouteRequest, key: string) {
  return normalizeVietmapRoute(await fetchVietmapRoute(req, key), req);
}

export async function vietmapRoutes(req: RouteRequest, key: string) {
  return normalizeVietmapRoutes(await fetchVietmapRoute(req, key), req);
}

async function fetchVietmapRoute(req: RouteRequest, key: string) {
  const url = new URL(`${BASE}/route/v4`);
  url.searchParams.set("apikey", key);
  for (const p of req.points) url.searchParams.append("point", `${p.lat},${p.lng}`);
  url.searchParams.set("vehicle", vietmapVehicle(req.vehicle));
  // Route v4: `capacity` (gross weight, kg) is required for truck / container.
  if ((req.vehicle === "Truck" || req.vehicle === "Container") && req.capacityKg)
    url.searchParams.set("capacity", String(Math.round(req.capacityKg)));
  url.searchParams.set("points_encoded", "true");
  url.searchParams.set("annotations", "toll");
  const body = (await getJson(url)) as VietmapRouteResponse;
  if (body.code && body.code !== "OK")
    throw new VietmapHttpError(body.messages || body.code, 422, body.code);
  return body;
}

export async function vietmapSearch(text: string, key: string) {
  const url = new URL(`${BASE}/autocomplete/v4`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("text", text);
  url.searchParams.set("display_type", "1");
  return normalizeVietmapAutocomplete(await getJson(url));
}

export async function vietmapPlace(refId: string, key: string) {
  const url = new URL(`${BASE}/place/v4`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("refid", refId);
  return normalizeVietmapPlace((await getJson(url)) as Record<string, never>, refId);
}
