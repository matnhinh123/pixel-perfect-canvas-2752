import type { LocationSuggestion, RouteCalculation, RouteRequest } from "@/types";
import { RouteProviderError, type RouteProvider } from "./RouteProvider";

/**
 * Browser-side Vietmap provider. It never sees the API key: it calls the internal proxy
 * (/api/vietmap/*), which calls Vietmap Route v4 / Autocomplete v4 / Place v4 and returns MoveX models.
 */
export class VietmapRouteProvider implements RouteProvider {
  readonly name = "vietmap" as const;

  constructor(private readonly base = "/api/vietmap") {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/${path}`, init);
    } catch {
      throw new RouteProviderError(
        "Cannot reach the routing service. Check your connection.",
        "NETWORK",
      );
    }
    const body = (await res.json().catch(() => null)) as
      (T & { code?: string; message?: string }) | null;
    if (!res.ok || !body)
      throw new RouteProviderError(
        body?.message ?? `Routing service error (HTTP ${res.status})`,
        body?.code ?? "ERROR_UNKNOWN",
      );
    return body;
  }

  calculateRoute(req: RouteRequest) {
    return this.call<RouteCalculation>("route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  searchLocation(text: string) {
    return this.call<LocationSuggestion[]>(`search?text=${encodeURIComponent(text)}`);
  }

  async resolveLocation(s: LocationSuggestion) {
    if (typeof s.lat === "number" && typeof s.lng === "number") return s;
    return this.call<LocationSuggestion>(`place?refid=${encodeURIComponent(s.id)}`);
  }

  async getRouteTolls(req: RouteRequest) {
    const r = await this.calculateRoute(req);
    return { tollCost: r.tollCost, tollStations: r.tollStations };
  }
}

export async function isVietmapConfigured(base = "/api/vietmap"): Promise<boolean> {
  try {
    const res = await fetch(`${base}/status`);
    if (!res.ok) return false;
    const body = (await res.json()) as { configured?: boolean };
    return body.configured === true;
  } catch {
    return false;
  }
}
