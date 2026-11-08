/**
 * Exchange rate of a currency to VND (the tenant currency). Fetched automatically (an exchange rate API,
 * to come; a sample until then); never typed in MoveX.
 */
export interface ExchangeRateRecord {
  id: string;
  /** "USD", "EUR"… */
  currency: string;
  /** VND per 1 unit of the currency. */
  rate: number;
  /** Day the rate is for (YYYY-MM-DD). */
  rateDate: string;
  /** Where it came from. */
  source: string;
  /** When it was fetched (ISO). */
  fetchedAt: string;
}
