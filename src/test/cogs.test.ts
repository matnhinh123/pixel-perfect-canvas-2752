import { describe, expect, it } from "vitest";
import { seedRoutes } from "@/mock-data/seed";
import { cogsOf, variableCostOf } from "@/services/cost/cogsMath";
import { routeTotals } from "@/services/cost/costMath";
import { FIXED_PER_TRIP, FUEL_NORMS, FUEL_PRICE } from "@/mock-data/cogsRates";

describe("Variable Cost and COGS per Route × Vehicle Group", () => {
  const route = seedRoutes().find((r) => routeTotals(r).calculated)!;

  it("Variable Cost = fuel + toll + ferry + other, without fixed cost", () => {
    const v = variableCostOf(route);
    const t = routeTotals(route);
    expect(v.toll).toBe(t.tollCost);
    expect(v.ferry).toBe(t.ferryCost);
    expect(v.other).toBe(t.otherRouteCost);
    expect(v.total).toBe(v.fuel + v.toll + v.ferry + v.other);
    const norm = FUEL_NORMS[route.vehicleGroup] * (route.terrain === "Highland" ? 1.15 : 1);
    expect(v.fuel).toBeCloseTo(((norm * t.distanceKm) / 100) * FUEL_PRICE, -3);
  });

  it("COGS = fixed per trip + trip salary + variable cost", () => {
    const c = cogsOf(route);
    expect(c.fixed).toBe(FIXED_PER_TRIP[route.vehicleGroup]);
    expect(c.salary).toBeGreaterThan(0);
    expect(c.cogs).toBe(c.fixed + c.salary + c.variable);
  });
});
