// Demo rate basis for Variable Cost and COGS (Blueprint MD-13 / MD-15 / MD-12). Stand-ins until the
// Trip Salary, Fuel norm and Fixed Cost allocation masters feed these screens.
import type { Terrain, VehicleGroup } from "@/types";
import { RATE_TABLE } from "./rates";

/** Base fuel norm per Vehicle Group (litres / 100 km, plain road). */
export const FUEL_NORMS: Record<VehicleGroup, number> = {
  "Van / Pickup": 10,
  "Light Truck": 14,
  "Medium Truck": 20,
  "Heavy Truck": 28,
  "Tractor / Container Truck": 35,
};

/** Reference diesel price (VND / litre). */
export const FUEL_PRICE = 19_500;

/** Terrain adjustment applied to the fuel norm. */
export const TERRAIN_FACTORS: Record<Terrain, number> = { Plain: 1, Highland: 1.15 };

/** Trip salary bands: Vehicle Group × distance range (VND / trip). */
export const SALARY_BANDS: { label: string; maxKm: number }[] = [
  { label: "≤ 50 km", maxKm: 50 },
  { label: "50 – 150 km", maxKm: 150 },
  { label: "150 – 300 km", maxKm: 300 },
  { label: "> 300 km", maxKm: Infinity },
];
export const TRIP_SALARY: Record<VehicleGroup, [number, number, number, number]> = {
  "Van / Pickup": [250_000, 400_000, 650_000, 1_000_000],
  "Light Truck": [300_000, 500_000, 800_000, 1_200_000],
  "Medium Truck": [350_000, 600_000, 950_000, 1_450_000],
  "Heavy Truck": [400_000, 700_000, 1_100_000, 1_700_000],
  "Tractor / Container Truck": [450_000, 800_000, 1_300_000, 2_000_000],
};

/** Fixed cost (depreciation, insurance…) allocated per trip. */
export const FIXED_PER_TRIP: Record<VehicleGroup, number> = Object.fromEntries(
  Object.entries(RATE_TABLE).map(([g, r]) => [g, r.fixed]),
) as Record<VehicleGroup, number>;
