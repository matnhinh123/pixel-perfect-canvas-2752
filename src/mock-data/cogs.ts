// Demo COGS: a few routes priced for a vehicle type with every cost included.
import type { CogsRecord } from "@/types";
import { buildCogs } from "@/services/cost/cogsBuild";
import { seedFuelSetup, seedSalaryRanges } from "@/services/cost/salaryRange";
import { routeTotals } from "@/services/cost/costMath";
import { cogsVehicleTypes } from "@/services/cost/cogsVehicle";
import { seedCostItems } from "./costMaster";
import { seedFixedCosts } from "./fixedCost";
import { seedTollStations } from "./tollCatalog";
import { seedRoutes } from "./seed";
import { seedFiveTonTrucks, seedVehicleMasters } from "./vehicleMaster";

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
  const vehicles = cogsVehicleTypes([...seedVehicleMasters(), ...seedFiveTonTrucks()]);
  const picks: [number, string][] = [
    [0, "Truck 5 tấn"],
    [1, "Header + 40 ft"],
    [2, "Truck 2 tấn"],
  ];
  return picks
    .filter(([i, t]) => routes[i] && vehicles.some((v) => v.key === t))
    .map(([i, vehicleType], n) => {
      const route = routes[i]!;
      const b = buildCogs({
        route,
        vehicle: vehicles.find((v) => v.key === vehicleType)!,
        tables,
        fuel: seedFuelSetup(),
        tollMasters: seedTollStations(),
        fixedCosts,
        costs,
        excluded: [],
        overrides: {},
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
        overrides: {},
        others: [],
        lines: b.lines,
        total: b.total,
        remark: "",
        status: "Active",
        ...meta,
      };
    });
}
