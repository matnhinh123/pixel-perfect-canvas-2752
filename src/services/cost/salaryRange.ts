// Variable Cost maths: the calculation rule of the trip salary, salary tiers, fuel cost and toll fees by
// vehicle group. The setups themselves (Salary Range, Fuel Cost, mappings) are records in repositories.
import type { CalcRule, RouteRecord, SalaryTier, TollStation } from "@/types";
import { routeLegs } from "./costMath";

export type { CalcRule, SalaryTier } from "@/types";
export const TOLL_GROUPS = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------- Calculation rule

export const DEFAULT_RULE: CalcRule = { roundStep: 10_000, regionOn: true, regionAmount: 200_000 };
/** The rule of a Salary Range; missing or bad values fall back to the defaults. */
export function ruleOf(r: Partial<CalcRule> | null | undefined): CalcRule {
  const out = { ...DEFAULT_RULE };
  for (const k of Object.keys(DEFAULT_RULE) as (keyof CalcRule)[]) {
    const x = r?.[k];
    if (typeof DEFAULT_RULE[k] === "boolean") {
      if (typeof x === "boolean") (out[k] as boolean) = x;
    } else if (typeof x === "number" && Number.isFinite(x) && x >= 0) (out[k] as number) = x;
  }
  return out;
}

// ---------------------------------------------------------------- Salary tiers

/** Truck 2T tiers of the old Xink screen; the demo Salary Ranges are scaled from it. */
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
const round = (n: number, step: number) => Math.round(n / step) * step;
/** Demo tiers: the Truck 2T tiers × a salary scale and a road support fee scale. */
export const seedTiers = (salaryScale = 1, roadFeeScale = 1): SalaryTier[] =>
  BASE_2T.map(([from, to, s, x, t]) => ({
    from,
    to,
    tripSalary: round(s * salaryScale, 500),
    extraRate: round(x * salaryScale, 10),
    roadSupportFee: round(t * roadFeeScale, 10_000),
  }));
/** Tiers copied with a surcharge (e.g. a reefer container from its dry one); road support fee unchanged. */
export const scaleTiers = (tiers: SalaryTier[], salaryPct: number, extraPct: number) =>
  tiers.map((t) => ({
    ...t,
    tripSalary: Math.round(t.tripSalary * (1 + salaryPct / 100)),
    extraRate: Math.round(t.extraRate * (1 + extraPct / 100)),
  }));

export function validateTiers(tiers: SalaryTier[]): { ok: boolean; message: string } {
  if (!tiers.length) return { ok: false, message: "Add at least one tier." };
  for (const [i, t] of tiers.entries()) {
    const n = i + 1;
    const nums = [t.from, t.to, t.tripSalary, t.extraRate, t.roadSupportFee];
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
  /** Salary written in the tier (at its start km). */
  tierSalary: number;
  /** Km of the standard distance past the tier start. */
  intoKm: number;
  /** Tier salary + extra rate × intoKm, before rounding. */
  raw: number;
  /** Trip salary: raw rounded up to the rule's step. */
  base: number;
  extraKm: number;
  extraRate: number;
  /** (actual − standard km) × extra rate. */
  extra: number;
  /** Tier road support fee (or the actual one given). */
  roadStd: number;
  /** Highland surcharge included in the road support fee. */
  region: number;
  roadSupportFee: number;
  /** Base + road support fee. */
  baseTotal: number;
  /** Base + extra + road support fee. */
  total: number;
  /** "Tier 2 (51–100 km) · 400.000 + 2.900 × 9 km = 426.100 → 430.000". */
  basis: string;
  roadSupportBasis: string;
}

/**
 * Trip salary (QTL Excel): the tier is picked by the standard distance; inside it the salary grows
 * with the extra rate per km past the tier start and is rounded up; km driven beyond the standard
 * distance are paid at the extra rate; the road support fee is the tier's (or the actual one) plus the
 * Highland surcharge. Null when the distance is past the last tier ("Out of range").
 */
export function tripSalaryOf(
  tiers: SalaryTier[],
  standardKm: number,
  actualKm?: number,
  actualRoadFee?: number,
  opts: { rule?: CalcRule; terrain?: string } = {},
): TripSalary | null {
  const rule = opts.rule ?? DEFAULT_RULE;
  if (!(standardKm >= 0)) return null;
  const i = tiers.findIndex((t) => standardKm >= t.from && standardKm < t.to + 1);
  if (i < 0) return null;
  const t = tiers[i]!;
  const intoKm = Math.max(0, Math.round((standardKm - t.from) * 10) / 10);
  const raw = Math.round(t.tripSalary + t.extraRate * intoKm);
  const base = rule.roundStep > 0 ? Math.ceil(raw / rule.roundStep) * rule.roundStep : raw;
  const extraKm = Math.max(0, Math.round(((actualKm ?? standardKm) - standardKm) * 10) / 10);
  const extra = Math.round(extraKm * t.extraRate);
  const roadStd = actualRoadFee ?? t.roadSupportFee;
  const region = rule.regionOn && opts.terrain === "Highland" ? rule.regionAmount : 0;
  const roadSupportFee = roadStd + region;
  const f = (n: number) => Math.round(n).toLocaleString("vi-VN");
  return {
    tier: i + 1,
    tierRange: `${t.from} – ${t.to} km`,
    tierSalary: t.tripSalary,
    intoKm,
    raw,
    base,
    extraKm,
    extraRate: t.extraRate,
    extra,
    roadStd,
    region,
    roadSupportFee,
    baseTotal: base + roadSupportFee,
    total: base + extra + roadSupportFee,
    basis:
      `Tier ${i + 1} (${t.from}–${t.to} km) · ${f(t.tripSalary)} + ${f(t.extraRate)} × ${intoKm} km = ${f(raw)}` +
      (base !== raw ? ` → ${f(base)}` : ""),
    roadSupportBasis: `Tier ${i + 1} ${f(roadStd)}${region ? ` + ${f(region)} Highland` : ""}`,
  };
}

// ---------------------------------------------------------------- Fuel

export const fuelCostOf = (km: number, rate: number, price: number) =>
  Math.round(((km * rate) / 100) * price);

// ---------------------------------------------------------------- Toll by vehicle group

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
