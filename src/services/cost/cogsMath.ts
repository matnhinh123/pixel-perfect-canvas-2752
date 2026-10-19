// Variable Cost (Blueprint MD-31) and COGS (MD-18) per Route × Vehicle Group. Pure arithmetic over
// the route figures and the demo rate basis; no storage access here.
import type { RouteRecord, VehicleGroup } from "@/types";
import {
  FIXED_PER_TRIP,
  FUEL_NORMS,
  FUEL_PRICE,
  SALARY_BANDS,
  TERRAIN_FACTORS,
  TRIP_SALARY,
} from "@/mock-data/cogsRates";
import { routeTotals } from "./costMath";

export interface VariableCost {
  route: RouteRecord;
  group: VehicleGroup;
  calculated: boolean;
  distanceKm: number;
  /** Base norm (l/100km) × terrain factor. */
  fuelNorm: number;
  terrainFactor: number;
  fuelLitres: number;
  fuelPrice: number;
  fuel: number;
  /** Toll / bridge stations of every leg used. */
  toll: number;
  /** Ferry stations + manual ferry costs. */
  ferry: number;
  /** Other manual route costs (peak-hour surcharge, other). */
  other: number;
  /** Fuel + toll + ferry + other — fixed cost is NOT part of it. */
  total: number;
}

export interface Cogs extends VariableCost {
  fixed: number;
  salary: number;
  salaryBand: string;
  variable: number;
  /** Fixed per trip + trip salary + variable cost. */
  cogs: number;
}

export function variableCostOf(route: RouteRecord): VariableCost {
  const t = routeTotals(route);
  const group = route.vehicleGroup;
  const terrainFactor = TERRAIN_FACTORS[route.terrain ?? "Plain"];
  const fuelNorm = Math.round(FUEL_NORMS[group] * terrainFactor * 10) / 10;
  const fuelLitres = Math.round(((fuelNorm * t.distanceKm) / 100) * 10) / 10;
  const fuel = Math.round(fuelLitres * FUEL_PRICE);
  return {
    route,
    group,
    calculated: t.calculated,
    distanceKm: t.distanceKm,
    fuelNorm,
    terrainFactor,
    fuelLitres,
    fuelPrice: FUEL_PRICE,
    fuel,
    toll: t.tollCost,
    ferry: t.ferryCost,
    other: t.otherRouteCost,
    total: fuel + t.tollCost + t.ferryCost + t.otherRouteCost,
  };
}

export function cogsOf(route: RouteRecord): Cogs {
  const v = variableCostOf(route);
  const band = Math.max(
    0,
    SALARY_BANDS.findIndex((b) => v.distanceKm <= b.maxKm),
  );
  const salary = v.calculated ? TRIP_SALARY[v.group][band]! : 0;
  const fixed = FIXED_PER_TRIP[v.group];
  return {
    ...v,
    fixed,
    salary,
    salaryBand: SALARY_BANDS[band]!.label,
    variable: v.total,
    cogs: fixed + salary + v.total,
  };
}
