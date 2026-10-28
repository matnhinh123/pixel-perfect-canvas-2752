// Demo COGS: a few routes priced for a vehicle type, with the Fare Code mappings made for that type.
import type { CogsRecord } from "@/types";
import { buildCogs, mappingsFor } from "@/services/cost/cogsBuild";
import { routeTotals } from "@/services/cost/costMath";
import { cogsVehicleTypes } from "@/services/cost/cogsVehicle";
import { seedCostItems } from "./costMaster";
import { seedFixedCostSummaries, seedFixedCosts } from "./fixedCost";
import { seedTollStations } from "./tollCatalog";
import { seedFuelCosts, seedSalaryRangeRecords, seedVariableCostMappings } from "./variableSetup";
import { seedRoutes } from "./seed";
import { seedFiveTonTrucks, seedVehicleMasters } from "./vehicleMaster";

const meta = {
  createdAt: "2026-10-01T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-10-01T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

export function seedCogs(): CogsRecord[] {
  const salaryRanges = seedSalaryRangeRecords();
  const fuelCosts = seedFuelCosts();
  const fixedCosts = seedFixedCosts();
  const costs = seedCostItems();
  const routes = seedRoutes().filter((r) => routeTotals(r).calculated);
  const vehicles = cogsVehicleTypes([...seedVehicleMasters(), ...seedFiveTonTrucks()]);
  const picks: [number, string][] = [
    [0, "TRUCK · 5 tấn"],
    [1, "HEADER · 42GP"],
    [2, "TRUCK · 2 tấn"],
  ];
  return picks
    .filter(([i, t]) => routes[i] && vehicles.some((v) => v.key === t))
    .map(([i, vehicleType], n) => {
      const route = routes[i]!;
      const vehicle = vehicles.find((v) => v.key === vehicleType)!;
      const mappings = seedFixedCostSummaries();
      const mappingIds = mappingsFor(mappings, vehicle).map((m) => m.id);
      const b = buildCogs({
        route,
        vehicle,
        salaryRanges,
        fuelCosts,
        tollMasters: seedTollStations(),
        fixedCosts,
        mappings,
        mappingIds,
        variableMappings: seedVariableCostMappings(),
        utilizationFactor: 1,
        costs,
        excluded: [],
        overrides: {},
        others: [],
      });
      return {
        id: `COGS-${n + 1}`,
        // Route code + vehicle type, as the COGS created automatically ("RT-HCM-DN-T5").
        code: `${route.code}-${vehicle.kind === "TRUCK" ? `T${/(\d+)/.exec(vehicle.spec)?.[1] ?? ""}` : `H${vehicle.spec}`}`.slice(
          -20,
        ),
        name: `${route.name} · ${vehicleType}`,
        routeId: route.id,
        routeCode: route.code,
        routeName: route.name,
        vehicleType,
        mappingIds,
        utilizationFactor: 1,
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
