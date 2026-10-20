// COGS of one trip from a route, a vehicle type and the costs set up elsewhere. Pure (no storage),
// so the screen, the save and the demo seed all build it the same way.
import type {
  CogsLine,
  CogsOtherCost,
  CostItemRecord,
  FixedCostRecord,
  RouteRecord,
} from "@/types";
import { allocate } from "@/services/fixedCostMath";
import { formatNumber } from "@/lib/format";
import { routeVariableCost, type RouteVariableCost, type SalaryTier } from "./salaryRange";

/** Fixed Cost vehicle type codes of a vehicle type ("Xe tải 2T" → 2T / TRUCK, "Đầu kéo 40ft" → 40DC / HEAD). */
export const fixedCostCodes = (type: string): string[] => {
  const t = /(\d+)T$/.exec(type);
  if (t) return [`${t[1]}T`, "TRUCK"];
  if (type.endsWith("20ft")) return ["20DC", "HEAD"];
  if (type.endsWith("40ft")) return ["40DC", "HEAD"];
  return [];
};

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
  vehicleType: string;
  tiers: SalaryTier[];
  fixedCosts: FixedCostRecord[];
  costs: CostItemRecord[];
  excluded: readonly string[];
  others: readonly CogsOtherCost[];
}

export interface CogsBuild {
  variable: RouteVariableCost;
  fixedLines: CogsLine[];
  variableLines: CogsLine[];
  otherLines: CogsLine[];
  /** Lines included in the COGS (fixed / variable not excluded + other costs). */
  lines: CogsLine[];
  total: number;
}

export function buildCogs(i: CogsBuildInput): CogsBuild {
  const v = routeVariableCost(i.route, i.vehicleType, i.tiers);
  const codes = fixedCostCodes(i.vehicleType);
  const fixedLines: CogsLine[] = i.fixedCosts
    .filter(
      (f) => !f.deleted && f.status === "Active" && f.vehicleTypes.some((t) => codes.includes(t)),
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
        ? `Tier ${s.tier} (${s.tierRange}) + ${s.extraKm} km × ${formatNumber(s.extraRate)}`
        : "—",
      amount: s?.salary ?? 0,
    },
    {
      key: "V:allowance",
      group: "Variable Cost",
      code: "IRA",
      name: "Toll Allowance",
      basis: s ? `Tier ${s.tier}` : "—",
      amount: s?.tollAllowance ?? 0,
    },
    {
      key: "V:toll",
      group: "Variable Cost",
      code: "TOL",
      name: "Toll Cost",
      basis: "Tolls, ferries and manual costs of the route",
      amount: v.routeCost,
    },
    {
      key: "V:fuel",
      group: "Variable Cost",
      code: "FUE",
      name: "Fuel Cost",
      basis: `${v.fuelNorm} l/100km × ${v.distanceKm} km = ${v.fuelLitres} l × ${formatNumber(v.fuelPrice)} ₫`,
      amount: v.fuel,
    },
  ];
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
  const lines = [
    ...[...fixedLines, ...variableLines].filter((l) => !i.excluded.includes(l.key)),
    ...otherLines,
  ];
  return {
    variable: v,
    fixedLines,
    variableLines,
    otherLines,
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
  };
}
