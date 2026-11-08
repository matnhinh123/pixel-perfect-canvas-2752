// The Fuel Rate a vehicle type burns on a Fuel Cost. A Fuel Cost lists its vehicle types (no brands):
// each Truck Type, and the headers as one row "HEADER"; a header pulling a given Container Type can be
// added ("HEADER · 22BU") with a rate of its own. Each one burns the rate set there, or, left empty, the
// average of its vehicles (Vehicle › Fuel Rate); a container left empty burns as "HEADER". A brand burns as
// its vehicle type. Each row has two rates, K1 (empty) and K2 (loaded); it burns the Estimate
// (K1 + K2) ÷ 2. Pure: the screens, the save and the COGS agree.
import type { FuelCostRecord, FuelVehicleRate } from "@/types";
import { withoutBrand, type CogsVehicleType } from "./cogsVehicle";

type Vt = Pick<CogsVehicleType, "key" | "brand" | "fuelRates">;

/** The row of every header, whatever container it pulls. */
export const HEADER_ROW = "HEADER";
export const isHeaderKey = (key: string) =>
  key === HEADER_ROW || key.startsWith(`${HEADER_ROW} · `);

/** Vehicle types running on a Fuel Type (brands left out). */
export const fuelUsers = <T extends Vt>(types: readonly T[], fuelType: string): T[] =>
  types.filter((t) => !t.brand && t.fuelRates[fuelType]);

/** The headers' figures on a fuel (the same heads pull every container): any header type running on it. */
export const headerTypeOn = <T extends Vt>(types: readonly T[], fuelType: string): T | undefined =>
  fuelUsers(types, fuelType).find((t) => isHeaderKey(t.key));

/** A row with K1 or K2 typed. */
export const hasSetRate = (v: FuelVehicleRate) =>
  v.rate !== null || (v.rateLoaded ?? null) !== null;

/** Estimate (K1 + K2) ÷ 2, to 2 decimals. */
export const estimateOf = (k1: number, k2: number) => Math.round(((k1 + k2) / 2) * 100) / 100;

/** K1 and K2 of a row: each one left empty is `fallback` (the vehicles' average, or HEADER's); never the other one. */
export const ratesOf = (v: FuelVehicleRate, fallback: { k1: number; k2: number }) => {
  return { k1: v.rate ?? fallback.k1, k2: v.rateLoaded ?? fallback.k2 };
};

const isBrandKey = (key: string) => key !== HEADER_ROW && withoutBrand(key) !== key;

/** What a new Fuel Cost lists: every Truck Type running on the fuel, and "HEADER", at the average. */
export const defaultFuelVehicles = (types: readonly Vt[], fuelType: string): FuelVehicleRate[] => [
  ...fuelUsers(types, fuelType)
    .filter((t) => !isHeaderKey(t.key))
    .map((t) => ({ vehicleType: t.key, rate: null })),
  ...(headerTypeOn(types, fuelType) ? [{ vehicleType: HEADER_ROW, rate: null }] : []),
];

/**
 * The vehicle types of a Fuel Cost (older ones, with no list: every type running on the fuel). Of an
 * older list: brands are left out, and its containers without a rate of their own become one "HEADER".
 */
export function fuelVehiclesOf(
  f: Pick<FuelCostRecord, "vehicles" | "fuelType">,
  types: readonly Vt[],
): FuelVehicleRate[] {
  if (!f.vehicles) return defaultFuelVehicles(types, f.fuelType);
  // Older rows (one Fuel Rate, no K2): K2 = that rate, so they burn as before.
  const list = f.vehicles
    .filter((v) => !isBrandKey(v.vehicleType))
    .map((v) => (v.rateLoaded === undefined && v.rate !== null ? { ...v, rateLoaded: v.rate } : v));
  const headers = list.filter((v) => isHeaderKey(v.vehicleType));
  if (!headers.length || headers.some((v) => v.vehicleType === HEADER_ROW)) return list;
  const kept = list.filter((v) => !isHeaderKey(v.vehicleType) || hasSetRate(v));
  return [
    ...kept.filter((v) => !isHeaderKey(v.vehicleType)),
    { vehicleType: HEADER_ROW, rate: null },
    ...kept.filter((v) => isHeaderKey(v.vehicleType)),
  ];
}

export interface FuelRateUse {
  /** Estimate (K1 + K2) ÷ 2, per 100 km; 0 = none. */
  rate: number;
  /** K1 (empty) and K2 (loaded), per 100 km. */
  k1: number;
  k2: number;
  /** "set": entered in the Fuel Cost; "average": the vehicles' own. */
  source: "set" | "average";
  /** Vehicles behind the average. */
  vehicles: number;
}

/**
 * The Fuel Rate a vehicle type burns on a Fuel Cost; undefined when the Fuel Cost does not list it (for a
 * brand: its type; for a header: its container, else "HEADER").
 */
export function fuelRateFor(
  f: Pick<FuelCostRecord, "vehicles" | "fuelType">,
  vt: Vt & Partial<Pick<CogsVehicleType, "fuelNorm">>,
): FuelRateUse | undefined {
  const own = vt.fuelRates[f.fuelType];
  const avg = own?.avg || vt.fuelNorm || 0;
  const average: FuelRateUse = {
    rate: avg,
    k1: avg,
    k2: avg,
    source: "average",
    vehicles: own?.vehicles ?? 0,
  };
  const vehicles = f.vehicles && fuelVehiclesOf(f, []);
  if (!vehicles) return average;
  // A brand burns as its vehicle type; a header as its container when that has a rate, else as "HEADER".
  const key = withoutBrand(vt.key);
  const exact = vehicles.find((x) => x.vehicleType === key);
  const header = isHeaderKey(key) ? vehicles.find((x) => x.vehicleType === HEADER_ROW) : undefined;
  const entry = exact && hasSetRate(exact) ? exact : (header ?? exact);
  if (!entry) return undefined;
  if (!hasSetRate(entry)) return average;
  // A container left half empty: that half burns as HEADER (its rate, or the headers' average).
  const base = entry !== header && header ? ratesOf(header, average) : average;
  const { k1, k2 } = ratesOf(entry, base);
  return { rate: estimateOf(k1, k2), k1, k2, source: "set", vehicles: average.vehicles };
}
