import type {
  LocationSuggestion,
  RouteCalculation,
  RouteRequest,
  TollStation,
  VehicleGroup,
  VehicleProfile,
} from "@/types";
import { tr } from "@/lib/i18n";

/**
 * Provider-agnostic routing contract. UI components never talk to Vietmap (or any vendor) directly:
 * they call `routingService`, which delegates to an implementation of this interface.
 */
export interface RouteProvider {
  readonly name: "vietmap" | "valhalla" | "mock";
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

export const tollClassLabel = (idx: number | null) =>
  idx === null ? "—" : tr(`Nhóm ${idx + 1}`, `Class ${idx + 1}`);

/**
 * Vietnamese toll vehicle classes (Nhóm 1..5) — Vietmap prices tolls by vehicle + gross weight, so each
 * class carries a representative weight inside its bracket. Truck: 1–5, Container: 3–5.
 */
export const VEHICLE_CLASSES: Record<
  "Truck" | "Container",
  { cls: number; kg: number; desc: string; group: VehicleGroup }[]
> = {
  Truck: [
    { cls: 1, kg: 1500, desc: "Truck < 2 t", group: "Van / Pickup" },
    { cls: 2, kg: 3000, desc: "Truck < 4 t", group: "Light Truck" },
    { cls: 3, kg: 8000, desc: "Truck < 10 t", group: "Medium Truck" },
    { cls: 4, kg: 15000, desc: "Truck < 18 t", group: "Heavy Truck" },
    { cls: 5, kg: 20000, desc: "Truck ≥ 18 t", group: "Heavy Truck" },
  ],
  Container: [
    {
      cls: 3,
      kg: 9000,
      desc: "Tractor, not towing a container",
      group: "Tractor / Container Truck",
    },
    { cls: 4, kg: 20000, desc: "Container ≤ 20 ft", group: "Tractor / Container Truck" },
    { cls: 5, kg: 30000, desc: "Container > 20 ft", group: "Tractor / Container Truck" },
  ],
};

/**
 * Vehicle Group (cost norms, list / Cost screens) follows the vehicle picked on the route map:
 * Truck by its weight class, any Container → Tractor / Container Truck.
 */
export function vehicleGroupFor(
  profile: VehicleProfile,
  chosen: number | undefined,
  capacityKg?: number,
): VehicleGroup {
  const cls = vehicleClassFor(profile, chosen, capacityKg);
  const list = profile === "Container" ? VEHICLE_CLASSES.Container : VEHICLE_CLASSES.Truck;
  return list.find((c) => c.cls === cls)?.group ?? "Medium Truck";
}

/** Class (1..5) to show for a profile: the chosen one if valid, else the one the weight implies. */
export function vehicleClassFor(
  profile: VehicleProfile,
  chosen: number | undefined,
  capacityKg?: number,
): number {
  const list = profile === "Container" ? VEHICLE_CLASSES.Container : VEHICLE_CLASSES.Truck;
  if (chosen && list.some((c) => c.cls === chosen)) return chosen;
  const derived = (tollClassIndex(profile, capacityKg) ?? 0) + 1;
  return Math.min(Math.max(derived, list[0]!.cls), list[list.length - 1]!.cls);
}

/** Toll class index used to price a request: explicit class first, else derived from weight. */
export const requestTollClass = (req: Pick<RouteRequest, "vehicle" | "capacityKg" | "tollClass">) =>
  req.tollClass ?? tollClassIndex(req.vehicle, req.capacityKg);

/** Map MoveX profile to the Vietmap Route v4 `vehicle` parameter. */
export const vietmapVehicle = (p: VehicleProfile) =>
  p.toLowerCase() as "car" | "motorcycle" | "truck" | "container";

export const inferFeeType = (name: string): TollStation["feeType"] => {
  const n = name.toLowerCase();
  if (n.includes("phà") || n.includes("ferry")) return "Ferry";
  if (n.includes("cầu") || n.includes("bridge")) return "Bridge";
  return "Toll";
};
