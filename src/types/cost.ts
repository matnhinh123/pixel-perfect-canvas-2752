import type { BaseRecord } from "./common";
import type { VehicleGroup } from "./routing";

export type CostCategory = "Fixed" | "Fuel" | "Driver" | "Toll" | "Ferry" | "Other";
export const EDITABLE_COST_CATEGORIES: CostCategory[] = ["Fixed", "Fuel", "Driver", "Other"];

/** How a line amount is derived from the route. */
export type CostBasis = "Per trip" | "Per km" | "Per hour";
export const COST_BASES: CostBasis[] = ["Per trip", "Per km", "Per hour"];

export interface CostLine {
  id: string;
  category: CostCategory;
  description: string;
  basis: CostBasis;
  rate: number;
}

/** Route figures frozen at the moment a version was saved, so history never changes retroactively. */
export interface RouteSnapshot {
  routeCode: string;
  distanceKm: number;
  estimatedTimeMin: number;
  tollCost: number;
  ferryCost: number;
  otherRouteCost: number;
}

export type CostVersionStatus = "Draft" | "Active" | "Superseded";

export interface CostVersion {
  version: number;
  effectiveFrom: string; // yyyy-mm-dd
  status: CostVersionStatus;
  lines: CostLine[];
  routeSnapshot: RouteSnapshot | null;
  totalEstimated: number;
  createdAt: string;
  createdBy: string;
  note?: string;
}

export interface CostRecord extends BaseRecord {
  code: string;
  name: string;
  routeId: string;
  vehicleGroup: VehicleGroup;
  versions: CostVersion[];
}

export interface CostSummary {
  fixed: number;
  fuel: number;
  driver: number;
  toll: number;
  ferry: number;
  other: number;
  total: number;
  distanceKm: number;
  estimatedTimeMin: number;
}
