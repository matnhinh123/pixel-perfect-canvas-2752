import { describe, expect, it } from "vitest";
import {
  seedSalaryRanges,
  tripSalaryOf,
  validateTiers,
  type SalaryTier,
} from "@/services/cost/salaryRange";

const tiers2T = seedSalaryRanges().current.tables["Xe tải 2T"]!;

describe("Driver salary range (Variable Cost)", () => {
  it("seed tiers of Xe tải 2T are continuous 0 – 1,750 km", () => {
    expect(validateTiers(tiers2T)).toEqual({
      ok: true,
      message: "19 continuous tiers 0 – 1,750 km.",
    });
  });

  it("trip salary = tier salary + (km − tier start) × extra rate", () => {
    expect(tripSalaryOf(tiers2T, 30)).toMatchObject({ tier: 1, salary: 400_000, total: 450_000 });
    // Tier 2 (51–100 km): 400,000 + (100 − 51) × 2,900 = 542,100 ≈ Tier 3 start 545,000.
    expect(tripSalaryOf(tiers2T, 100)).toMatchObject({ tier: 2, salary: 542_100 });
    expect(tripSalaryOf(tiers2T, 101)?.salary).toBe(545_000);
  });

  it("rejects gaps, overlaps and a first tier that does not start at 0", () => {
    const t = (from: number, to: number): SalaryTier => ({
      from,
      to,
      tripSalary: 1,
      extraRate: 0,
      tollAllowance: 0,
    });
    expect(validateTiers([t(5, 10)]).ok).toBe(false);
    expect(validateTiers([t(0, 50), t(60, 100)]).message).toBe(
      "Tier 2 must start at 51 km (right after Tier 1).",
    );
    expect(validateTiers([t(0, 50), t(51, 40)]).ok).toBe(false);
  });
});
