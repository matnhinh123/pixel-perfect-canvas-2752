// The only routing entry point for UI code. Picks Vietmap when the server has a key, otherwise Mock.
import type {
  LocationSuggestion,
  RouteCalculation,
  RouteRecord,
  RouteRequest,
  RoutePoint,
  TollStation,
} from "@/types";
import { profileNeedsCapacity } from "@/types";
import { findVehicle } from "@/mock-data/vehicles";
import { activeTollGates } from "@/services/routing/tollGates";
import { MockRouteProvider } from "./MockRouteProvider";
import type { RouteProvider } from "./RouteProvider";
import { RouteProviderError } from "./RouteProvider";
import { isVietmapConfigured, VietmapRouteProvider } from "./VietmapRouteProvider";
import { normalizeText } from "./locationSearch";
import { ValhallaRouteProvider } from "./ValhallaRouteProvider";

const mock = new MockRouteProvider();
let providerPromise: Promise<RouteProvider> | null = null;

export function getRouteProvider(): Promise<RouteProvider> {
  providerPromise ??= isVietmapConfigured().then((ok) =>
    ok ? new VietmapRouteProvider() : new ValhallaRouteProvider(),
  );
  return providerPromise;
}

export const hasCoords = (p: RoutePoint) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!p.name.trim();

type CalcInput = Pick<
  RouteRecord,
  | "type"
  | "origin"
  | "destination"
  | "waypoints"
  | "returnMode"
  | "returnWaypoints"
  | "returnStart"
  | "returnEnd"
  | "vehicleId"
  | "vehicleProfile"
  | "capacityKg"
  | "departureTime"
  | "avoidFerry"
  | "terrain"
>;

/** Why "Tính lại lộ trình" cannot run yet, or null when the input is complete. */
export function validateRouteInput(r: CalcInput): string | null {
  if (!hasCoords(r.origin)) return "Choose the Origin from the suggestions.";
  if (!hasCoords(r.destination)) return "Choose the Destination from the suggestions.";
  const bad = r.waypoints.findIndex((w) => !hasCoords(w));
  if (bad >= 0) return `Stop ${bad + 1} has no location — choose one or remove the row.`;
  return null;
}

const toRequest = (points: RoutePoint[], r: CalcInput): RouteRequest => {
  // Vehicle Master is the source of truth for profile and weight.
  const v = findVehicle(r.vehicleId);
  // The route-level profile (travel-mode tabs on the map) wins over the vehicle's default one.
  const vehicle = r.vehicleProfile ?? v?.profile;
  const kg = v?.weightKg ?? r.capacityKg;
  return {
    points: points.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
    vehicle,
    ...(profileNeedsCapacity(vehicle) && kg ? { capacityKg: kg } : {}),
    avoidFerry: r.avoidFerry,
    ...(r.departureTime ? { departureTime: r.departureTime } : {}),
  };
};

/** Match provider toll gates to Toll Station master data by name ("Đã đối chiếu" / "Chưa đối chiếu"). */
function reconcile(stations: TollStation[]): TollStation[] {
  return stations.map((t) => {
    if (t.reconciled !== undefined) return t;
    const n = normalizeText(t.name);
    const g = activeTollGates().find((x) => {
      const m = normalizeText(x.name);
      return m === n || n.includes(m) || m.includes(n);
    });
    return g ? { ...t, code: g.code, reconciled: true } : { ...t, reconciled: false };
  });
}
const reconcileCalc = (c: RouteCalculation): RouteCalculation => ({
  ...c,
  tollStations: reconcile(c.tollStations),
});

/** Highland (cao nguyên) roads are slower: add 25% to the estimated time. */
const HIGHLAND_TIME_FACTOR = 1.25;
const applyTerrain = (c: RouteCalculation, terrain?: RouteRecord["terrain"]): RouteCalculation =>
  terrain === "Highland"
    ? {
        ...c,
        estimatedTime: Math.round(c.estimatedTime * HIGHLAND_TIME_FACTOR),
        warnings: [...c.warnings, "Highland terrain — estimated time increased by 25%."],
      }
    : c;

/** Custom return route as one sequence: start (default B) → return stops → end (default A). */
export const returnSequence = (
  r: Pick<RouteRecord, "origin" | "destination" | "returnWaypoints" | "returnStart" | "returnEnd">,
): RoutePoint[] => [r.returnStart ?? r.destination, ...r.returnWaypoints, r.returnEnd ?? r.origin];

/** Return leg of "Same route reversed": the outbound leg B → A — identical distance, time and tolls. */
export function reverseLeg(c: RouteCalculation): RouteCalculation {
  const { id: _id, label: _label, recommended: _rec, ...leg } = c;
  return {
    ...leg,
    geometry: [...c.geometry].reverse(),
    instructions: [],
    tollStations: [...c.tollStations].reverse(),
    warnings: [],
  };
}

export interface RouteCalcResult {
  alternatives: RouteCalculation[];
  returnLeg: RouteCalculation | null;
}

export const routingService = {
  async providerName() {
    return (await getRouteProvider()).name;
  },

  /** Outbound alternatives: A → waypoints → B. Return (Round Trip): B → return waypoints (or reversed outbound ones) → A. */
  async calculate(r: CalcInput): Promise<RouteCalcResult> {
    const err = validateRouteInput(r);
    if (err) throw new RouteProviderError(err, "INVALID_REQUEST");
    const provider = await getRouteProvider();
    const alternatives = (
      await provider.calculateRoutes(toRequest([r.origin, ...r.waypoints, r.destination], r))
    ).map((c) => applyTerrain(reconcileCalc(c), r.terrain));
    if (alternatives.length === 0)
      throw new RouteProviderError("No suitable route found.", "ZERO_RESULTS");
    // Always computed so Single / Round totals can both be shown after one calculation.
    // "Same route reversed" is exactly the outbound route driven back (same km, time, tolls);
    // only a custom return route is routed again.
    const best = alternatives.find((a) => a.recommended) ?? alternatives[0]!;
    const returnLeg =
      r.returnMode === "custom"
        ? applyTerrain(
            reconcileCalc(
              await provider.calculateRoute(
                toRequest(
                  [
                    r.returnStart && hasCoords(r.returnStart) ? r.returnStart : r.destination,
                    ...r.returnWaypoints.filter(hasCoords),
                    r.returnEnd && hasCoords(r.returnEnd) ? r.returnEnd : r.origin,
                  ],
                  r,
                ),
              ),
            ),
            r.terrain,
          )
        : reverseLeg(best);
    return { alternatives, returnLeg };
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
