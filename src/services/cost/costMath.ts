// Pure cost/route arithmetic shared by Routing, Cost and seed data. No storage access here.
import type { CostLine, CostSummary, RouteRecord, RouteSnapshot, TollStation } from "@/types";

export interface LegFigures {
  distance: number;
  estimatedTime: number;
  tollStations: TollStation[];
}

export const stationsTotal = (ts: TollStation[]) =>
  ts.reduce((s, t) => s + t.price * t.passCount, 0);

/** Outbound and Return legs, each with its own tolls — never "outbound × 2". */
export function routeLegs(r: RouteRecord): { outbound: LegFigures | null; ret: LegFigures | null } {
  const outbound = r.outbound;
  let ret: LegFigures | null = null;
  if (r.type === "Round Trip") {
    if (r.returnMode === "custom" && r.customReturn) ret = r.customReturn;
    else if (r.returnLeg) ret = r.returnLeg;
  }
  return { outbound, ret };
}

export interface RouteTotals {
  distanceKm: number;
  estimatedTimeMin: number;
  outboundToll: number;
  returnToll: number;
  /** Toll/Bridge stations of both legs (excludes ferries). */
  tollCost: number;
  /** Ferry stations of both legs + manual Ferry costs. */
  ferryCost: number;
  /** Manual costs that are not ferries (peak-hour surcharge, other). */
  otherRouteCost: number;
  manualTotal: number;
  /** Everything route-related: tolls + ferries + manual adjustments. */
  totalRouteCost: number;
  stationCount: number;
  calculated: boolean;
}

export function routeTotals(r: RouteRecord): RouteTotals {
  const { outbound, ret } = routeLegs(r);
  const legs = [outbound, ret].filter((l): l is LegFigures => !!l);
  const all = legs.flatMap((l) => l.tollStations);
  const nonFerry = all.filter((t) => t.feeType !== "Ferry");
  const ferryStations = all.filter((t) => t.feeType === "Ferry");
  const manualFerry = r.manualCosts
    .filter((m) => m.costType === "Ferry")
    .reduce((s, m) => s + m.amount, 0);
  const manualOther = r.manualCosts
    .filter((m) => m.costType !== "Ferry")
    .reduce((s, m) => s + m.amount, 0);
  const tollCost = stationsTotal(nonFerry);
  const ferryCost = stationsTotal(ferryStations) + manualFerry;
  return {
    distanceKm:
      r.distanceOverrides?.[r.type] ??
      Math.round(legs.reduce((s, l) => s + l.distance, 0) * 10) / 10,
    estimatedTimeMin: legs.reduce((s, l) => s + l.estimatedTime, 0),
    outboundToll: outbound ? stationsTotal(outbound.tollStations) : 0,
    returnToll: ret ? stationsTotal(ret.tollStations) : 0,
    tollCost,
    ferryCost,
    otherRouteCost: manualOther,
    manualTotal: manualFerry + manualOther,
    totalRouteCost: tollCost + ferryCost + manualOther,
    stationCount: all.length,
    calculated: !!outbound,
  };
}

export const snapshotOf = (r: RouteRecord): RouteSnapshot => {
  const t = routeTotals(r);
  return {
    routeCode: r.code,
    distanceKm: t.distanceKm,
    estimatedTimeMin: t.estimatedTimeMin,
    tollCost: t.tollCost,
    ferryCost: t.ferryCost,
    otherRouteCost: t.otherRouteCost,
  };
};

export const lineQuantity = (
  l: CostLine,
  s: Pick<RouteSnapshot, "distanceKm" | "estimatedTimeMin">,
) => (l.basis === "Per km" ? s.distanceKm : l.basis === "Per hour" ? s.estimatedTimeMin / 60 : 1);

export const lineAmount = (
  l: CostLine,
  s: Pick<RouteSnapshot, "distanceKm" | "estimatedTimeMin">,
) => Math.round(l.rate * lineQuantity(l, s));

export function summarize(lines: CostLine[], s: RouteSnapshot | null): CostSummary {
  const snap = s ?? {
    routeCode: "",
    distanceKm: 0,
    estimatedTimeMin: 0,
    tollCost: 0,
    ferryCost: 0,
    otherRouteCost: 0,
  };
  const sum = (cat: CostLine["category"]) =>
    lines.filter((l) => l.category === cat).reduce((a, l) => a + lineAmount(l, snap), 0);
  const fixed = sum("Fixed"),
    fuel = sum("Fuel"),
    driver = sum("Driver");
  const other = sum("Other") + snap.otherRouteCost;
  const toll = snap.tollCost,
    ferry = snap.ferryCost;
  return {
    fixed,
    fuel,
    driver,
    toll,
    ferry,
    other,
    total: fixed + fuel + driver + toll + ferry + other,
    distanceKm: snap.distanceKm,
    estimatedTimeMin: snap.estimatedTimeMin,
  };
}
