// Exchange rates to VND (the tenant currency), as fetched (Master Data › Exchange Rate). Every amount
// converted in MoveX takes its rate from here: the latest rate of the currency; never typed by a user.
import { exchangeRateRepository } from "@/repositories";
import type { ExchangeRateRecord } from "@/types";

/** The tenant currency: amounts are kept in it. */
export const TENANT_CURRENCY = "VND";

/** The latest exchange rate of a currency (by its date); undefined for VND or a currency without one. */
export function latestExchangeRate(currency: string): ExchangeRateRecord | undefined {
  if (currency === TENANT_CURRENCY) return undefined;
  return exchangeRateRepository
    .all()
    .filter((r) => r.currency === currency && r.rate > 0)
    .sort(
      (a, b) => b.rateDate.localeCompare(a.rateDate) || b.fetchedAt.localeCompare(a.fetchedAt),
    )[0];
}

/** VND per 1 unit of a currency: 1 for VND; undefined when there is no exchange rate for it. */
export const vndRateOf = (currency: string): number | undefined =>
  currency === TENANT_CURRENCY ? 1 : latestExchangeRate(currency)?.rate;
