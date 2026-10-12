import { describe, expect, it } from "vitest";
import { allocate } from "@/services/fixedCostMath";

const base = { days: 30, utilContainer: 1, utilDay: 1, apply: true };

describe("fixed cost allocation chain", () => {
  it("Year anchor converts down to Month, Day and Trip", () => {
    const r = allocate({
      ...base,
      value: 3_600_000,
      base: 1,
      unit: "Year",
      utilContainer: 2,
      utilDay: 1,
    });
    expect(r.year).toBe(3_600_000);
    expect(r.month).toBe(300_000);
    expect(r.day).toBe(10_000);
    expect(r.trip).toBe(5_000); // Day ÷ (2 containers / 1 day)
  });
  it("larger units than the anchor stay empty", () => {
    const r = allocate({ ...base, value: 300_000, base: 1, unit: "Month" });
    expect(r.year).toBeNull();
    expect(r.month).toBe(300_000);
    expect(r.day).toBe(10_000);
  });
  it("Trip = Day when utilization is off", () => {
    const r = allocate({ ...base, value: 90_000, base: 3, unit: "Day", apply: false });
    expect(r.day).toBe(30_000);
    expect(r.trip).toBe(30_000);
  });
  it("Trip anchor ignores days and utilization", () => {
    const r = allocate({ ...base, value: 500, base: 2, unit: "Trip", days: 0, utilContainer: 0 });
    expect(r).toEqual({ allocation: 250, year: null, month: null, day: null, trip: 250 });
  });
  it("returns null instead of dividing by zero", () => {
    expect(allocate({ ...base, value: 100, base: 0, unit: "Day" }).trip).toBeNull();
  });
});
