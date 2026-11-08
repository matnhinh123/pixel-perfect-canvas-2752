// Currency the amounts are shown in (the switch next to History on a detail page): VND, the tenant currency
// the amounts are kept in, or USD, converted at the latest USD rate of Master Data › Exchange Rate.
// USD is view only: a form that edits amounts needs VND. Remembered per browser; VND by default.
import { useSyncExternalStore } from "react";
import { useCollection } from "@/hooks/use-store";
import { exchangeRateRepository } from "@/repositories";
import { latestExchangeRate, TENANT_CURRENCY } from "@/services/exchangeRateService";
import { formatNumber } from "@/lib/format";

export type DisplayCurrency = "VND" | "USD";
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["VND", "USD"];

const KEY = "movex.ui-currency";
const listeners = new Set<() => void>();

const read = (): DisplayCurrency => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "USD"
      ? "USD"
      : "VND";
  } catch {
    return "VND";
  }
};

let current: DisplayCurrency = read();

export const getDisplayCurrency = () => current;

export function setDisplayCurrency(c: DisplayCurrency) {
  if (c === current) return;
  current = c;
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** The currency shown and VND per unit of it, right now (outside a hook: call useDisplayCurrency too, to re-render). */
function shownNow() {
  const usdRate = latestExchangeRate("USD");
  const usd = current === "USD" && !!usdRate;
  return {
    usd,
    rate: usd && usdRate ? usdRate.rate : 1,
    cur: (usd ? "USD" : TENANT_CURRENCY) as DisplayCurrency,
  };
}
/** Currency shown right now. */
export const curNow = () => shownNow().cur;
/** An amount kept in VND, in the currency shown right now (USD: 2 decimals); "—" when none. */
export function moneyNow(vnd: number | null | undefined): string {
  if (vnd === null || vnd === undefined || !Number.isFinite(vnd)) return "—";
  const { usd, rate } = shownNow();
  return formatNumber(usd ? Math.round((vnd / rate) * 100) / 100 : Math.round(vnd));
}

/**
 * The currency amounts are shown in, with its helpers. `money(vnd)`: an amount kept in VND, in the
 * currency shown (USD: 2 decimals). USD without a rate falls back to VND.
 */
export function useDisplayCurrency() {
  const picked = useSyncExternalStore(subscribe, getDisplayCurrency, () => "VND" as const);
  useCollection(exchangeRateRepository); // re-render when a rate is fetched
  const usdRate = latestExchangeRate("USD");
  const usd = picked === "USD" && !!usdRate;
  /** VND per unit of the currency shown. */
  const rate = usd && usdRate ? usdRate.rate : 1;
  const cur: DisplayCurrency = usd ? "USD" : TENANT_CURRENCY;
  const convert = (vnd: number) => (usd ? Math.round((vnd / rate) * 100) / 100 : Math.round(vnd));
  const money = (vnd: number | null | undefined) =>
    vnd === null || vnd === undefined || !Number.isFinite(vnd) ? "—" : formatNumber(convert(vnd));
  return { picked, usd, usdRate, rate, cur, convert, money };
}
