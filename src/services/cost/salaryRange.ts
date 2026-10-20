// Variable Cost: driver salary ranges (tiers by distance) per vehicle type, kept as versions, and the
// trip salary / fuel / toll figures computed from them for every route.
import { useSyncExternalStore } from "react";
import { readJson, subscribeKey, writeJson } from "@/repositories/storage";
import { currentUser } from "@/services/session";
import { FUEL_PRICE, TERRAIN_FACTORS } from "@/mock-data/cogsRates";
import type { RouteRecord } from "@/types";
import { routeTotals } from "./costMath";

export interface SalaryTier {
  /** Distance range in km, both ends included. */
  from: number;
  to: number;
  /** Salary for a trip of `from` km. */
  tripSalary: number;
  /** Added per km beyond `from` (đ/km). */
  extraRate: number;
  tollAllowance: number;
}

export type VehicleCategory = "Truck" | "Container";
export const VEHICLE_TYPES_BY_CATEGORY: Record<VehicleCategory, string[]> = {
  Truck: [
    "Xe tải 1T",
    "Xe tải 2T",
    "Xe tải 5T",
    "Xe tải 8T",
    "Xe tải 10T",
    "Xe tải 15T",
    "Xe tải 20T",
  ],
  Container: ["Đầu kéo 20ft", "Đầu kéo 40ft"],
};
export const ALL_VEHICLE_TYPES = [
  ...VEHICLE_TYPES_BY_CATEGORY.Truck,
  ...VEHICLE_TYPES_BY_CATEGORY.Container,
];

/** Fuel norm per vehicle type (litres / 100 km, plain road). */
export const FUEL_NORM_BY_TYPE: Record<string, number> = {
  "Xe tải 1T": 9,
  "Xe tải 2T": 11,
  "Xe tải 5T": 15,
  "Xe tải 8T": 18,
  "Xe tải 10T": 21,
  "Xe tải 15T": 25,
  "Xe tải 20T": 28,
  "Đầu kéo 20ft": 32,
  "Đầu kéo 40ft": 36,
};

export interface SalaryRangeVersion {
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  tables: Record<string, SalaryTier[]>;
  savedAt: string;
  savedBy: string;
}
export interface SalaryRangeStore {
  current: SalaryRangeVersion;
  /** Versions replaced by "Save Version", newest first. */
  history: SalaryRangeVersion[];
}

// ---------------------------------------------------------------- Seed (Xe tải 2T from the old Xink screen)

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
/** Salary scale of each vehicle type against Xe tải 2T. */
const SCALE: Record<string, number> = {
  "Xe tải 1T": 0.85,
  "Xe tải 2T": 1,
  "Xe tải 5T": 1.15,
  "Xe tải 8T": 1.3,
  "Xe tải 10T": 1.4,
  "Xe tải 15T": 1.55,
  "Xe tải 20T": 1.7,
  "Đầu kéo 20ft": 1.6,
  "Đầu kéo 40ft": 1.8,
};
const round = (n: number, step: number) => Math.round(n / step) * step;

export const seedSalaryRanges = (): SalaryRangeStore => ({
  current: {
    version: "v2.1",
    effectiveFrom: "2026-07-01",
    effectiveTo: "2026-12-31",
    tables: Object.fromEntries(
      ALL_VEHICLE_TYPES.map((type) => {
        const k = SCALE[type] ?? 1;
        return [
          type,
          BASE_2T.map(([from, to, s, x, t]) => ({
            from,
            to,
            tripSalary: round(s * k, 5_000),
            extraRate: round(x * k, 100),
            tollAllowance: t,
          })),
        ];
      }),
    ),
    savedAt: "2026-07-01T02:00:00.000Z",
    savedBy: "Nguyễn Minh Anh",
  },
  history: [],
});

// ---------------------------------------------------------------- Store

const KEY = "salary-ranges.v1";
let cache: SalaryRangeStore | null = null;
const getStore = (): SalaryRangeStore => {
  if (cache) return cache;
  const stored = readJson<SalaryRangeStore | null>(KEY, null);
  cache = stored ?? seedSalaryRanges();
  if (!stored) writeJson(KEY, cache);
  return cache;
};
const saveStore = (s: SalaryRangeStore) => {
  cache = s;
  writeJson(KEY, s);
};

export function useSalaryRanges(): SalaryRangeStore {
  return useSyncExternalStore((cb) => subscribeKey(KEY, cb), getStore, getStore);
}

const stamp = () => ({ savedAt: new Date().toISOString(), savedBy: currentUser.name });

export const salaryRangeService = {
  get: getStore,
  /** "Save" on one vehicle type: its tiers go into the current version. */
  saveTable(type: string, tiers: SalaryTier[]) {
    const s = getStore();
    saveStore({
      ...s,
      current: { ...s.current, tables: { ...s.current.tables, [type]: tiers }, ...stamp() },
    });
  },
  /** "Save Version": the current version moves to history; a new one starts with these dates. */
  saveVersion(effectiveFrom: string, effectiveTo: string) {
    const s = getStore();
    const [major, minor] = s.current.version.replace(/^v/, "").split(".").map(Number);
    const next = `v${major ?? 1}.${(minor ?? 0) + 1}`;
    saveStore({
      current: { ...s.current, version: next, effectiveFrom, effectiveTo, ...stamp() },
      history: [s.current, ...s.history],
    });
    return next;
  },
};

// ---------------------------------------------------------------- Rules

/** Tiers must start at 0 km and follow each other with no gap or overlap. */
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

// ---------------------------------------------------------------- Calculation

export interface TripSalary {
  tier: number;
  tierRange: string;
  base: number;
  extraKm: number;
  extraRate: number;
  extra: number;
  tollAllowance: number;
  /** Base + extra (the trip salary itself). */
  salary: number;
  /** Salary + toll allowance. */
  total: number;
}

/** Trip salary for `km`: tier salary + (km − tier start) × extra rate; past the last tier, the last one. */
export function tripSalaryOf(tiers: SalaryTier[], km: number): TripSalary | null {
  if (!tiers.length || !(km >= 0)) return null;
  let i = 0;
  tiers.forEach((t, j) => {
    if (t.from <= km) i = j;
  });
  const t = tiers[i]!;
  const extraKm = Math.max(0, Math.round((km - t.from) * 10) / 10);
  const extra = Math.round(extraKm * t.extraRate);
  return {
    tier: i + 1,
    tierRange: `${t.from} – ${t.to} km`,
    base: t.tripSalary,
    extraKm,
    extraRate: t.extraRate,
    extra,
    tollAllowance: t.tollAllowance,
    salary: t.tripSalary + extra,
    total: t.tripSalary + extra + t.tollAllowance,
  };
}

export interface RouteVariableCost {
  route: RouteRecord;
  calculated: boolean;
  distanceKm: number;
  salary: TripSalary | null;
  fuelNorm: number;
  terrainFactor: number;
  fuelLitres: number;
  fuelPrice: number;
  fuel: number;
  outboundToll: number;
  returnToll: number;
  toll: number;
  ferry: number;
  other: number;
  /** Toll + ferry + other route costs. */
  routeCost: number;
  /** Trip salary (incl. toll allowance) + fuel + route costs. */
  total: number;
}

export function routeVariableCost(
  route: RouteRecord,
  type: string,
  tiers: SalaryTier[],
): RouteVariableCost {
  const t = routeTotals(route);
  const terrainFactor = TERRAIN_FACTORS[route.terrain ?? "Plain"];
  const fuelNorm = Math.round((FUEL_NORM_BY_TYPE[type] ?? 0) * terrainFactor * 10) / 10;
  const fuelLitres = Math.round(((fuelNorm * t.distanceKm) / 100) * 10) / 10;
  const fuel = Math.round(fuelLitres * FUEL_PRICE);
  const salary = t.calculated ? tripSalaryOf(tiers, t.distanceKm) : null;
  const routeCost = t.tollCost + t.ferryCost + t.otherRouteCost;
  return {
    route,
    calculated: t.calculated,
    distanceKm: t.distanceKm,
    salary,
    fuelNorm,
    terrainFactor,
    fuelLitres,
    fuelPrice: FUEL_PRICE,
    fuel,
    outboundToll: t.outboundToll,
    returnToll: t.returnToll,
    toll: t.tollCost,
    ferry: t.ferryCost,
    other: t.otherRouteCost,
    routeCost,
    total: (salary?.total ?? 0) + fuel + routeCost,
  };
}
