// The only routing entry point for UI code. Picks Vietmap when the server has a key, otherwise Mock.
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteRecord,
  RouteRequest,
  RoutePoint,
} from "@/types";
import { profileNeedsCapacity } from "@/types";
import { MockRouteProvider } from "./MockRouteProvider";
import type { RouteProvider } from "./RouteProvider";
import { RouteProviderError } from "./RouteProvider";
import { isVietmapConfigured, VietmapRouteProvider } from "./VietmapRouteProvider";

const mock = new MockRouteProvider();
let providerPromise: Promise<RouteProvider> | null = null;

export function getRouteProvider(): Promise<RouteProvider> {
  providerPromise ??= isVietmapConfigured().then((ok) => (ok ? new VietmapRouteProvider() : mock));
  return providerPromise;
}

const hasCoords = (p: RoutePoint) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!p.name.trim();

export function validateRouteInput(
  r: Pick<RouteRecord, "origin" | "destination" | "waypoints" | "vehicleProfile" | "capacityKg">,
): string | null {
  if (!hasCoords(r.origin)) return "Select an Origin from the location search.";
  if (!hasCoords(r.destination)) return "Select a Destination from the location search.";
  const bad = r.waypoints.findIndex((w) => !hasCoords(w));
  if (bad >= 0) return `Waypoint ${bad + 1} is empty — pick a location or remove it.`;
  if (profileNeedsCapacity(r.vehicleProfile) && !(r.capacityKg && r.capacityKg > 0))
    return "Capacity / Weight (kg) is required for Truck / Container.";
  return null;
}

const toRequest = (
  points: RoutePoint[],
  r: Pick<RouteRecord, "vehicleProfile" | "capacityKg">,
): RouteRequest => ({
  points: points.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
  vehicle: r.vehicleProfile,
  ...(profileNeedsCapacity(r.vehicleProfile) && r.capacityKg ? { capacityKg: r.capacityKg } : {}),
});

export interface RouteCalcResult {
  outbound: RouteCalculation;
  returnLeg: RouteCalculation | null;
}

export const routingService = {
  async providerName() {
    return (await getRouteProvider()).name;
  },

  /** Outbound: A → waypoints → B. Return (Round Trip): B → return waypoints (or reversed outbound ones) → A. */
  async calculate(r: RouteRecord): Promise<RouteCalcResult> {
    const err = validateRouteInput(r);
    if (err) throw new RouteProviderError(err, "INVALID_REQUEST");
    const provider = await getRouteProvider();
    const outbound = await provider.calculateRoute(
      toRequest([r.origin, ...r.waypoints, r.destination], r),
    );
    let returnLeg: RouteCalculation | null = null;
    if (r.type === "Round Trip") {
      const back =
        r.returnMode === "custom"
          ? r.returnWaypoints.filter(hasCoords)
          : [...r.waypoints].reverse();
      returnLeg = await provider.calculateRoute(toRequest([r.destination, ...back, r.origin], r));
    }
    return { outbound, returnLeg };
  },

  async searchLocation(text: string): Promise<LocationSuggestion[]> {
    const provider = await getRouteProvider();
    const [remote, master] = await Promise.all([
      provider.name === "vietmap"
        ? provider.searchLocation(text).catch(() => [])
        : Promise.resolve([]),
      mock.searchLocation(text),
    ]);
    return [...master, ...remote];
  },

  async resolveLocation(s: LocationSuggestion) {
    if (s.source === "master") return s;
    return (await getRouteProvider()).resolveLocation(s);
  },
};
