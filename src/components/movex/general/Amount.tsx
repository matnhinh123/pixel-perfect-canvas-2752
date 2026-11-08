// An amount kept in VND, shown in the currency picked (VND / USD) with the currency after it.
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  setDisplayCurrency,
  useDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/displayCurrency";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * VND / USD switch of a detail page, next to History. One setting for the app (remembered per browser):
 * the lists of the Cost module show the currency last picked. USD: converted at the latest rate, view only.
 */
export function CurrencySelect() {
  const { cur, usdRate } = useDisplayCurrency();
  return (
    <select
      value={cur}
      onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
      aria-label="Currency"
      title={
        usdRate
          ? `USD: converted at 1 USD = ${formatNumber(usdRate.rate)} VND (${formatDate(usdRate.rateDate)}), view only`
          : "No USD rate yet (Master Data › Exchange Rate)"
      }
      className="h-11 rounded-[12px] border-2 border-input bg-card px-3 text-sm font-semibold shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] hover:border-border-strong focus:border-primary focus:outline-none"
    >
      <option value="VND">VND</option>
      <option value="USD" disabled={!usdRate}>
        USD
      </option>
    </select>
  );
}

/**
 * The Edit button of a detail page with amounts: the link inside, or, while USD is picked (view
 * only), the button greyed out saying to switch to VND.
 */
export function EditLink({ usd, children }: { usd: boolean; children: ReactNode }) {
  return usd ? (
    <span title="Amounts are shown in USD (view only). Switch the currency next to History to VND to edit.">
      <Button size="lg" disabled>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
    </span>
  ) : (
    <Button asChild size="lg">
      {children}
    </Button>
  );
}

/** The currency after an amount: small and muted, so the figure stays what the eye reads. */
export function CurrencyTag({ cur, className }: { cur: string; className?: string }) {
  return (
    <span className={cn("ml-1 text-[11px] font-normal text-muted-foreground", className)}>
      {cur}
    </span>
  );
}

export function Amount({ vnd, className }: { vnd: number | null | undefined; className?: string }) {
  const { money, cur } = useDisplayCurrency();
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {money(vnd)}
      {vnd !== null && vnd !== undefined && Number.isFinite(vnd) && <CurrencyTag cur={cur} />}
    </span>
  );
}
