import { describe, expect, it } from "vitest";
import { exchangeRateRepository } from "@/repositories";
import { latestExchangeRate, vndRateOf } from "@/services/exchangeRateService";
import { rateOf } from "@/services/fixedCostService";

describe("Exchange rates are taken automatically, never typed", () => {
  it("loads the sample when there is none, and every conversion takes the latest rate", () => {
    expect(exchangeRateRepository.all().length).toBeGreaterThan(0);
    expect(vndRateOf("VND")).toBe(1);
    expect(vndRateOf("USD")).toBe(25_400);
    expect(rateOf("USD")).toBe(25_400);
    exchangeRateRepository.insert({
      id: "FX-USD-20261030",
      currency: "USD",
      rate: 25_450,
      rateDate: "2026-10-30",
      source: "test",
      fetchedAt: "2026-10-30T01:00:00.000Z",
    });
    expect(latestExchangeRate("USD")?.rate).toBe(25_450);
    expect(rateOf("USD")).toBe(25_450);
  });
});
