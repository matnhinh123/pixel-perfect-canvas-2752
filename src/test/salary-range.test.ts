import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE,
  scaleTiers,
  seedTiers,
  tripSalaryOf,
  validateTiers,
  type SalaryTier,
} from "@/services/cost/salaryRange";
import { coversVehicle, parseVehicleKey, vehicleKey } from "@/services/cost/cogsVehicle";

const tiers2T = seedTiers();

describe("Driver salary range (Variable Cost)", () => {
  it("seed tiers of Truck 2T are continuous 0 – 1,750 km", () => {
    expect(validateTiers(tiers2T)).toEqual({
      ok: true,
      message: "19 continuous tiers 0 – 1,750 km.",
    });
  });

  it("tier is picked by standard km; extra km is paid at the tier rate", () => {
    const s = tripSalaryOf(tiers2T, 420, 452)!;
    expect(s.tier).toBe(6);
    expect(s.extraKm).toBe(32);
    expect(s.extra).toBe(32 * s.extraRate);
    expect(s.total).toBe(s.base + s.extra + s.roadSupportFee);
    expect(tripSalaryOf(tiers2T, 420, 452, 100_000)?.roadSupportFee).toBe(100_000);
    expect(tripSalaryOf(tiers2T, 5_000)).toBeNull();
  });

  it("interpolates inside the tier and rounds up (QTL Excel rule)", () => {
    // 60 km in tier 51–100 (400,000 + 2,900/km): 400,000 + 2,900 × 9 = 426,100 → 430,000.
    const s = tripSalaryOf(tiers2T, 60, undefined, undefined, { rule: DEFAULT_RULE })!;
    expect(s.raw).toBe(426_100);
    expect(s.base).toBe(430_000);
    const noRound = tripSalaryOf(tiers2T, 60, undefined, undefined, {
      rule: { ...DEFAULT_RULE, roundStep: 0 },
    })!;
    expect(noRound.base).toBe(426_100);
  });

  it("adds the Highland surcharge to the road support fee", () => {
    const plain = tripSalaryOf(tiers2T, 60)!;
    const high = tripSalaryOf(tiers2T, 60, undefined, undefined, { terrain: "Highland" })!;
    expect(high.roadSupportFee - plain.roadSupportFee).toBe(DEFAULT_RULE.regionAmount);
    const off = tripSalaryOf(tiers2T, 60, undefined, undefined, {
      terrain: "Highland",
      rule: { ...DEFAULT_RULE, regionOn: false },
    })!;
    expect(off.roadSupportFee).toBe(plain.roadSupportFee);
  });

  it("copies tiers with a surcharge (reefer from dry); road support fee unchanged", () => {
    const rf = scaleTiers(tiers2T, 15, 20);
    expect(rf[1]!.tripSalary).toBe(Math.round(tiers2T[1]!.tripSalary * 1.15));
    expect(rf[1]!.extraRate).toBe(Math.round(tiers2T[1]!.extraRate * 1.2));
    expect(rf[1]!.roadSupportFee).toBe(tiers2T[1]!.roadSupportFee);
  });

  it("vehicle type keys: Truck → Truck Type, Header → Container (+ Reefer), then Brand", () => {
    expect(vehicleKey({ kind: "TRUCK", spec: "5 tấn", reefer: true })).toBe("TRUCK · 5 tấn");
    expect(vehicleKey({ kind: "HEADER", spec: "40 ft", reefer: true, brand: "HINO" })).toBe(
      "HEADER · 40 ft · Reefer · HINO",
    );
    expect(parseVehicleKey("HEADER · 40 ft · Reefer")).toEqual({
      kind: "HEADER",
      spec: "40 ft",
      reefer: true,
      brand: "",
    });
    expect(parseVehicleKey("TRUCK · 5 tấn · HINO")?.brand).toBe("HINO");
    expect(parseVehicleKey("Truck 5 tấn")).toBeUndefined();
  });

  it("a setup without a brand covers every brand; one with a brand only that brand", () => {
    expect(coversVehicle("TRUCK · 5 tấn", "TRUCK · 5 tấn · HINO")).toBe(true);
    expect(coversVehicle("TRUCK · 5 tấn · HINO", "TRUCK · 5 tấn · HINO")).toBe(true);
    expect(coversVehicle("TRUCK · 5 tấn · HINO", "TRUCK · 5 tấn · THACO")).toBe(false);
    expect(coversVehicle("TRUCK · 5 tấn · HINO", "TRUCK · 5 tấn")).toBe(false);
    expect(coversVehicle("HEADER · 40 ft", "HEADER · 40 ft · Reefer")).toBe(false);
  });

  it("rejects gaps, overlaps and a first tier that does not start at 0", () => {
    const t = (from: number, to: number): SalaryTier => ({
      from,
      to,
      tripSalary: 1,
      extraRate: 0,
      roadSupportFee: 0,
    });
    expect(validateTiers([t(5, 10)]).ok).toBe(false);
    expect(validateTiers([t(0, 50), t(60, 100)]).message).toBe(
      "Tier 2 must start at 51 km (right after Tier 1).",
    );
    expect(validateTiers([t(0, 50), t(51, 40)]).ok).toBe(false);
  });
});
