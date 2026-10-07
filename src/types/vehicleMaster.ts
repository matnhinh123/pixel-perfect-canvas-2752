import type { BaseRecord } from "./common";

/**
 * Vehicle master (one row per physical vehicle, keyed by plate). Not to be confused with the routing
 * "Vehicle Group / Vehicle Profile" mapping used by Routing, which stays in `mock-data/vehicles.ts`.
 * Dates are `YYYY-MM-DD`; numeric fields are kept as the text the user typed.
 */
export interface VehicleMasterRecord extends BaseRecord {
  // Vehicle identification
  vehicleType: string;
  vehicleGroup: string;
  plateNumber: string;
  chassisNumber: string;
  engineNumber: string;
  productionYear: string;
  fuelRate: string; // l/100km
  fuelCapacity: string; // liter
  // Registration and inspection
  registrationExpiry: string;
  inspectionNo: string;
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
  authorizedPayload: string; // kg
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
