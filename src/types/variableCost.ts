import type { BaseRecord } from "./common";

/** One distance tier of a Salary Range. */
export interface SalaryTier {
  from: number;
  to: number;
  /** Salary of a trip whose standard distance falls in the tier. */
  tripSalary: number;
  /** Paid per km driven beyond the standard distance (đ/km). */
  extraRate: number;
  /** The same for a reefer container — CNTR lạnh (đ/km); empty: the extra rate. */
  reeferRate?: number;
  roadSupportFee: number;
}

/**
 * How trip salary and road support fee are read from the tiers (QTL Excel).
 * Trip salary = tier salary + extra rate × (standard km − tier start), rounded up to roundStep.
 */
export interface CalcRule {
  /** Round the trip salary up to a multiple of this (0 = no rounding). */
  roundStep: number;
  /** Highland (Tây Nguyên) surcharge added to the road support fee of Highland routes. */
  regionOn: boolean;
  regionAmount: number;
}

/** Salary Range: the driver salary tiers of one vehicle type and how they are read, under its own code. */
export interface SalaryRangeRecord extends BaseRecord {
  code: string;
  name: string;
  /** Vehicle types it applies to ("TRUCK · 5 tấn", "HEADER · 40 ft · Reefer"…); each vehicle type is in one Salary Range only. */
  vehicleTypes: string[];
  tiers: SalaryTier[];
  /** CNTR lạnh = Extra Distance Rate + this % (a tier can hold another amount, entered by hand). */
  reeferPct: number;
  rule: CalcRule;
  remark: string;
}

/** Fuel Cost: fuel of one vehicle type (reefer containers burn more), under its own code. */
export interface FuelCostRecord extends BaseRecord {
  code: string;
  name: string;
  vehicleType: string;
  fuelType: string;
  /** Per 100 km, in the unit of the fuel type (l, kWh, kg). */
  fuelRate: number;
  /** đ per unit of fuel. */
  fuelPrice: number;
  remark: string;
}

/** The variable costs of a trip, worked out for its route and vehicle type. */
export const VARIABLE_COMPONENTS = [
  "Trip Salary",
  "Road Support Fee",
  "Fuel Cost",
  "Toll Fee",
] as const;
export type VariableComponent = (typeof VARIABLE_COMPONENTS)[number];

/** One variable cost and what it is read from: Salary Range id, Fuel Cost id, or (Toll Fee) the route id. */
export interface VariableItem {
  component: VariableComponent;
  refId: string;
}

/**
 * Variable Cost Mapping of a route and a vehicle type: the Fare Code its variable costs are booked to,
 * and the Salary Range and Fuel Cost they are read from (Toll Fee from the route's Toll Stations).
 */
export interface VariableCostMappingRecord extends BaseRecord {
  routeId: string;
  /** Vehicle type key ("TRUCK · 5 tấn", "HEADER · 40 ft · Reefer · HINO"); no brand = every brand. */
  vehicleType: string;
  salaryRangeId: string;
  fuelCostId: string;
  /** Fare Code (Fare Code Management) the variable costs are booked to. */
  assignCostId: string;
  remark: string;
}
