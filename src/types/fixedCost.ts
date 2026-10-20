import type { BaseRecord } from "./common";

/** Anchor of the allocation chain: the unit Cost Value ÷ Allocation Base is expressed in. */
export type AllocationUnit = "Year" | "Month" | "Day" | "Trip";
export const ALLOCATION_UNITS: AllocationUnit[] = ["Year", "Month", "Day", "Trip"];

/** One fixed-cost line (depreciation, insurance, interest, GPS…) with its allocation settings. */
export interface FixedCostRecord extends BaseRecord {
  /** Cost Detail (Master Data > Cost) this fixed cost is booked to. */
  costDetailId: string;
  code: string;
  name: string;
  costValue: number;
  currency: string;
  /** Rate to VND on the day it was saved (1 for VND). */
  exchangeRate: number;
  allocationBase: number;
  allocationUnit: AllocationUnit;
  /** Optional; empty = not yet assigned, so it appears in no Summary. */
  vehicleTypes: string[];
  /** Utilization rate = containers ÷ days (only used for Day → Trip). */
  utilContainer: number;
  utilDay: number;
  applyUtilization: boolean;
  /** Days per month for Month → Day. */
  allocationDays: number;
}

/** Fixed Cost Summary of one vehicle type (id = vehicle type). */
export interface FixedCostSummaryRecord extends BaseRecord {
  vehicleType: string;
  /** Cost master item this summary is assigned to. */
  assignCostId: string;
  /** Ordered fixed-cost ids picked for the vehicle type. */
  fixedCostIds: string[];
}
