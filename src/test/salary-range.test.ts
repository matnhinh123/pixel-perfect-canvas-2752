import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE,
  autoTripSalaries,
  containerRateOf,
  scaleTiers,
  seedTiers,
  tripSalaryOf,
  validateTiers,
  type SalaryTier,
} from "@/services/cost/salaryRange";
import { seedVehicleMasters } from "@/mock-data/vehicleMaster";
import {
  cogsVehicleTypes,
  containerOf,
  isoFitsVehicle,
  coversVehicle,
  parseVehicleKey,
  vehicleKey,
} from "@/services/cost/cogsVehicle";

const R40 = "42RT";
const tiers2T = seedTiers(1, 1, [R40]);
const reefer15 = { container: R40, pct: 15 };

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
    // 60 km in tier 51–100 (400,000 + 2,900/km), counted from 50 km (the end of tier 0–50):
    // 400,000 + 2,900 × 10 = 429,000 → 430,000.
    const s = tripSalaryOf(tiers2T, 60, undefined, undefined, { rule: DEFAULT_RULE })!;
    expect(s.raw).toBe(429_000);
    expect(s.base).toBe(430_000);
    const noRound = tripSalaryOf(tiers2T, 60, undefined, undefined, {
      rule: { ...DEFAULT_RULE, roundStep: 0 },
    })!;
    expect(noRound.base).toBe(429_000);
  });

  it("adds the Other terrain surcharge to the road support fee", () => {
    const plain = tripSalaryOf(tiers2T, 60)!;
    const high = tripSalaryOf(tiers2T, 60, undefined, undefined, { terrain: "Other" })!;
    expect(high.roadSupportFee - plain.roadSupportFee).toBe(DEFAULT_RULE.regionAmount);
    const off = tripSalaryOf(tiers2T, 60, undefined, undefined, {
      terrain: "Other",
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

  it("container column (CNTR lạnh): its own rate per tier, entered (QTL sheet values seeded)", () => {
    const rf = (from: number) => tiers2T.find((t) => t.from === from)!.containerRates?.[R40];
    expect([rf(51), rf(101), rf(451), rf(751), rf(851), rf(951)]).toEqual([
      3_335, 2_990, 1_495, 1_265, 2_300, 2_400,
    ]);
    // Trip salary and road support fee stay; only the per-km rate changes.
    const dry = tripSalaryOf(tiers2T, 60)!;
    const reefer = tripSalaryOf(tiers2T, 60, undefined, undefined, {
      container: { container: R40, pct: 0 },
    })!;
    expect(reefer.raw).toBe(400_000 + 3_335 * 10);
    expect(reefer.roadSupportFee).toBe(dry.roadSupportFee);
    // Empty: the extra rate.
    expect(containerRateOf({ extraRate: 2_000 }, R40)).toBe(2_000);
    expect(containerRateOf({ extraRate: 2_000, containerRates: { [R40]: 2_500 } }, "20 ft")).toBe(
      2_000,
    );
  });

  it("Auto Trip Salary: F10 = F9 + G9 × (D9 − D8) (QTL sheet)", () => {
    // Every tier from the 2nd on Auto, its Trip Salary emptied: worked out top to bottom.
    const auto = autoTripSalaries(
      tiers2T.map((t, i) => (i === 0 ? t : { ...t, tripSalary: NaN, auto: true })),
    );
    expect(auto.slice(0, 7).map((t) => t.tripSalary)).toEqual([
      400_000, 400_000, 545_000, 675_000, 915_000, 1_115_000, 1_295_000,
    ]);
    // A tier switched off keeps the amount typed; the Auto ones under it follow it.
    const mixed = autoTripSalaries(
      tiers2T.map((t, i) =>
        i === 2 ? { ...t, tripSalary: 600_000 } : i === 3 ? { ...t, auto: true } : t,
      ),
    );
    expect(mixed[2]!.tripSalary).toBe(600_000);
    expect(mixed[3]!.tripSalary).toBe(600_000 + 2_600 * 50);
  });

  it("try 260 km (QTL sheet): dry 940.000, reefer 1.080.000, road 150.000, Other terrain 350.000", () => {
    const dry = tripSalaryOf(tiers2T, 260, undefined, undefined, { rule: DEFAULT_RULE })!;
    const reefer = tripSalaryOf(tiers2T, 260, undefined, undefined, {
      rule: DEFAULT_RULE,
      container: reefer15,
    })!;
    const high = tripSalaryOf(tiers2T, 260, undefined, undefined, { terrain: "Other" })!;
    expect([dry.tier, dry.tierSalary, dry.base]).toEqual([5, 915_000, 940_000]);
    expect(reefer.base).toBe(1_080_000);
    expect([dry.roadSupportFee, high.roadSupportFee]).toEqual([150_000, 350_000]);
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

  it("a Header Salary Range covers every header; its column is picked by the container", () => {
    expect(vehicleKey({ kind: "HEADER", spec: "" })).toBe("HEADER");
    expect(coversVehicle("HEADER", "HEADER · 40 ft · Reefer · HINO")).toBe(true);
    expect(coversVehicle("HEADER", "TRUCK · 5 tấn")).toBe(false);
    expect(containerOf("HEADER · 40 ft · Reefer · HINO")).toBe("40 ft · Reefer");
    expect(isoFitsVehicle("42RT", "HEADER · 40 ft · Reefer · HINO")).toBe(true);
    expect(isoFitsVehicle("45RT", "HEADER · 40 ft · Reefer")).toBe(true);
    expect(isoFitsVehicle("42GP", "HEADER · 40 ft · Reefer")).toBe(false);
    expect(isoFitsVehicle("22GP", "HEADER · 20 ft")).toBe(true);
    expect(isoFitsVehicle("42UT", "HEADER · 40 ft")).toBe(false);
    expect(containerOf("HEADER · 20 ft")).toBe("20 ft");
    expect(containerOf("TRUCK · 5 tấn")).toBe("");
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

  it("header vehicle types are the Container Types (Common Code), matched to the Salary Range columns", () => {
    expect(vehicleKey({ kind: "HEADER", spec: "42RT", brand: "HINO" })).toBe(
      "HEADER · 42RT · HINO",
    );
    expect(parseVehicleKey("HEADER · 42RT · HINO")).toEqual({
      kind: "HEADER",
      spec: "42RT",
      reefer: true,
      brand: "HINO",
    });
    expect(parseVehicleKey("HEADER · 42GP")?.reefer).toBe(false);
    expect(containerOf("HEADER · 42RT · HINO")).toBe("42RT");
    expect(isoFitsVehicle("42RT", "HEADER · 42RT · HINO")).toBe(true);
    expect(isoFitsVehicle("45RT", "HEADER · 42RT")).toBe(false);
    expect(coversVehicle("HEADER", "HEADER · 22UT")).toBe(true);
    const heads = cogsVehicleTypes(seedVehicleMasters()).filter(
      (t) => t.kind === "HEADER" && !t.brand,
    );
    expect(heads.map((t) => t.key)).toEqual(
      expect.arrayContaining(["HEADER · 22GP", "HEADER · 42RT"]),
    );
    expect(heads.find((t) => t.spec === "42RT")).toMatchObject({ size: "40 ft", reefer: true });
  });
});
