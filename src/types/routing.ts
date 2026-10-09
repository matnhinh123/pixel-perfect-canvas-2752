import type { BaseRecord } from "./common";

/** Terrain of the route: highland (cao nguyên) is slower than plain (đồng bằng). */
export type Terrain = "Plain" | "Highland";
export type RouteType = "Single Trip" | "Round Trip";

/**
 * Vehicle Profile = what the ROUTING API understands (Vietmap `vehicle` param).
 * Never use it for business rules (cost rates, toll class) — use VehicleGroup for that.
 */
export type VehicleProfile = "Car" | "Motorcycle" | "Truck" | "Container";

/** Vehicle Group = MoveX internal business classification (cost rates, toll class, pricing). */
export type VehicleGroup =
  "Van / Pickup" | "Light Truck" | "Medium Truck" | "Heavy Truck" | "Tractor / Container Truck";

/** Profiles selectable in the UI: only trucks and containers are operated. */
export const VEHICLE_PROFILES: VehicleProfile[] = ["Truck", "Container"];
export const VEHICLE_GROUPS: VehicleGroup[] = [
  "Van / Pickup",
  "Light Truck",
  "Medium Truck",
  "Heavy Truck",
  "Tractor / Container Truck",
];
export const profileNeedsCapacity = (p: VehicleProfile) => p === "Truck" || p === "Container";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A stop on a route. `locationId` links to Location master data when picked from it. */
export interface RoutePoint extends GeoPoint {
  name: string;
  address?: string;
  locationId?: string;
  /** Free text shown in the stop list ("Địa chỉ / Ghi chú"). */
  note?: string;
  /** User label for the Stop Type column (e.g. "Pickup"); default label when unset. */
  stopType?: string;
}

/** Vehicle master record. Group / weight / routing profile / toll class all derive from it. */
export interface VehicleRecord {
  id: string;
  plate: string;
  name: string;
  /** English name when `name` is Vietnamese (shown when the UI is in English). */
  nameEn?: string;
  group: VehicleGroup;
  weightKg: number;
  /** Routing API profile (Vietmap `vehicle` param). */
  profile: VehicleProfile;
}

export interface LocationRecord extends GeoPoint {
  id: string;
  /** Short location code (e.g. VNCPH) — searchable in the stop pickers. */
  code?: string;
  name: string;
  address: string;
  province: string;
}

/** "Gate" = custom / gate fee (e.g. port or industrial-park gate), entered on a route by the user. */
export type FeeType = "Toll" | "Bridge" | "Ferry" | "Gate";
export const FEE_TYPES: FeeType[] = ["Toll", "Bridge", "Ferry", "Gate"];
export type TollSource = "Vietmap" | "Mock" | "Manual";

/** Normalized toll station (MoveX model), produced by any RouteProvider. */
export interface TollStation {
  id: string;
  /** Toll station master code, e.g. QL1A-PT. */
  code?: string;
  name: string;
  address?: string;
  feeType: FeeType;
  price: number;
  /** Vietnamese toll class (Nhóm 1..5) the price applies to. */
  vehicleTollGroup: string;
  passCount: number;
  source: TollSource;
  /** Not all providers return coordinates for toll gates (Vietmap v4 does not). */
  lat?: number;
  lng?: number;
  positionApproximate?: boolean;
  /** Matched against Toll Station master data ("Đã đối chiếu"). */
  reconciled?: boolean;
  /** Added by the user via "Add Toll" for one direction only (not mirrored to the other leg). */
  addedTo?: "Outbound" | "Return";
}

export interface RouteInstruction {
  text: string;
  distanceM: number;
  timeMs: number;
  streetName?: string;
}

/** Normalized result of a routing call — the MoveX contract every provider must return. */
export interface RouteCalculation {
  distance: number; // km
  estimatedTime: number; // minutes
  geometry: [number, number][]; // [lat, lng]
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  instructions: RouteInstruction[];
  tollCost: number;
  tollStations: TollStation[];
  warnings: string[];
  /** Distance split by road class (km) — "Địa hình tuyến đường". */
  roadTypes: RoadTypeSplit;
  provider: "vietmap" | "valhalla" | "mock";
  calculatedAt: string;
  /** Set when the result is one of several alternatives returned for the same request. */
  id?: string;
  label?: string;
  recommended?: boolean;
}

export interface RoadTypeSplit {
  national: number;
  expressway: number;
  other: number;
}

export interface RouteRequest {
  points: (GeoPoint & { name?: string })[];
  vehicle: VehicleProfile;
  capacityKg?: number | undefined;
  /** Toll class index 0..4 (Nhóm 1..5) chosen by the user; wins over the class derived from weight. */
  tollClass?: number;
  avoidFerry?: boolean;
  /** Local date-time "YYYY-MM-DDTHH:mm". */
  departureTime?: string;
}

export type ManualCostType = "Ferry" | "Peak-hour surcharge" | "Other route cost";
export const MANUAL_COST_TYPES: ManualCostType[] = [
  "Ferry",
  "Peak-hour surcharge",
  "Other route cost",
];

export interface ManualCost {
  id: string;
  costType: ManualCostType;
  amount: number;
  reason: string;
  note?: string;
}

/** A leg's toll lines can be overridden by the user only in Custom return mode. */
export interface CustomReturnOverride {
  distance: number;
  estimatedTime: number;
  tollStations: TollStation[];
}

export interface RouteRecord extends BaseRecord {
  code: string;
  name: string;
  description: string;
  type: RouteType;
  origin: RoutePoint;
  waypoints: RoutePoint[];
  destination: RoutePoint;
  /** Vehicle master id. Profile / group / capacity below are copied from it for Cost & list screens. */
  vehicleId?: string;
  vehicleProfile: VehicleProfile;
  vehicleGroup: VehicleGroup;
  capacityKg?: number | undefined;
  /** Local date-time "YYYY-MM-DDTHH:mm". */
  departureTime: string;
  avoidFerry: boolean;
  /** Outbound alternatives from the last calculation; `outbound` is the selected one. */
  alternatives: RouteCalculation[];
  selectedRouteId: string | null;
  outbound: RouteCalculation | null;
  returnMode: "auto" | "custom";
  returnWaypoints: RoutePoint[];
  /** Vehicle class 1..5 picked on the route map (Truck 1–5, Container 3–5). */
  vehicleClass?: number;
  /** Custom return route only: start / end when they differ from the outbound destination / origin. */
  returnStart?: RoutePoint;
  returnEnd?: RoutePoint;
  returnLeg: RouteCalculation | null;
  /** Used only when returnMode === "custom": manual figures that win over the calculated return leg. */
  customReturn?: CustomReturnOverride;
  manualCosts: ManualCost[];
  /** User-adjusted total distance (km) per route type; wins over the calculated one, cleared on recalculation. */
  distanceOverrides?: Partial<Record<RouteType, number>>;
  /** User-adjusted total estimated time (minutes) per route type; same rules as distanceOverrides. */
  timeOverrides?: Partial<Record<RouteType, number>>;
  /** Default "Plain". */
  terrain?: Terrain;
}

export interface LocationSuggestion {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  source: "vietmap" | "master";
}
