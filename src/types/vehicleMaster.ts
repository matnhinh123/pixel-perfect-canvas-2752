import type { BaseRecord } from "./common";

/** SR-VEH-01: three fixed vehicle types (Common Code VH022 / VH023 / VH024). */
export type VehicleMasterType = "TRUCK" | "HEAD" | "TRAILER";
export const VEHICLE_MASTER_TYPES: readonly VehicleMasterType[] = ["TRUCK", "HEAD", "TRAILER"];

/** SR-VEH-21: trailer size, also the key of a head's Container Size Mapping rows. */
export type TrailerType = "20 ft" | "40 ft";
export const TRAILER_TYPES: readonly TrailerType[] = ["20 ft", "40 ft"];

/** SR-VEH-15: what group a head belongs to when it pulls a trailer of the given size. */
export interface ContainerSizeMapping {
  rid: string;
  trailerType: TrailerType | "";
  vehicleGroup: string;
}

/**
 * Vehicle master: one row per physical vehicle (trucks, heads and trailers alike), keyed by plate.
 * Not to be confused with the routing "Vehicle Group / Vehicle Profile" mapping used by Routing.
 * Dates are `YYYY-MM-DD`; numeric fields are kept as the text the user typed.
 */
export interface VehicleMasterRecord extends BaseRecord {
  // Vehicle identification
  vehicleType: VehicleMasterType | "";
  /** TRUCK only (Group 01 → Group 05). */
  vehicleGroup: string;
  /** TRUCK only, required: commercial load class (Common Code TRUCK_TYPE). */
  truckType: string;
  /** TRAILER only: 20 ft / 40 ft. */
  trailerType: TrailerType | "";
  plateNumber: string;
  chassisNumber: string;
  /** Not for TRAILER. */
  engineNumber: string;
  productionYear: string;
  fuelRate: string; // l/100km — not for TRAILER
  fuelCapacity: string; // liter — not for TRAILER
  // Registration & inspection
  registrationExpiry: string;
  inspectionNo: string;
  /** Inspection (đăng kiểm) expiry. */
  inspectionExpiry: string;
  lifetimeLimit: string;
  // Specifications
  policyNumber: string;
  tradeMark: string;
  modelCode: string;
  buyingDate: string;
  overallDimension: string; // "L×W×H" in mm
  containerDimension: string; // "L×W×H" in mm
  kerbMass: string; // kg
  /** Authorized payload (kg, legal), independent of Truck Type. */
  authorizedPayload: string;
  rfidTag: string;
  acquisitionCost: string;
  acquisitionCurrency: string;
  contractNumber: string;
  /** Required for every vehicle. */
  inspectionReportNo: string;
  liabilityInsuranceNumber: string;
  fuelType: string; // not for TRAILER
  engineDisplacement: string; // cm3 — not for TRAILER
  /** HEAD only (kg). */
  authorizedTowedMass: string;
  productionCountry: string;
  renovated: boolean;
  transportationBusiness: boolean;
  tachograph: boolean;
  telematics: boolean;
  /** HEAD only. */
  containerMappings: ContainerSizeMapping[];
}
