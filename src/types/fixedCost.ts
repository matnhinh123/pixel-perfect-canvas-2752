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

/**
 * How a fixed cost is priced. Allocation: a value spread over a period (depreciation, insurance…).
 * Loan Interest: the interest of a loan. Other: an amount per day entered as is.
 */
export type FixedCostType = "Allocation" | "Loan Interest" | "Other";
export const FIXED_COST_TYPES: readonly FixedCostType[] = ["Allocation", "Loan Interest", "Other"];

/** One fixed-cost line (depreciation, insurance, interest, GPS…) with its allocation settings. */
export interface FixedCostRecord extends BaseRecord {
  /** Cost Detail (Master Data > Cost) this fixed cost is booked to. */
  costDetailId: string;
  code: string;
  /** Fixed Cost Name (EN). */
  name: string;
  /** Fixed Cost Name (Local), optional. */
  localName: string;
  costType: FixedCostType;
  /** Allocation: the value to spread. Loan Interest: total interest. Other: amount per day. */
  costValue: number;
  currency: string;
  /** Rate to VND on the day it was saved (1 for VND). */
  exchangeRate: number;
  allocationBase: number;
  allocationUnit: AllocationUnit;
  /** Optional; empty = not yet assigned, so it appears in no Summary. */
  vehicleTypes: string[];
  /** Days per month for Month → Day. */
  allocationDays: number;
  /**
   * Loan Interest only: Cost Value = total interest of the loan, spread over its term
   * (Allocation Base = term, unit Month).
   */
  loan: LoanTerms | null;
}

/** Fixed Cost Summary of one vehicle type (id = vehicle type). */
export interface FixedCostSummaryRecord extends BaseRecord {
  vehicleType: string;
  /** Cost master item this summary is assigned to. */
  assignCostId: string;
  /** Ordered fixed-cost ids picked for the vehicle type. */
  fixedCostIds: string[];
}
