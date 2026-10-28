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

/** Salary Range: the driver salary tiers of one vehicle type and how they are read, under its own code. */
export interface SalaryRangeRecord extends BaseRecord {
  code: string;
  name: string;
  /**
   * Vehicle type: "TRUCK · 5 tấn" or "HEADER" (every header, whatever the container); one Salary Range
   * per vehicle type. "" on a Draft (a copy not set up yet).
   */
  vehicleType: string;
  tiers: SalaryTier[];
  /** Header only: a column per container; a container without one is paid the tier's own rates. */
  containers: ContainerColumn[];
  rule: CalcRule;
  remark: string;
}

/**
 * Fuel Cost: the price of one Fuel Type (the fuel types of Master Data › Vehicle). The fuel rate is the
 * vehicles' own (Vehicle › Fuel Rate): a trip burns the average rate of its vehicle type.
 */
export interface FuelCostRecord extends BaseRecord {
  /** "FU-DIESEL", made from the Fuel Type. */
  code: string;
  fuelType: string;
  /** đ per unit of fuel (liter, kWh, kg). */
  fuelPrice: number;
  remark: string;
}

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
