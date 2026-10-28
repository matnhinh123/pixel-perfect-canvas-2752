// Demo Variable Cost setups for the demo vehicles: a Salary Range per Truck Type and one for the headers
// (SR-H, a +15 % column per reefer container), and a Fuel Cost (FU-…) per vehicle type (all brands;
// reefer containers: fuel rate +20 % of the dry container).
import type {
  FuelCostRecord,
  SalaryRangeRecord,
  VariableComponent,
  VariableCostMappingRecord,
} from "@/types";
import { cogsVehicleTypes, type CogsVehicleType } from "@/services/cost/cogsVehicle";
import { DEFAULT_RULE, seedTiers } from "@/services/cost/salaryRange";
import { FUEL_TYPES, seedFiveTonTrucks, seedVehicleMasters } from "./vehicleMaster";
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
const suffix = (t: CogsVehicleType) => (t.kind === "TRUCK" ? `T${num(t.spec)}` : `H${t.spec}`);
const nameOf = (t: CogsVehicleType) =>
  t.kind === "TRUCK" ? `Truck ${t.spec}` : `Header + ${t.spec} ${t.specName}`;
/** [salary, road support fee] scale against the Truck 2T tiers. */
const scaleOf = (t: CogsVehicleType): [number, number] => {
  if (t.kind === "HEADER") return [1.45, 1.33];
  const tons = num(t.spec);
  return tons <= 1 ? [0.88, 1] : tons <= 2 ? [1, 1] : tons <= 5 ? [1.12, 1] : [1.28, 1.13];
};

/** Salary Range of a vehicle type: one per Truck Type (SR-T5), one for every header (SR-H). */
const salaryIdOf = (t: CogsVehicleType) => (t.kind === "HEADER" ? "SR-H" : `SR-${suffix(t)}`);

export const seedSalaryRangeRecords = (): SalaryRangeRecord[] => {
  const types = demoTypes();
  const trucks = types.filter((t) => t.kind === "TRUCK");
  const header = types.find((t) => t.kind === "HEADER");
  // Reefer 20 ft / 40 ft (Common Code Container Type).
  const reefers = ["22RT", "42RT"];
  return [
    ...trucks.map((t) => ({
      id: salaryIdOf(t),
      code: salaryIdOf(t),
      name: `Driver salary · ${nameOf(t)}`,
      vehicleType: t.key,
      tiers: seedTiers(...scaleOf(t)),
      containers: [],
      rule: { ...DEFAULT_RULE },
      remark: "",
      ...meta,
    })),
    ...(header
      ? [
          {
            id: "SR-H",
            code: "SR-H",
            name: "Driver salary · Header",
            vehicleType: "HEADER",
            tiers: seedTiers(...scaleOf(header), reefers),
            containers: reefers.map((container) => ({ container, pct: 15 })),
            rule: { ...DEFAULT_RULE },
            remark: "Reefer containers: extra rate +15 %, +20 % from 951 km.",
            ...meta,
          },
        ]
      : []),
  ];
};

/** Demo fuel prices (đ per liter / kWh / kg). */
const FUEL_PRICES: Record<string, number> = {
  Diesel: 18_500,
  Gasoline: 20_500,
  CNG: 16_000,
  LPG: 17_500,
  Electric: 3_500,
  Hybrid: 20_500,
};
/** One Fuel Cost (price) per Fuel Type of Common Code: FU-DIESEL, FU-GASOLINE… */
export const seedFuelCosts = (): FuelCostRecord[] =>
  FUEL_TYPES.map((fuelType) => ({
    id: `FU-${fuelType.toUpperCase()}`,
    code: `FU-${fuelType.toUpperCase()}`,
    fuelType,
    fuelPrice: FUEL_PRICES[fuelType] ?? 18_500,
    remark: "",
    ...meta,
  }));

/**
 * Demo Variable Cost Mappings, one per Fare Code for every vehicle type (all brands): Trip Salary → TDS
 * (Truck Driver Salary), Fuel Cost → FUE, Toll Fee → TOL.
 */
export const seedVariableCostMappings = (): VariableCostMappingRecord[] => {
  const fares: [string, VariableComponent][] = [
    ["TDS", "Trip Salary"],
    ["FUE", "Fuel Cost"],
    ["TOL", "Toll Fee"],
  ];
  const keys = demoTypes().map((t) => t.key);
  return fares.map(([fare, component]) => ({
    id: `VM-${fare}`,
    assignCostId: `CI-${fare}`,
    vehicleTypes: keys,
    component,
    ...meta,
  }));
};
