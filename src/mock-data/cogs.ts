// Demo COGS: a few routes priced for a vehicle type with every cost included.
import type { CogsRecord } from "@/types";
import { buildCogs } from "@/services/cost/cogsBuild";
import { seedSalaryRanges } from "@/services/cost/salaryRange";
import { routeTotals } from "@/services/cost/costMath";
import { seedCostItems } from "./costMaster";
import { seedFixedCosts } from "./fixedCost";
import { seedRoutes } from "./seed";

const meta = {
  createdAt: "2026-10-01T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-10-01T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

export function seedCogs(): CogsRecord[] {
  const tables = seedSalaryRanges().current.tables;
  const fixedCosts = seedFixedCosts();
  const costs = seedCostItems();
  const routes = seedRoutes().filter((r) => routeTotals(r).calculated);
  const picks: [number, string][] = [
    [0, "Xe tải 8T"],
    [1, "Đầu kéo 40ft"],
    [2, "Xe tải 5T"],
  ];
  return picks
    .filter(([i]) => routes[i])
    .map(([i, vehicleType], n) => {
      const route = routes[i]!;
      const b = buildCogs({
        route,
        vehicleType,
        tiers: tables[vehicleType] ?? [],
        fixedCosts,
        costs,
        excluded: [],
        others: [],
      });
      return {
        id: `COGS-${n + 1}`,
        code: `COGS-${String(n + 1).padStart(4, "0")}`,
        routeId: route.id,
        routeCode: route.code,
        routeName: route.name,
        vehicleType,
        excluded: [],
        others: [],
        lines: b.lines,
        total: b.total,
        remark: "",
        status: "Active",
        ...meta,
      };
    });
}
