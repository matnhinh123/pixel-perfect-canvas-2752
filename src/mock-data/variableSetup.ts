// Demo Variable Cost setups for every vehicle type (all brands) of the demo vehicles: a Salary Range
// (SR-…) and a Fuel Cost (FU-…). Reefer containers: salary +15 %, fuel rate +20 % of the dry container.
import type { FuelCostRecord, SalaryRangeRecord, VariableCostMappingRecord } from "@/types";
import { cogsVehicleTypes, type CogsVehicleType } from "@/services/cost/cogsVehicle";
import { DEFAULT_RULE, seedTiers } from "@/services/cost/salaryRange";
import { seedFiveTonTrucks, seedVehicleMasters } from "./vehicleMaster";
import { seedRoutes } from "./seed";
import { routeTotals } from "@/services/cost/costMath";

const meta = {
  status: "Active" as const,
  createdAt: "2026-10-01T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-10-01T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

const demoTypes = () =>
  cogsVehicleTypes([...seedVehicleMasters(), ...seedFiveTonTrucks()]).filter((t) => !t.brand);
const num = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? 0);
/** "SR-T5", "SR-H40", "SR-H40R". */
const suffix = (t: CogsVehicleType) =>
  `${t.kind === "TRUCK" ? "T" : "H"}${num(t.spec)}${t.reefer ? "R" : ""}`;
const nameOf = (t: CogsVehicleType) =>
  t.kind === "TRUCK" ? `Truck ${t.spec}` : `Header + ${t.spec}${t.reefer ? " reefer" : ""}`;
/** [salary, road support fee] scale against the Truck 2T tiers. */
const scaleOf = (t: CogsVehicleType): [number, number] => {
  if (t.kind === "HEADER") return [1.45, 1.33];
  const tons = num(t.spec);
  return tons <= 1 ? [0.88, 1] : tons <= 2 ? [1, 1] : tons <= 5 ? [1.12, 1] : [1.28, 1.13];
};

/** Salary Range of a vehicle type: a container size's dry and reefer types share one (SR-H40). */
const salaryIdOf = (t: CogsVehicleType) => `SR-${suffix({ ...t, reefer: false })}`;

export const seedSalaryRangeRecords = (): SalaryRangeRecord[] => {
  const types = demoTypes();
  return types
    .filter((t) => !t.reefer)
    .map((t) => ({
      id: salaryIdOf(t),
      code: salaryIdOf(t),
      name: `Driver salary · ${nameOf(t)}`,
      vehicleTypes: types.filter((x) => salaryIdOf(x) === salaryIdOf(t)).map((x) => x.key),
      tiers: seedTiers(...scaleOf(t)),
      reeferPct: 15,
      rule: { ...DEFAULT_RULE },
      remark: t.kind === "HEADER" ? "Reefer container: extra rate +15 %, +20 % from 951 km." : "",
      ...meta,
    }));
};

export const seedFuelCosts = (): FuelCostRecord[] =>
  demoTypes().map((t) => {
    const rate = t.fuelNorm || (t.kind === "TRUCK" ? 14 : 32);
    return {
      id: `FU-${suffix(t)}`,
      code: `FU-${suffix(t)}`,
      name: `Fuel · ${nameOf(t)}`,
      vehicleType: t.key,
      fuelType: t.fuelType || "Diesel",
      fuelRate: t.reefer ? Math.round(rate * 1.2 * 10) / 10 : rate,
      fuelPrice: 18_500,
      remark: t.reefer ? "Reefer: +20 % for the cooling unit" : "",
      ...meta,
    };
  });

/**
 * Demo Variable Cost Mappings: every calculated route × every vehicle type (all brands), with the
 * vehicle type's SR-… / FU-…, booked to TRK (Domestic Trucking Charge).
 */
export const seedVariableCostMappings = (): VariableCostMappingRecord[] => {
  const routes = seedRoutes().filter((r) => routeTotals(r).calculated);
  return routes.flatMap((r) =>
    demoTypes().map((t) => ({
      id: `VM-${r.id}-${suffix(t)}`,
      routeId: r.id,
      vehicleType: t.key,
      salaryRangeId: salaryIdOf(t),
      fuelCostId: `FU-${suffix(t)}`,
      assignCostId: "CI-TRK",
      remark: "",
      ...meta,
    })),
  );
};
