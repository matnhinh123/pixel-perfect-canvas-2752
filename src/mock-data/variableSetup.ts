// Demo Variable Cost setups for every vehicle type (all brands) of the demo vehicles: a Salary Range
// (SR-…) and a Fuel Cost (FU-…). Reefer containers: salary +15 %, fuel rate +20 % of the dry container.
import type { FuelCostRecord, SalaryRangeRecord } from "@/types";
import { cogsVehicleTypes, type CogsVehicleType } from "@/services/cost/cogsVehicle";
import { DEFAULT_RULE, scaleTiers, seedTiers } from "@/services/cost/salaryRange";
import { seedFiveTonTrucks, seedVehicleMasters } from "./vehicleMaster";

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

export const seedSalaryRangeRecords = (): SalaryRangeRecord[] =>
  demoTypes().map((t) => {
    const tiers = seedTiers(...scaleOf(t));
    return {
      id: `SR-${suffix(t)}`,
      code: `SR-${suffix(t)}`,
      name: `Driver salary · ${nameOf(t)}`,
      vehicleType: t.key,
      tiers: t.reefer ? scaleTiers(tiers, 15, 15) : tiers,
      rule: { ...DEFAULT_RULE },
      remark: "",
      ...meta,
    };
  });

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
