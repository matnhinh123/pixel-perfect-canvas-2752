import { describe, expect, it } from "vitest";
import { allocate } from "@/services/fixedCostMath";
import { calcFixedCost } from "@/services/fixedCostService";
import { seedFixedCosts } from "@/mock-data/fixedCost";

const base = { days: 30 };

describe("fixed cost allocation chain", () => {
  it("Year anchor converts down to Month and Day", () => {
    const r = allocate({ ...base, value: 3_600_000, base: 1, unit: "Year" });
    expect(r.year).toBe(3_600_000);
    expect(r.month).toBe(300_000);
    expect(r.day).toBe(10_000);
  });
  it("larger units than the anchor stay empty", () => {
    const r = allocate({ ...base, value: 300_000, base: 1, unit: "Month" });
    expect(r.year).toBeNull();
    expect(r.month).toBe(300_000);
    expect(r.day).toBe(10_000);
  });
  it("Day anchor is the daily cost", () => {
    const r = allocate({ ...base, value: 90_000, base: 3, unit: "Day" });
    expect(r).toEqual({ allocation: 30_000, year: null, month: null, day: 30_000 });
  });
  it("returns null instead of dividing by zero", () => {
    expect(allocate({ ...base, value: 100, base: 0, unit: "Day" }).day).toBeNull();
  });
});

describe("operating cost of a header + trailer (sheet)", () => {
  const day = (id: string) => calcFixedCost(seedFixedCosts().find((f) => f.id === id)!).day!;
  it("depreciation: value ÷ 60 months ÷ 26 days", () => {
    expect(Math.round(day("FC-DEP-HEAD"))).toBe(833_333);
    expect(Math.round(day("FC-DEP-TRL"))).toBe(179_487);
  });
  it("financial cost: value × 6.8 %/year ÷ 360 days", () => {
    expect(Math.round(day("FC-FIN-HEAD"))).toBe(245_556);
    expect(Math.round(day("FC-FIN-TRL"))).toBe(52_889);
  });
  it("total operating cost per day = 1,511,265", () => {
    const ids = ["FC-DEP-HEAD", "FC-DEP-TRL", "FC-FIN-HEAD", "FC-FIN-TRL", "FC-MGMT"];
    expect(Math.round(ids.reduce((s, id) => s + day(id), 0))).toBe(1_511_265);
  });
});
