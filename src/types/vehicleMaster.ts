import type { BaseRecord } from "./common";

/** Vehicle type per the signed scope: Tractor (đầu kéo) / Trailer (rơ moóc) / Truck (xe tải). */
export type VehicleMasterType = "Tractor" | "Trailer" | "Truck";
export const VEHICLE_MASTER_TYPES: readonly VehicleMasterType[] = ["Tractor", "Trailer", "Truck"];

/** Own fleet, or outsourced (owned by a Business Partner, usually a Vendor). */
export type VehicleOwnership = "Own" | "Outsourced";
export const VEHICLE_OWNERSHIPS: readonly VehicleOwnership[] = ["Own", "Outsourced"];

/**
 * Vehicle master (one row per physical vehicle, keyed by plate). Not to be confused with the routing
 * "Vehicle Group / Vehicle Profile" mapping used by Routing, which stays in `mock-data/vehicles.ts`.
 * Dates are `YYYY-MM-DD`; numeric fields are kept as the text the user typed.
 */
export interface VehicleMasterRecord extends BaseRecord {
  // Vehicle identification
  vehicleType: VehicleMasterType | "";
  /** Exactly one Vehicle Group (basis for norms and prices), from VEHICLE_GROUPS. */
  vehicleGroup: string;
  plateNumber: string;
  ownership: VehicleOwnership;
  /** Business Partner id; required when `ownership` is Outsourced, empty otherwise. */
  ownerId: string;
  /** Capacity (tải trọng) in kg. */
  authorizedPayload: string;
  chassisNumber: string;
  engineNumber: string;
  productionYear: string;
  fuelRate: string; // l/100km
  fuelCapacity: string; // liter
  // Documents (expiry alerts)
  /** Registration (inspection / đăng kiểm) expiry. */
  inspectionExpiry: string;
  inspectionNo: string;
  insuranceExpiry: string;
  /** Badge (phù hiệu) expiry. */
  badgeExpiry: string;
  lifetimeLimit: string;
  // Specifications
  policyNumber: string;
  tradeMark: string;
  modelCode: string;
  buyingDate: string;
  overallDimension: string; // "L×W×H" in mm
  containerDimension: string; // "L×W×H" in mm
  kerbMass: string; // kg
  rfidTag: string;
  acquisitionCost: string;
  acquisitionCurrency: string;
  contractNumber: string;
  inspectionReportNo: string;
  liabilityInsuranceNumber: string;
  fuelType: string;
  engineDisplacement: string; // cm3
  productionCountry: string;
  renovated: boolean;
  transportationBusiness: boolean;
  tachograph: boolean;
  telematics: boolean;
}
