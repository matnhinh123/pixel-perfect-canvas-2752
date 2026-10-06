// Fake service layer. Swap these implementations for real API calls later.
import { routes, services, type RouteRecord, type TollLine, type ManualCost } from "./mock-data";

export const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
export const formatDuration = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

export const routeService = {
  list: () => routes,
  get: (id: string) => routes.find((r) => r.id === id),
};
export const serviceService = {
  list: () => services,
  get: (id: string) => services.find((s) => s.id === id),
};

export const tollTotal = (tolls: TollLine[]) => tolls.reduce((s, t) => s + t.unitPrice * t.passCount, 0);
export const manualTotal = (m: ManualCost[]) => m.reduce((s, x) => s + x.amount, 0);
export const routeTollCost = (r: RouteRecord) => {
  const one = tollTotal(r.tolls);
  return (r.type === "Round Trip" ? one * 2 : one) + manualTotal(r.manualCosts);
};

/** Simple mock COGS model for a route. */
export const cogs = (r: RouteRecord) => {
  const legs = r.type === "Round Trip" ? 2 : 1;
  const km = r.distanceKm * legs;
  const fixed = 650000;
  const driver = 450000 * legs;
  const variable = km * 10700;
  const toll = tollTotal(r.tolls.filter((t) => t.feeType !== "Ferry")) * legs;
  const ferry = tollTotal(r.tolls.filter((t) => t.feeType === "Ferry")) * legs + manualTotal(r.manualCosts);
  return { fixed, driver, variable, toll, ferry, total: fixed + driver + variable + toll + ferry };
};
