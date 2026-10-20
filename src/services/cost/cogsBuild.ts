// COGS of one trip from a route, a vehicle type (from the Vehicle master) and the costs set up
// elsewhere. Pure (no storage), so the screen, the save and the demo seed all build it the same way.
import type {
  CogsLine,
  CogsOtherCost,
  CostItemRecord,
  FixedCostRecord,
  RouteRecord,
} from "@/types";
import { allocate } from "@/services/fixedCostMath";
import { formatNumber } from "@/lib/format";
import {
  routeVariableCost,
  type FuelSetup,
  type RouteVariableCost,
  type SalaryTier,
  type TollMaster,
} from "./salaryRange";
import type { CogsVehicleType } from "./cogsVehicle";
import { coversCogsVehicle } from "@/services/fixedCostVehicle";

const tripOf = (f: FixedCostRecord) =>
  allocate({
    value: f.costValue * f.exchangeRate,
    base: f.allocationBase,
    unit: f.allocationUnit,
    days: f.allocationDays,
    utilContainer: f.utilContainer,
    utilDay: f.utilDay,
    apply: f.applyUtilization,
  }).trip ?? 0;

export interface CogsBuildInput {
  route: RouteRecord;
  vehicle: CogsVehicleType;
  tables: Record<string, SalaryTier[]>;
  fuel: Pick<FuelSetup, "price" | "norms">;
  tollMasters: TollMaster[];
  fixedCosts: FixedCostRecord[];
  costs: CostItemRecord[];
  excluded: readonly string[];
  overrides: Readonly<Record<string, number>>;
  others: readonly CogsOtherCost[];
}

export interface CogsBuild {
  variable: RouteVariableCost;
  /** Every Fixed / Variable cost that applies, before removal or edits. */
  autoLines: CogsLine[];
  /** Lines in the COGS: auto lines not removed (edited amounts applied) + other costs. */
  lines: CogsLine[];
  total: number;
}

export function buildCogs(i: CogsBuildInput): CogsBuild {
  const vt = i.vehicle;
  const v = routeVariableCost(
    i.route,
    vt.salaryTable,
    { tables: i.tables, fuel: i.fuel, masters: i.tollMasters, others: {} },
    { group: vt.group, fuelNorm: vt.fuelNorm },
  );
  const fixedLines: CogsLine[] = i.fixedCosts
    .filter(
      (f) =>
        !f.deleted && f.status === "Active" && f.vehicleTypes.some((t) => coversCogsVehicle(t, vt)),
    )
    .map((f) => ({
      key: `F:${f.id}`,
      group: "Fixed Cost",
      code: f.code,
      name: f.name,
      basis: `${formatNumber(f.costValue)} ${f.currency} per ${f.allocationBase} ${f.allocationUnit} → per trip`,
      amount: Math.round(tripOf(f)),
    }));
  const s = v.salary;
  const variableLines: CogsLine[] = [
    {
      key: "V:salary",
      group: "Variable Cost",
      code: "TDS",
      name: "Trip Salary",
      basis: s
        ? `${vt.salaryTable} · Tier ${s.tier} (${s.tierRange}) · ${v.stdKm} km`
        : "Out of range",
      amount: s?.base ?? 0,
    },
    {
      key: "V:allowance",
      group: "Variable Cost",
      code: "IRA",
      name: "Toll Allowance",
      basis: s ? `${vt.salaryTable} · Tier ${s.tier}` : "—",
      amount: s?.tollAllowance ?? 0,
    },
    {
      key: "V:toll",
      group: "Variable Cost",
      code: "TOL",
      name: "Toll Cost",
      basis: `${v.stationCount} stations · Group ${v.group}`,
      amount: v.toll,
    },
    {
      key: "V:fuel",
      group: "Variable Cost",
      code: "FUE",
      name: "Fuel Cost",
      basis: `${v.fuelNorm} l/100km × ${v.stdKm} km = ${v.fuelLitres} l × ${formatNumber(v.fuelPrice)} ₫`,
      amount: v.fuel,
    },
  ];
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
  return { variable: v, autoLines, lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}
