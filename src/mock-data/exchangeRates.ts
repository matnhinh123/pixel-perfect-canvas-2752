// Sample of what the exchange rate API will return (rates to VND). Loaded automatically when there is no
// exchange rate yet; the real API replaces it later.
import type { ExchangeRateRecord } from "@/types";

export const EXCHANGE_RATE_SOURCE = "Exchange rate API (sample)";

const SAMPLE: [currency: string, rate: number][] = [
  ["USD", 25_400],
  ["EUR", 27_500],
  ["SGD", 19_600],
  ["JPY", 168],
  ["CNY", 3_520],
];

export const seedExchangeRates = (): ExchangeRateRecord[] =>
  SAMPLE.map(([currency, rate]) => ({
    id: `FX-${currency}-20261029`,
    currency,
    rate,
    rateDate: "2026-10-29",
    source: EXCHANGE_RATE_SOURCE,
    fetchedAt: "2026-10-29T01:00:00.000Z",
  }));
