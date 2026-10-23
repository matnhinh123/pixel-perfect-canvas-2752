import type { BaseRecord } from "./common";

export type CogsLineGroup = "Fixed Cost" | "Variable Cost" | "Other Cost";

/** One cost of a COGS, as it stood when the COGS was saved. */
export interface CogsLine {
  key: string;
  group: CogsLineGroup;
  code: string;
  name: string;
  /** How the amount was obtained (e.g. "Tier 4 + 35 km × 2,400"). */
  basis: string;
  amount: number;
  /** Set when the amount was edited by hand: the calculated amount. */
  calculated?: number;
  /** Fixed Cost Mapping the line came from. */
  mappingId?: string;
}

/** An extra Cost Detail added to a COGS by hand. */
export interface CogsOtherCost {
  rid: string;
  costId: string;
  amount: number;
}

/** COGS (cost of goods sold) of one trip: a route, a vehicle type and the costs picked for it. */
export interface CogsRecord extends BaseRecord {
  /** Entered by the user, unique. */
  code: string;
  name: string;
  routeId: string;
  /** Route code when saved (kept if the route is renamed or removed). */
  routeCode: string;
  routeName: string;
  /** Vehicle type from Master Data > Vehicle, e.g. "Truck 5 tấn", "Header + 40 ft". */
  vehicleType: string;
  /** Fixed Cost Mappings (Fare Code mappings) picked: their fixed costs make up the Fixed Cost part. */
  mappingIds: string[];
  /**
   * Utilization Factor (hệ số khai thác): trips the vehicle runs per day. The fixed costs of a day are
   * shared by them: Fixed Cost per trip = per day ÷ factor. 1 when not set.
   */
  utilizationFactor?: number;
  /** Salary Range and Fuel Cost the variable costs were read from (of the vehicle type). */
  salaryRangeId: string;
  fuelCostId: string;
  /** Fixed / Variable cost keys left out of the COGS. */
  excluded: string[];
  others: CogsOtherCost[];
  /** Amounts edited by hand, by line key (Fixed / Variable cost). */
  overrides: Record<string, number>;
  /** Snapshot of the costs included, and their total. */
  lines: CogsLine[];
  total: number;
  remark: string;
}
