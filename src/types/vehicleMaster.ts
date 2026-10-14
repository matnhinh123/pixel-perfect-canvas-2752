import type { BaseRecord } from "./common";

/**
 * SR-VEH-01: the three base vehicle types. Common Code Vehicle Type may add more types; each new
 * type names one of these as its attribute (which fields the form shows).
 */
export type VehicleMasterType = "TRUCK" | "HEAD" | "TRAILER";
export const VEHICLE_MASTER_TYPES: readonly VehicleMasterType[] = ["TRUCK", "HEAD", "TRAILER"];

/** Vehicle Type names shown and stored (Common Code options); HEADER is the base type HEAD. */
export const VEHICLE_TYPE_NAMES = ["TRUCK", "HEADER", "TRAILER"] as const;
/** Base type behind each system Vehicle Type name (old stored "HEAD" included). */
export const BASE_OF_TYPE_NAME: Record<string, VehicleMasterType> = {
  TRUCK: "TRUCK",
  HEADER: "HEAD",
  HEAD: "HEAD",
  TRAILER: "TRAILER",
};

/** SR-VEH-21: trailer size, also the key of a head's Container Size Mapping rows. */
/** Default trailer sizes; Common Code "Vehicle - Trailer Size" may add more (e.g. 45 ft). */
export type TrailerType = string;
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
  /** A base type or a type added in Common Code (its attribute is the base type). */
  vehicleType: string;
  /** TRUCK only (Group 01 → Group 05). */
  vehicleGroup: string;
  /** TRUCK only, required: commercial load class (Common Code TRUCK_TYPE). */
  truckType: string;
  /** TRAILER only: body type (Skeletal, Flatbed…), Common Code "Vehicle - Trailer Type". */
  trailerType: string;
  plateNumber: string;
  chassisNumber: string;
  /** Not for TRAILER. */
  engineNumber: string;
  /** Brand (manufacturer), Common Code "Vehicle Brand". */
  tradeMark: string;
  modelCode: string;
  /** With Lifetime Limit: a vehicle past its legal service life cannot be dispatched. */
  productionYear: string;
  // Fuel (not for TRAILER): fuel cost norm and max distance between refuels
  fuelType: string;
  fuelRate: string; // l/100km
  fuelCapacity: string; // liter
  /** TRAILER only (Specifications): Common Code "Vehicle - Trailer Size". */
  trailerSize: string;
  /** TRAILER only: number of axles (whole number). */
  trailerAxles: string;
  // Registration & inspection: an expired document blocks dispatch
  registrationExpiry: string;
  /** Vehicle inspection (management) number on the inspection certificate. */
  inspectionNo: string;
  /** Inspection certificate number; required for every vehicle. */
  inspectionReportNo: string;
  /** Inspection (đăng kiểm) expiry. */
  inspectionExpiry: string;
  lifetimeLimit: string;
  // Dimensions & weight: route clearance, weigh stations, loading a trip
  overallDimension: string; // "L×W×H" in mm
  containerDimension: string; // "L×W×H" in mm
  kerbMass: string; // kg
  /** Authorized payload (kg, legal), independent of Truck Type. */
  authorizedPayload: string;
  /** HEAD only (kg). */
  authorizedTowedMass: string;
  // Insurance
  policyNumber: string;
  liabilityInsuranceNumber: string;
  // Asset (depreciation for Fixed Cost)
  buyingDate: string;
  acquisitionCost: string;
  acquisitionCurrency: string;
  contractNumber: string;
  /** HEAD only. */
  containerMappings: ContainerSizeMapping[];
}
