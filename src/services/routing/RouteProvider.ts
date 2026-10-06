import type {
  LocationSuggestion,
  RouteCalculation,
  RouteRequest,
  TollStation,
  VehicleProfile,
} from "@/types";

/**
 * Provider-agnostic routing contract. UI components never talk to Vietmap (or any vendor) directly:
 * they call `routingService`, which delegates to an implementation of this interface.
 */
export interface RouteProvider {
  readonly name: "vietmap" | "osrm" | "mock";
  calculateRoute(req: RouteRequest): Promise<RouteCalculation>;
  /** All alternatives for the request; the first one is the recommended route. */
  calculateRoutes(req: RouteRequest): Promise<RouteCalculation[]>;
  searchLocation(text: string): Promise<LocationSuggestion[]>;
  /** Resolve a suggestion that came without coordinates (Vietmap autocomplete → place). */
  resolveLocation(s: LocationSuggestion): Promise<LocationSuggestion>;
  getRouteTolls(req: RouteRequest): Promise<{ tollCost: number; tollStations: TollStation[] }>;
}

export class RouteProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Vietnamese road toll class (Thông tư 35/2016 groups) derived from routing profile + gross weight. */
export function tollClassIndex(profile: VehicleProfile, capacityKg?: number): number | null {
  const kg = capacityKg ?? 0;
  switch (profile) {
    case "Motorcycle":
      return null;
    case "Car":
      return 0;
    case "Truck":
      if (kg < 2000) return 0;
      if (kg < 4000) return 1;
      if (kg < 10000) return 2;
      if (kg < 18000) return 3;
      return 4;
    case "Container":
      return kg <= 20000 ? 3 : 4;
  }
}

export const tollClassLabel = (idx: number | null) => (idx === null ? "—" : `Nhóm ${idx + 1}`);

/** Map MoveX profile to the Vietmap Route v4 `vehicle` parameter. */
export const vietmapVehicle = (p: VehicleProfile) =>
  p.toLowerCase() as "car" | "motorcycle" | "truck" | "container";

export const inferFeeType = (name: string): TollStation["feeType"] => {
  const n = name.toLowerCase();
  if (n.includes("phà") || n.includes("ferry")) return "Ferry";
  if (n.includes("cầu") || n.includes("bridge")) return "Bridge";
  return "Toll";
};
