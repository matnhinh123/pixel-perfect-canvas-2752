import type { BaseRecord } from "./common";

/** One distance tier of a Salary Range. */
export interface SalaryTier {
  from: number;
  to: number;
  /** Salary of a trip whose standard distance falls in the tier. */
  tripSalary: number;
  /** Paid per km driven beyond the standard distance (đ/km). */
  extraRate: number;
  /** Extra Distance Rate of each container column of a Header range ("42RT" → đ/km); empty: the extra rate. */
  containerRates?: Record<string, number>;
  /** Trip Salary worked out from the tier before (not typed): its Trip Salary + its Extra Distance Rate × its width. */
  auto?: boolean;
  roadSupportFee: number;
}

/**
 * How trip salary and road support fee are read from the tiers (QTL Excel).
 * Trip salary = tier salary + extra rate × (standard km − tier start), rounded up to roundStep.
 */
export interface CalcRule {
  /** Round the trip salary up to a multiple of this (0 = no rounding). */
  roundStep: number;
  /** Other terrain surcharge added to the road support fee of routes whose Terrain is Other. */
  regionOn: boolean;
  regionAmount: number;
}

/**
 * A container column of a Header Salary Range: its Extra Distance Rate = the tier's + pct % (a tier can
 * hold another amount, typed by hand) and its tier salary + pct %.
 */
export interface ContainerColumn {
  /** Container Type (Common Code, ISO group code): "22GP", "42RT"… */
  container: string;
  pct: number;
}

/** An earlier version of a setup (Salary Range, Fuel Cost): what it held, and when and by whom it was saved. */
export interface SetupVersion<D> {
  version: number;
  savedAt: string;
  savedBy: string;
  data: D;
}

/** Salary Range: the driver salary tiers of one vehicle type and how they are read, under its own code. */
export interface SalaryRangeRecord extends BaseRecord {
  code: string;
  name: string;
  /**
   * Vehicle type: "TRUCK · 5 tấn" or "HEADER" (every header, whatever the container); one Salary Range
   * per vehicle type. "" on a Draft (a copy not set up yet).
   */
  vehicleType: string;
  /**
   * Every vehicle type it pays: one or more Truck Types ("TRUCK · 2 tấn", "TRUCK · 5 tấn"), or "HEADER"
   * alone. `vehicleType` is the first. Older records without it: [vehicleType].
   */
  vehicleTypes?: string[];
  tiers: SalaryTier[];
  /** Header only: a column per container; a container without one is paid the tier's own rates. */
  containers: ContainerColumn[];
  rule: CalcRule;
  remark: string;
  /** 1 when created; each save that changes it adds 1 (older records: 1). */
  version?: number;
  /** The earlier versions, oldest first. */
  history?: SetupVersion<SalaryRangeContent>[];
}

/** What a version of a Salary Range holds. */
export type SalaryRangeContent = Pick<
  SalaryRangeRecord,
  | "code"
  | "name"
  | "vehicleType"
  | "vehicleTypes"
  | "tiers"
  | "containers"
  | "rule"
  | "remark"
  | "status"
>;

/**
 * A vehicle type of a Fuel Cost and its Fuel Rates (per 100 km): K1 empty, K2 loaded. A COGS burns
 * the Estimate = (K1 + K2) ÷ 2. Each one left empty (null): its vehicles' average (never the other one).
 */
export interface FuelVehicleRate {
  /** "TRUCK · 5 tấn", or a brand of it "TRUCK · 5 tấn · HINO". */
  vehicleType: string;
  /** K1: running empty (no cargo). Older records: the one Fuel Rate. */
  rate: number | null;
  /** K2: running loaded; missing on older records. */
  rateLoaded?: number | null;
}

/**
 * Fuel Cost: the price of one Fuel Type (the fuel types of Master Data › Vehicle), and the vehicle types
 * running on it, down to their brands, with the Fuel Rate each burns (left empty: its vehicles' average,
 * Vehicle › Fuel Rate).
 */
export interface FuelCostRecord extends BaseRecord {
  /** "FU-DIESEL", made from the Fuel Type. */
  code: string;
  /** Shown with the code wherever the Fuel Cost is used (COGS); older records: "<Fuel Type> Fuel Cost". */
  name?: string;
  fuelType: string;
  /** đ per unit of fuel (liter, kWh, kg). */
  fuelPrice: number;
  /** Its vehicle types; older records without it: every vehicle type running on the fuel. */
  vehicles?: FuelVehicleRate[];
  remark: string;
  /** 1 when created; each save that changes it adds 1 (older records: 1). */
  version?: number;
  /** The earlier versions, oldest first. */
  history?: SetupVersion<FuelCostContent>[];
}

/** What a version of a Fuel Cost holds. */
export type FuelCostContent = Pick<
  FuelCostRecord,
  "code" | "name" | "fuelType" | "fuelPrice" | "vehicles" | "remark" | "status"
>;

/** The variable costs of a trip, worked out for its route and vehicle type. */
export const VARIABLE_COMPONENTS = ["Trip Salary", "Fuel Cost", "Toll Fee"] as const;
export type VariableComponent = (typeof VARIABLE_COMPONENTS)[number];

/** One variable cost and what it is read from: Salary Range id, Fuel Cost id, or (Toll Fee) the route id. */
export interface VariableItem {
  component: VariableComponent;
  refId: string;
}

/**
 * Variable Cost Mapping: a Fare Code, the vehicle types and the one variable cost booked to it (as Fixed Cost
 * Mapping does for internal costs), for one or more vehicle types. A variable cost of a vehicle type is
 * in one mapping only.
 */
export interface VariableCostMappingRecord extends BaseRecord {
  /** Fare Code (Fare Code Management). */
  assignCostId: string;
  /** Vehicle type keys ("TRUCK · 5 tấn", "HEADER · 40 ft · Reefer"…); no brand = every brand. */
  vehicleTypes: string[];
  /** The one variable cost booked to the Fare Code. */
  component: VariableComponent;
}
