// COGS of one trip: the Fixed Costs of the Fixed Cost Mappings picked + the variable costs of the route
// × vehicle type (Trip Salary and Road Support Fee from its Salary Range, Fuel Cost from its Fuel Cost,
// Toll Fee from the Toll Stations of the route) + other Fare Codes added by hand.
// Pure (no storage), so the screen, the save, the Reference Trip and the demo seed agree.
import type {
  CogsLine,
  CogsOtherCost,
  CostItemRecord,
  FixedCostRecord,
  FixedCostSummaryRecord,
  FuelCostRecord,
  RouteRecord,
  SalaryRangeRecord,
  VariableComponent,
  VariableCostMappingRecord,
  VariableItem,
} from "@/types";
import { VARIABLE_COMPONENTS } from "@/types";
import { allocate } from "@/services/fixedCostMath";
import { formatNumber } from "@/lib/format";
import {
  fuelCostOf,
  routeTollStations,
  ruleOf,
  tollTotals,
  tripSalaryOf,
  type TollMaster,
} from "./salaryRange";
import { routeTotals } from "./costMath";
import { coversVehicle, type CogsVehicleType } from "./cogsVehicle";
import { coversCogsVehicle } from "@/services/fixedCostVehicle";

/** Fixed cost of one day (a trip is counted as one day). */
export const fixedCostPerDay = (f: FixedCostRecord) =>
  allocate({
    value: f.costValue * f.exchangeRate,
    base: f.allocationBase,
    unit: f.allocationUnit,
    days: f.allocationDays,
  }).day ?? 0;

/** Fare Code mappings a COGS of this vehicle type can pick: live, and made for that vehicle type. */
export const mappingsFor = (mappings: readonly FixedCostSummaryRecord[], vt: CogsVehicleType) =>
  mappings.filter((m) => !m.deleted && !!m.vehicleType && coversCogsVehicle(m.vehicleType, vt));

/** Vehicle types a setup is made for (a Salary Range has several, a Fuel Cost one). */
export const setupTypes = (r: { vehicleType?: string; vehicleTypes?: readonly string[] }) =>
  r.vehicleTypes ?? (r.vehicleType ? [r.vehicleType] : []);

/**
 * Live, active Salary Ranges / Fuel Costs that apply to a vehicle type: the ones made for it (its brand)
 * first, then the all-brands ones, each by code. The first one is used unless another is picked.
 */
export function setupsFor<
  T extends {
    deleted?: boolean;
    status: string;
    code: string;
    vehicleType?: string;
    vehicleTypes?: readonly string[];
  },
>(xs: readonly T[], vehicleType: string): T[] {
  const exact = (r: T) => setupTypes(r).includes(vehicleType);
  return xs
    .filter(
      (r) =>
        !r.deleted &&
        r.status === "Active" &&
        setupTypes(r).some((t) => coversVehicle(t, vehicleType)),
    )
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || a.code.localeCompare(b.code));
}

/**
 * Variable Cost Mapping of a route and vehicle type: the one made for that vehicle type, else one made
 * for every brand of it.
 */
export const variableMappingFor = (
  mappings: readonly VariableCostMappingRecord[],
  routeId: string,
  vehicleType: string,
) => {
  const ok = mappings.filter(
    (m) =>
      !m.deleted &&
      m.status === "Active" &&
      m.routeId === routeId &&
      coversVehicle(m.vehicleType, vehicleType),
  );
  return ok.find((m) => m.vehicleType === vehicleType) ?? ok[0];
};

/** What the variable costs are read from. */
export interface VariableSetups {
  salaryRanges: readonly SalaryRangeRecord[];
  fuelCosts: readonly FuelCostRecord[];
  tollMasters: TollMaster[];
}

/** One variable cost worked out for a route (Toll Fee: its own route): code, basis, amount. */
export function variableItemOf(
  item: VariableItem,
  route: RouteRecord,
  vt: Pick<CogsVehicleType, "group" | "reefer">,
  s: VariableSetups,
): { code: string; basis: string; amount: number } {
  const t = routeTotals(route);
  const km = Math.round(t.distanceKm);
  if (!t.calculated) {
    const setup =
      item.component === "Toll Fee"
        ? route
        : (item.component === "Fuel Cost" ? s.fuelCosts : s.salaryRanges).find(
            (x) => x.id === item.refId,
          );
    return { code: setup?.code ?? "", basis: "Route not calculated", amount: 0 };
  }
  if (item.component === "Toll Fee") {
    const stations = routeTollStations(route, s.tollMasters);
    return {
      code: route.code,
      basis: `${stations.length} stations · Group ${vt.group}`,
      amount: tollTotals(stations)[vt.group - 1] ?? 0,
    };
  }
  if (item.component === "Fuel Cost") {
    const f = s.fuelCosts.find((x) => x.id === item.refId && !x.deleted);
    if (!f) return { code: "", basis: "Fuel Cost not found", amount: 0 };
    const litres = Math.round(((km * f.fuelRate) / 100) * 10) / 10;
    const unit = /electric/i.test(f.fuelType) ? "kWh" : /cng/i.test(f.fuelType) ? "kg" : "l";
    return {
      code: f.code,
      basis: `${f.fuelRate} ${unit}/100km × ${formatNumber(km)} km = ${litres} ${unit} × ${formatNumber(f.fuelPrice)} ₫`,
      amount: fuelCostOf(km, f.fuelRate, f.fuelPrice),
    };
  }
  const r = s.salaryRanges.find((x) => x.id === item.refId && !x.deleted);
  if (!r) return { code: "", basis: "Salary Range not found", amount: 0 };
  const sal = tripSalaryOf(r.tiers, km, undefined, undefined, {
    rule: ruleOf(r.rule),
    terrain: route.terrain ?? "Plain",
    reefer: vt.reefer,
  });
  if (!sal) return { code: r.code, basis: `Out of range (${formatNumber(km)} km)`, amount: 0 };
  return item.component === "Trip Salary"
    ? { code: r.code, basis: sal.basis, amount: sal.base }
    : { code: r.code, basis: sal.roadSupportBasis, amount: sal.roadSupportFee };
}

export interface TripVariable {
  salaryRange: SalaryRangeRecord | undefined;
  fuelCost: FuelCostRecord | undefined;
  lines: { component: VariableComponent; code: string; basis: string; amount: number }[];
  total: number;
}

/**
 * Variable costs of a trip: Trip Salary and Road Support Fee from the vehicle type's Salary Range,
 * Fuel Cost from its Fuel Cost (the ones picked, else the first that applies), Toll Fee of the route.
 * A cost without a setup is left out.
 */
export function tripVariable(
  route: RouteRecord,
  vt: CogsVehicleType,
  s: VariableSetups & { salaryRangeId?: string; fuelCostId?: string },
): TripVariable {
  const salaryRanges = setupsFor(s.salaryRanges, vt.key);
  const fuelCosts = setupsFor(s.fuelCosts, vt.key);
  const salaryRange = salaryRanges.find((x) => x.id === s.salaryRangeId) ?? salaryRanges[0];
  const fuelCost = fuelCosts.find((x) => x.id === s.fuelCostId) ?? fuelCosts[0];
  const refOf = (c: VariableComponent) =>
    c === "Toll Fee" ? route.id : c === "Fuel Cost" ? fuelCost?.id : salaryRange?.id;
  const lines = VARIABLE_COMPONENTS.flatMap((component) => {
    const refId = refOf(component);
    return refId ? [{ component, ...variableItemOf({ component, refId }, route, vt, s) }] : [];
  });
  return { salaryRange, fuelCost, lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

export interface CogsBuildInput extends VariableSetups {
  route: RouteRecord;
  vehicle: CogsVehicleType;
  fixedCosts: FixedCostRecord[];
  mappings: FixedCostSummaryRecord[];
  /** Mappings picked on the COGS. */
  mappingIds: readonly string[];
  /** Variable Cost Mappings: the one of the route and vehicle type is used. */
  variableMappings: readonly VariableCostMappingRecord[];
  /** Trips per day (hệ số khai thác): Fixed Cost per trip = per day ÷ factor. */
  utilizationFactor: number;
  /** Fare Codes (Fare Code Management). */
  costs: CostItemRecord[];
  excluded: readonly string[];
  overrides: Readonly<Record<string, number>>;
  others: readonly CogsOtherCost[];
}

export interface CogsBuild {
  /** Standard distance of the route (km); 0 when not calculated. */
  stdKm: number;
  calculated: boolean;
  /** Variable Cost Mapping of the route and vehicle type (none: no variable cost). */
  variableMapping: VariableCostMappingRecord | undefined;
  variable: TripVariable;
  /** Every Fixed / Variable cost that applies, before removal or edits. */
  autoLines: CogsLine[];
  /** Lines in the COGS: auto lines not removed (edited amounts applied) + other costs. */
  lines: CogsLine[];
  total: number;
}

export function buildCogs(i: CogsBuildInput): CogsBuild {
  const t = routeTotals(i.route);

  // Fixed Cost: the fixed costs of each mapping picked, in order (a cost in two mappings counts once),
  // per day shared by the trips of the day (Utilization Factor).
  const factor = i.utilizationFactor > 0 ? i.utilizationFactor : 1;
  const seen = new Set<string>();
  const fixedLines: CogsLine[] = [];
  for (const id of i.mappingIds) {
    const m = i.mappings.find((x) => x.id === id && !x.deleted);
    if (!m) continue;
    const fare = i.costs.find((c) => c.id === m.assignCostId);
    for (const fid of m.fixedCostIds) {
      const f = i.fixedCosts.find((x) => x.id === fid && !x.deleted && x.status === "Active");
      if (!f || seen.has(f.id)) continue;
      seen.add(f.id);
      fixedLines.push({
        key: `F:${f.id}`,
        group: "Fixed Cost",
        code: f.code,
        name: f.name,
        basis:
          `${fare ? `Fare Code ${fare.code} · ` : ""}${formatNumber(f.costValue)} ${f.currency} per ${f.allocationBase} ${f.allocationUnit} → per day ${formatNumber(Math.round(fixedCostPerDay(f)))}` +
          (factor !== 1 ? ` ÷ ${factor} trips/day` : ""),
        amount: Math.round(fixedCostPerDay(f) / factor),
        mappingId: m.id,
      });
    }
  }

  // Variable Cost: the Variable Cost Mapping of the route and vehicle type, worked out for the route.
  const variableMapping = variableMappingFor(i.variableMappings, i.route.id, i.vehicle.key);
  const variable: TripVariable = variableMapping
    ? tripVariable(i.route, i.vehicle, {
        ...i,
        salaryRangeId: variableMapping.salaryRangeId,
        fuelCostId: variableMapping.fuelCostId,
      })
    : { salaryRange: undefined, fuelCost: undefined, lines: [], total: 0 };
  const variableLines: CogsLine[] = variable.lines.map((v) => ({
    key: `V:${v.component}`,
    group: "Variable Cost",
    code: v.code,
    name: v.component,
    basis: v.basis,
    amount: v.amount,
    fareCode: i.costs.find((c) => c.id === variableMapping?.assignCostId)?.code ?? "",
  }));

  const autoLines = [...fixedLines, ...variableLines];
  const kept = autoLines
    .filter((l) => !i.excluded.includes(l.key))
    .map((l): CogsLine => {
      const o = i.overrides[l.key];
      return o === undefined || o === l.amount ? l : { ...l, amount: o, calculated: l.amount };
    });
  const otherLines = i.others
    .map((o): CogsLine | null => {
      const c = i.costs.find((x) => x.id === o.costId);
      return c
        ? {
            key: `O:${o.rid}`,
            group: "Other Cost",
            code: c.code,
            name: c.name,
            basis: c.group || "—",
            amount: Math.round(o.amount) || 0,
          }
        : null;
    })
    .filter((l): l is CogsLine => !!l);
  const lines = [...kept, ...otherLines];
  return {
    stdKm: t.calculated ? Math.round(t.distanceKm) : 0,
    calculated: t.calculated,
    variableMapping,
    variable,
    autoLines,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  };
}
