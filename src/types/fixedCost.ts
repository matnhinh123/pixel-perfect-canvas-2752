import type { BaseRecord } from "./common";

/** Anchor of the allocation chain (Year → Month → Day): the unit Cost Value ÷ Allocation Base is in. */
export type AllocationUnit = "Year" | "Month" | "Day";
export const ALLOCATION_UNITS: AllocationUnit[] = ["Year", "Month", "Day"];

/**
 * Annuity: the same payment every month. Equal Principal: same principal, interest on the balance.
 * Interest Only: interest on the full amount every month, the principal paid back at the end.
 */
export type RepaymentMethod = "Annuity" | "Equal Principal" | "Interest Only";
export const REPAYMENT_METHODS: readonly RepaymentMethod[] = [
  "Annuity",
  "Equal Principal",
  "Interest Only",
];

/** Loan behind a fixed cost (e.g. a vehicle bought on credit). */
export interface LoanTerms {
  /** Amount borrowed. */
  amount: number;
  /** Interest rate, % per year. */
  ratePct: number;
  /** Loan term in months. */
  termMonths: number;
  method: RepaymentMethod;
}

/** Fee Type of an internal cost: the cost of an asset (depreciation…) or not. Both are allocated. */
export type FixedCostType = "Asset" | "Non Asset";
export const FIXED_COST_TYPES: readonly FixedCostType[] = ["Asset", "Non Asset"];

/** One fixed cost (depreciation, insurance, interest, GPS…). Its Fare Code is set by the mapping (Fixed Cost Summary). */
export interface FixedCostRecord extends BaseRecord {
  code: string;
  /** Fixed Cost Name (EN). */
  name: string;
  /** Fixed Cost Name (Local), optional. */
  localName: string;
  costType: FixedCostType;
  /** The value to spread over the Allocation Base. */
  costValue: number;
  currency: string;
  /** Rate to VND on the day it was saved (1 for VND). */
  exchangeRate: number;
  allocationBase: number;
  allocationUnit: AllocationUnit;
  /** Days per month for Month → Day. */
  allocationDays: number;
}

/** Fixed Cost Summary: a Fare Code, the fixed costs booked to it and the vehicle type they apply to. */
export interface FixedCostSummaryRecord extends BaseRecord {
  /** Fare Code (Fare Code Management) the fixed costs are booked to. */
  assignCostId: string;
  /** Ordered fixed-cost ids mapped to the Fare Code. */
  fixedCostIds: string[];
  /** The one vehicle type the mapping applies to ("TRUCK · 5 tấn", "HEADER · HINO"…). */
  vehicleType: string;
}
