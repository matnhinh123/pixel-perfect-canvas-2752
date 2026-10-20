// Variable Cost (old Xink screen): driver salary ranges, toll cost by vehicle group, fuel cost and the
// per route × vehicle type summary. Setups are kept in local storage with an effective version.
import { useSyncExternalStore } from "react";
import { readJson, subscribeKey, writeJson } from "@/repositories/storage";
import { currentUser } from "@/services/session";
import type { RouteRecord, TollStation } from "@/types";
import { routeLegs, routeTotals } from "./costMath";

// ---------------------------------------------------------------- Vehicle types

export type VehicleCategory = "Truck" | "Container";
export interface VehicleTypeDef {
  type: string;
  /** Short label used in the Trip Salary grid. */
  short: string;
  /** Toll vehicle group (Group 1..5). */
  group: number;
  category: VehicleCategory;
}
export const VEHICLE_TYPE_DEFS: VehicleTypeDef[] = [
  { type: "Xe tải 1T", short: "Truck 1T", group: 1, category: "Truck" },
  { type: "Xe tải 2T", short: "Truck 2T", group: 2, category: "Truck" },
  { type: "Xe tải 5T", short: "Truck 5T", group: 3, category: "Truck" },
  { type: "Xe tải 10T", short: "Truck 10T", group: 4, category: "Truck" },
  { type: "CNTR · Dry", short: "CNTR · Dry", group: 5, category: "Container" },
  { type: "CNTR · Ref", short: "CNTR · Reefer", group: 5, category: "Container" },
];
export const ALL_VEHICLE_TYPES = VEHICLE_TYPE_DEFS.map((d) => d.type);
export const VEHICLE_TYPES_BY_CATEGORY: Record<VehicleCategory, string[]> = {
  Truck: VEHICLE_TYPE_DEFS.filter((d) => d.category === "Truck").map((d) => d.type),
  Container: VEHICLE_TYPE_DEFS.filter((d) => d.category === "Container").map((d) => d.type),
};
export const defOf = (type: string) => VEHICLE_TYPE_DEFS.find((d) => d.type === type);
export const TOLL_GROUPS = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------- Versioned stores

export interface VersionMeta {
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  savedAt: string;
  savedBy: string;
}
const stamp = () => ({ savedAt: new Date().toISOString(), savedBy: currentUser.name });
const bump = (v: string) => {
  const [major, minor] = v.replace(/^v/, "").split(".").map(Number);
  return `v${major ?? 1}.${(minor ?? 0) + 1}`;
};

function makeStore<T>(key: string, seed: () => T) {
  let cache: T | null = null;
  const get = (): T => {
    if (cache) return cache;
    const stored = readJson<T | null>(key, null);
    cache = stored ?? seed();
    if (!stored) writeJson(key, cache);
    return cache;
  };
  const save = (v: T) => {
    cache = v;
    writeJson(key, v);
  };
  const subscribe = (cb: () => void) => subscribeKey(key, cb);
  return { get, save, subscribe };
}

// ---------------------------------------------------------------- Salary Range

export interface SalaryTier {
  from: number;
  to: number;
  /** Salary of a trip whose standard distance falls in the tier. */
  tripSalary: number;
  /** Paid per km driven beyond the standard distance (đ/km). */
  extraRate: number;
  tollAllowance: number;
}
export interface SalaryRangeVersion extends VersionMeta {
  tables: Record<string, SalaryTier[]>;
}
export interface SalaryRangeStore {
  current: SalaryRangeVersion;
  history: SalaryRangeVersion[];
}

/** Xe tải 2T tiers from the old Xink screen; the other types are scaled from it. */
const BASE_2T: [number, number, number, number, number][] = [
  [0, 50, 400_000, 0, 50_000],
  [51, 100, 400_000, 2_900, 100_000],
  [101, 150, 545_000, 2_600, 150_000],
  [151, 250, 675_000, 2_400, 150_000],
  [251, 350, 915_000, 2_000, 150_000],
  [351, 450, 1_115_000, 1_800, 200_000],
  [451, 550, 1_295_000, 1_300, 250_000],
  [551, 650, 1_425_000, 1_200, 300_000],
  [651, 750, 1_545_000, 1_100, 350_000],
  [751, 850, 1_655_000, 1_100, 400_000],
  [851, 950, 1_765_000, 2_000, 450_000],
  [951, 1050, 1_965_000, 2_000, 500_000],
  [1051, 1150, 2_165_000, 2_000, 550_000],
  [1151, 1250, 2_365_000, 2_000, 600_000],
  [1251, 1350, 2_565_000, 2_000, 600_000],
  [1351, 1450, 2_765_000, 2_000, 600_000],
  [1451, 1550, 2_965_000, 2_000, 600_000],
  [1551, 1650, 3_165_000, 2_000, 700_000],
  [1651, 1750, 3_365_000, 2_000, 700_000],
];
/** [salary scale, allowance scale] of each vehicle type against Xe tải 2T. */
const SCALE: Record<string, [number, number]> = {
  "Xe tải 1T": [0.88, 1],
  "Xe tải 2T": [1, 1],
  "Xe tải 5T": [1.12, 1],
  "Xe tải 10T": [1.28, 1.13],
  "CNTR · Dry": [1.45, 1.33],
  "CNTR · Ref": [1.667, 1.33],
};
const round = (n: number, step: number) => Math.round(n / step) * step;

export const seedSalaryRanges = (): SalaryRangeStore => ({
  current: {
    version: "v2.1",
    effectiveFrom: "2026-07-01",
    effectiveTo: "2026-12-31",
    tables: Object.fromEntries(
      ALL_VEHICLE_TYPES.map((type) => {
        const [k, a] = SCALE[type] ?? [1, 1];
        return [
          type,
          BASE_2T.map(([from, to, s, x, t]) => ({
            from,
            to,
            tripSalary: round(s * k, 500),
            extraRate: round(x * k, 10),
            tollAllowance: round(t * a, 10_000),
          })),
        ];
      }),
    ),
    savedAt: "2026-07-15T03:30:00.000Z",
    savedBy: "System",
  },
  history: [],
});

const salaryStore = makeStore<SalaryRangeStore>("salary-ranges.v2", seedSalaryRanges);
export const useSalaryRanges = () =>
  useSyncExternalStore(salaryStore.subscribe, salaryStore.get, salaryStore.get);

export const salaryRangeService = {
  get: salaryStore.get,
  saveTable(type: string, tiers: SalaryTier[]) {
    const s = salaryStore.get();
    salaryStore.save({
      ...s,
      current: { ...s.current, tables: { ...s.current.tables, [type]: tiers }, ...stamp() },
    });
  },
  saveVersion(effectiveFrom: string, effectiveTo: string) {
    const s = salaryStore.get();
    const version = bump(s.current.version);
    salaryStore.save({
      current: { ...s.current, version, effectiveFrom, effectiveTo, ...stamp() },
      history: [s.current, ...s.history],
    });
    return version;
  },
};

export function validateTiers(tiers: SalaryTier[]): { ok: boolean; message: string } {
  if (!tiers.length) return { ok: false, message: "Add at least one tier." };
  for (const [i, t] of tiers.entries()) {
    const n = i + 1;
    const nums = [t.from, t.to, t.tripSalary, t.extraRate, t.tollAllowance];
    if (nums.some((v) => !Number.isFinite(v) || v < 0))
      return { ok: false, message: `Tier ${n}: every value must be a number of 0 or more.` };
    const expected = i === 0 ? 0 : tiers[i - 1]!.to + 1;
    if (t.from !== expected)
      return {
        ok: false,
        message:
          i === 0
            ? "Tier 1 must start at 0 km."
            : `Tier ${n} must start at ${expected} km (right after Tier ${n - 1}).`,
      };
    if (t.to < t.from)
      return { ok: false, message: `Tier ${n}: the end of the range is before its start.` };
  }
  const last = tiers[tiers.length - 1]!;
  return {
    ok: true,
    message: `${tiers.length} continuous tiers 0 – ${last.to.toLocaleString("en-US")} km.`,
  };
}

export interface TripSalary {
  tier: number;
  tierRange: string;
  /** Salary of the tier the standard distance falls in. */
  base: number;
  extraKm: number;
  extraRate: number;
  /** (actual − standard km) × extra rate. */
  extra: number;
  tollAllowance: number;
  /** Base + toll allowance. */
  baseTotal: number;
  /** Base + extra + toll allowance. */
  total: number;
}

/**
 * Salary of a trip: the tier is picked by the standard distance; km driven beyond it are paid at
 * the tier's extra rate; the toll allowance is the tier's unless an actual toll is given.
 * Null when the distance is past the last tier ("Out of range").
 */
export function tripSalaryOf(
  tiers: SalaryTier[],
  standardKm: number,
  actualKm?: number,
  actualToll?: number,
): TripSalary | null {
  if (!(standardKm >= 0)) return null;
  const i = tiers.findIndex((t) => standardKm >= t.from && standardKm < t.to + 1);
  if (i < 0) return null;
  const t = tiers[i]!;
  const extraKm = Math.max(0, Math.round(((actualKm ?? standardKm) - standardKm) * 10) / 10);
  const extra = Math.round(extraKm * t.extraRate);
  const tollAllowance = actualToll ?? t.tollAllowance;
  return {
    tier: i + 1,
    tierRange: `${t.from} – ${t.to} km`,
    base: t.tripSalary,
    extraKm,
    extraRate: t.extraRate,
    extra,
    tollAllowance,
    baseTotal: t.tripSalary + tollAllowance,
    total: t.tripSalary + extra + tollAllowance,
  };
}

// ---------------------------------------------------------------- Fuel

export interface FuelSetup extends VersionMeta {
  price: number;
  basePrice: number;
  /** Litres per 100 km per vehicle type. */
  norms: Record<string, number>;
}
export const seedFuelSetup = (): FuelSetup => ({
  version: "v2.0",
  effectiveFrom: "2026-07-15",
  effectiveTo: "2026-12-31",
  savedAt: "2026-07-15T03:30:00.000Z",
  savedBy: "Accounting",
  price: 18_500,
  basePrice: 18_500,
  norms: {
    "Xe tải 1T": 10,
    "Xe tải 2T": 14,
    "Xe tải 5T": 20,
    "Xe tải 10T": 26,
    "CNTR · Dry": 32,
    "CNTR · Ref": 38,
  },
});
const fuelStore = makeStore<FuelSetup>("fuel-setup.v1", seedFuelSetup);
export const useFuelSetup = () =>
  useSyncExternalStore(fuelStore.subscribe, fuelStore.get, fuelStore.get);
export const fuelService = {
  get: fuelStore.get,
  /** Saves price + norms as a new version. */
  save(price: number, norms: Record<string, number>) {
    const s = fuelStore.get();
    const version = bump(s.version);
    fuelStore.save({ ...s, price, norms, version, ...stamp() });
    return version;
  },
};
export const fuelCostOf = (km: number, norm: number, price: number) =>
  Math.round(((km * norm) / 100) * price);

// ---------------------------------------------------------------- Toll by vehicle group

export const seedTollVersion = (): VersionMeta => ({
  version: "v1.5",
  effectiveFrom: "2026-07-01",
  effectiveTo: "2026-12-31",
  savedAt: "2026-07-15T03:30:00.000Z",
  savedBy: "System",
});
const tollVersionStore = makeStore<VersionMeta>("toll-cost-version.v1", seedTollVersion);
export const useTollVersion = () =>
  useSyncExternalStore(tollVersionStore.subscribe, tollVersionStore.get, tollVersionStore.get);
export const tollVersionService = {
  saveVersion(effectiveFrom: string, effectiveTo: string) {
    const s = tollVersionStore.get();
    const version = bump(s.version);
    tollVersionStore.save({ version, effectiveFrom, effectiveTo, ...stamp() });
    return version;
  },
};

/** Toll Station master entry as far as fees go. */
export interface TollMaster {
  code: string;
  name: string;
  prices: readonly number[];
}
export interface RouteTollStation {
  leg: "Departure" | "Return";
  code: string;
  name: string;
  /** Fee per vehicle group 1..5 (× pass count). */
  fees: number[];
}
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

/** Stations of a route with their fee for each vehicle group (from the Toll Station master). */
export function routeTollStations(route: RouteRecord, masters: TollMaster[]): RouteTollStation[] {
  const { outbound, ret } = routeLegs(route);
  const row = (leg: RouteTollStation["leg"], t: TollStation): RouteTollStation => {
    const m =
      (t.code ? masters.find((x) => x.code === t.code) : undefined) ??
      masters.find((x) => fold(x.name) === fold(t.name));
    const fees = TOLL_GROUPS.map((g) => (m ? (m.prices[g - 1] ?? 0) : t.price) * t.passCount);
    return { leg, code: m?.code ?? t.code ?? "—", name: t.name, fees };
  };
  return [
    ...(outbound?.tollStations ?? []).map((t) => row("Departure", t)),
    ...(ret?.tollStations ?? []).map((t) => row("Return", t)),
  ];
}
export const tollTotals = (stations: RouteTollStation[]) =>
  TOLL_GROUPS.map((_, i) => stations.reduce((s, x) => s + (x.fees[i] ?? 0), 0));

// ---------------------------------------------------------------- Other cost (Summary)

export interface OtherCostStore {
  values: Record<string, number>;
  savedAt: string;
  savedBy: string;
}
const otherStore = makeStore<OtherCostStore>("variable-other.v1", () => ({
  values: {},
  savedAt: "2026-07-15T03:30:00.000Z",
  savedBy: "System",
}));
export const useOtherCosts = () =>
  useSyncExternalStore(otherStore.subscribe, otherStore.get, otherStore.get);
export const otherKey = (routeId: string, type: string) => `${routeId}|${type}`;
export const otherCostService = {
  get: otherStore.get,
  set(routeId: string, type: string, amount: number) {
    const s = otherStore.get();
    otherStore.save({ values: { ...s.values, [otherKey(routeId, type)]: amount }, ...stamp() });
  },
};

// ---------------------------------------------------------------- Route × vehicle type

export interface VariableContext {
  tables: Record<string, SalaryTier[]>;
  fuel: Pick<FuelSetup, "price" | "norms">;
  masters: TollMaster[];
  others: Record<string, number>;
}

export interface RouteVariableCost {
  route: RouteRecord;
  type: string;
  group: number;
  calculated: boolean;
  /** Standard distance of the route (km). */
  stdKm: number;
  salary: TripSalary | null;
  fuelNorm: number;
  fuelPrice: number;
  fuelLitres: number;
  fuel: number;
  /** Σ station fees at the vehicle group's column. */
  toll: number;
  stationCount: number;
  other: number;
  /** Fuel + driver (trip salary) + toll + other. */
  total: number;
}

export function routeVariableCost(
  route: RouteRecord,
  type: string,
  ctx: VariableContext,
  /** A vehicle of the Vehicle master: its own toll group and fuel rate. */
  vehicle: { group?: number; fuelNorm?: number } = {},
): RouteVariableCost {
  const t = routeTotals(route);
  const group = vehicle.group || (defOf(type)?.group ?? 1);
  const stdKm = Math.round(t.distanceKm);
  const fuelNorm = vehicle.fuelNorm || (ctx.fuel.norms[type] ?? 0);
  const fuel = fuelCostOf(stdKm, fuelNorm, ctx.fuel.price);
  const stations = routeTollStations(route, ctx.masters);
  const toll = tollTotals(stations)[group - 1] ?? 0;
  const salary = t.calculated ? tripSalaryOf(ctx.tables[type] ?? [], stdKm) : null;
  const other = ctx.others[otherKey(route.id, type)] ?? 0;
  return {
    route,
    type,
    group,
    calculated: t.calculated,
    stdKm,
    salary,
    fuelNorm,
    fuelPrice: ctx.fuel.price,
    fuelLitres: Math.round(((stdKm * fuelNorm) / 100) * 10) / 10,
    fuel,
    toll,
    stationCount: stations.length,
    other,
    total: fuel + (salary?.base ?? 0) + toll + other,
  };
}
