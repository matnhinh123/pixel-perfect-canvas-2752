// COGS of one trip: the Fixed Costs of the Fixed Cost Mappings picked + the variable costs of the route
// × vehicle type (Trip Salary from its Salary Range, Fuel Cost from its Fuel Cost,
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
  TollFeeRecord,
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
import {
  coversVehicle,
  isoFitsVehicle,
  salaryVehiclesOf,
  type CogsVehicleType,
} from "./cogsVehicle";
import { fuelRateFor } from "./fuelRates";
import { coversCogsVehicle } from "@/services/fixedCostVehicle";

/** Fixed cost of one day (a trip is counted as one day). */
export const fixedCostPerDay = (f: FixedCostRecord) =>
  allocate({
    value: f.costValue * f.exchangeRate,
    base: f.allocationBase,
    unit: f.allocationUnit,
    days: f.allocationDays,
  }).day ?? 0;

/** Fare Code mappings a COGS of this vehicle type loads: live, active, and made for that vehicle type. */
export const mappingsFor = (mappings: readonly FixedCostSummaryRecord[], vt: CogsVehicleType) =>
  mappings.filter(
    (m) =>
      !m.deleted &&
      m.status === "Active" &&
      !!m.vehicleType &&
      coversCogsVehicle(m.vehicleType, vt),
  );

/**
 * Live, active Salary Ranges / Fuel Costs that apply to a vehicle type: the ones made for it (its brand)
 * first, then the all-brands ones (a "HEADER" Salary Range: every header), each by code. The first one is
 * used unless another is picked. A Draft is never used.
 */
export function setupsFor<
  T extends {
    deleted?: boolean;
    status: string;
    code: string;
    vehicleType: string;
    vehicleTypes?: string[] | undefined;
  },
>(xs: readonly T[], vehicleType: string): T[] {
  const exact = (r: T) => salaryVehiclesOf(r).includes(vehicleType);
  return xs
    .filter(
      (r) =>
        !r.deleted &&
        r.status === "Active" &&
        salaryVehiclesOf(r).some((k) => coversVehicle(k, vehicleType)),
    )
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || a.code.localeCompare(b.code));
}

/** The active Fuel Cost (price) of a Fuel Type. */
export const fuelCostFor = (fuelCosts: readonly FuelCostRecord[], fuelType: string) =>
  fuelCosts.find((f) => !f.deleted && f.status === "Active" && f.fuelType === fuelType);
const unitOf = (fuelType: string) =>
  /electric/i.test(fuelType) ? "kWh" : /cng/i.test(fuelType) ? "kg" : "l";

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
  vt: Pick<CogsVehicleType, "group" | "key" | "brand" | "fuelNorm" | "fuelRates">,
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
    // The Fuel Rate of the vehicle type in the Fuel Cost (set there, or its vehicles' average).
    const use = fuelRateFor(f, vt);
    if (!use)
      return {
        code: f.code,
        basis: `${vt.key} is not a vehicle type of Fuel Cost ${f.code}`,
        amount: 0,
      };
    const rate = use.rate;
    const unit = unitOf(f.fuelType);
    if (!(rate > 0))
      return { code: f.code, basis: "No Fuel Rate on the vehicles (Vehicle › Fuel)", amount: 0 };
    const litres = Math.round(((km * rate) / 100) * 10) / 10;
    const source =
      use.source === "set" ? "set in Fuel Cost" : `average of ${use.vehicles} vehicles`;
    // Estimate = (K1 empty + K2 loaded) ÷ 2; one figure when both are the same.
    const estimate = use.k1 === use.k2 ? `${rate}` : `(K1 ${use.k1} + K2 ${use.k2}) ÷ 2 = ${rate}`;
    return {
      code: f.code,
      basis: `${estimate} ${unit}/100km (${source}) × ${formatNumber(km)} km = ${litres} ${unit} × ${formatNumber(f.fuelPrice)} VND`,
      amount: fuelCostOf(km, rate, f.fuelPrice),
    };
  }
  const r = s.salaryRanges.find((x) => x.id === item.refId && !x.deleted);
  if (!r) return { code: "", basis: "Salary Range not found", amount: 0 };
  const sal = tripSalaryOf(r.tiers, km, undefined, undefined, {
    rule: ruleOf(r.rule),
    terrain: route.terrain ?? "Plain",
    // A header pulling a container with a column (its ISO length and reefer / dry): that column's rates.
    container: (r.containers ?? []).find((c) => isoFitsVehicle(c.container, vt.key)),
  });
  if (!sal) return { code: r.code, basis: `Out of range (${formatNumber(km)} km)`, amount: 0 };
  return { code: r.code, basis: sal.basis, amount: sal.base };
}

export interface TripVariable {
  salaryRange: SalaryRangeRecord | undefined;
  fuelCost: FuelCostRecord | undefined;
  lines: { component: VariableComponent; code: string; basis: string; amount: number }[];
  total: number;
}

/**
 * Variable costs of a trip: Trip Salary from the vehicle type's Salary Range,
 * Fuel Cost from its Fuel Cost (the ones picked, else the first that applies), Toll Fee of the route.
 * A cost without a setup is left out.
 */
export function tripVariable(
  route: RouteRecord,
  vt: CogsVehicleType,
  s: VariableSetups & { salaryRangeId?: string },
): TripVariable {
  const salaryRanges = setupsFor(s.salaryRanges, vt.key);
  const salaryRange = salaryRanges.find((x) => x.id === s.salaryRangeId) ?? salaryRanges[0];
  // Fuel: the price of the fuel the vehicle type runs on.
  const fuelCost = fuelCostFor(s.fuelCosts, vt.fuelType);
  const refOf = (c: VariableComponent) =>
    c === "Toll Fee" ? route.id : c === "Fuel Cost" ? fuelCost?.id : salaryRange?.id;
  // A variable cost without its setup stays in, at 0, saying what is missing.
  const missing = (c: VariableComponent) =>
    c === "Fuel Cost"
      ? vt.fuelType
        ? `No Fuel Cost (price) for ${vt.fuelType} — add it in Variable Cost › Fuel Cost`
        : "No Fuel Type on the vehicles (Vehicle › Fuel)"
      : `No active Salary Range for ${vt.key} — add it in Variable Cost › Salary Range`;
  const lines = VARIABLE_COMPONENTS.map((component) => {
    const refId = refOf(component);
    return refId
      ? { component, ...variableItemOf({ component, refId }, route, vt, s) }
      : { component, code: "", basis: missing(component), amount: 0 };
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
  /** Toll Fees of the routes: the Fare Code a route's toll stations are booked to. */
  tollFees: readonly TollFeeRecord[];
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
  variable: TripVariable;
  /** Every Fixed / Variable cost that applies, before removal or edits. */
  autoLines: CogsLine[];
  /** Lines in the COGS: auto lines not removed (edited amounts applied) + other costs. */
  lines: CogsLine[];
  total: number;
}

export function buildCogs(i: CogsBuildInput): CogsBuild {
  const t = routeTotals(i.route);

  // Fixed Cost: every Internal Cost mapped to each Fare Code picked, as mapped (one mapped to two Fare
  // Codes shows under both), per day shared by the trips of the day (Utilization Factor). An inactive
  // Internal Cost is listed but not counted.
  const factor = i.utilizationFactor > 0 ? i.utilizationFactor : 1;
  const fixedLines: CogsLine[] = [];
  for (const id of i.mappingIds) {
    const m = i.mappings.find((x) => x.id === id && !x.deleted);
    if (!m) continue;
    for (const fid of m.fixedCostIds) {
      const f = i.fixedCosts.find((x) => x.id === fid && !x.deleted);
      if (!f) continue;
      const active = f.status === "Active";
      fixedLines.push({
        key: `F:${m.id}:${f.id}`,
        group: "Fixed Cost",
        code: f.code,
        name: f.name,
        basis: active
          ? `${formatNumber(f.costValue)} ${f.currency} per ${f.allocationBase} ${f.allocationUnit} → per day ${formatNumber(Math.round(fixedCostPerDay(f)))}` +
            (factor !== 1 ? ` ÷ ${factor} trips/day` : "")
          : "Internal Cost is Inactive — not counted",
        amount: active ? Math.round(fixedCostPerDay(f) / factor) : 0,
        mappingId: m.id,
      });
    }
  }

  // Variable Cost: worked out for the route from the Salary Range / Fuel Cost of the vehicle type and
  // the Toll Stations of the route.
  const variable: TripVariable = tripVariable(i.route, i.vehicle, i);
  // Each variable cost on its own; the Toll Fee one line per toll station of the route.
  // Fare Code: the one of the setup the cost is read from (Salary Range, Fuel Cost, the route's Toll Fee).
  const fareIdOfCost = (c: VariableComponent) =>
    c === "Trip Salary"
      ? variable.salaryRange?.fareCostId
      : c === "Fuel Cost"
        ? variable.fuelCost?.fareCostId
        : i.tollFees.find((f) => !f.deleted && f.routeId === i.route.id)?.fareCostId;
  const fareOf = (c: VariableComponent) =>
    i.costs.find((x) => x.id === fareIdOfCost(c))?.code ?? "";
  const setupNameOf = (c: VariableComponent) =>
    c === "Toll Fee"
      ? i.route.name
      : c === "Fuel Cost"
        ? variable.fuelCost && (variable.fuelCost.name || `${variable.fuelCost.fuelType} Fuel Cost`)
        : variable.salaryRange?.name;
  const stations = t.calculated ? routeTollStations(i.route, i.tollMasters) : [];
  const variableLines: CogsLine[] = variable.lines.flatMap((v): CogsLine[] =>
    v.component === "Toll Fee" && stations.length
      ? stations.map((s, k) => ({
          key: `V:Toll Fee:${k}:${s.code}`,
          group: "Variable Cost",
          component: "Toll Fee",
          code: s.code,
          name: s.name,
          basis: `${s.leg} · Group ${i.vehicle.group}`,
          amount: s.fees[i.vehicle.group - 1] ?? 0,
          fareCode: fareOf("Toll Fee"),
        }))
      : [
          {
            key: `V:${v.component}`,
            group: "Variable Cost",
            component: v.component,
            code: v.code,
            // The name of its setup (Salary Range, Fuel Cost, the route); none: the cost itself.
            name: setupNameOf(v.component) || v.component,
            basis: v.basis,
            amount: v.amount,
            fareCode: fareOf(v.component),
          },
        ],
  );

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
    variable,
    autoLines,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  };
}
