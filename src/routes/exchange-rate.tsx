import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { PageHeader, Panel, thClass } from "@/components/movex/common";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCollection } from "@/hooks/use-store";
import { exchangeRateRepository } from "@/repositories";
import { TENANT_CURRENCY } from "@/services/exchangeRateService";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exchange-rate")({
  head: () => ({ meta: [{ title: "Exchange Rate / UoM — MoveX" }] }),
  component: ExchangeRatePage,
});

/**
 * Exchange Rate: the rates to VND (the tenant currency) as fetched automatically — a list only, nothing
 * typed here. The API comes later; a sample stands in for it. Every conversion takes the latest rate.
 */
function ExchangeRatePage() {
  const all = useCollection(exchangeRateRepository);
  const rows = [...all].sort(
    (a, b) => b.rateDate.localeCompare(a.rateDate) || a.currency.localeCompare(b.currency),
  );
  /** The latest rate of each currency: the one conversions use. */
  const used = new Set(
    Object.values(Object.fromEntries([...rows].reverse().map((r) => [r.currency, r.id] as const))),
  );
  const cell = "py-2";
  return (
    <div>
      <PageHeader crumbs={[{ label: "Exchange Rate / UoM" }]} title="Exchange Rate" />
      <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/30 bg-info-soft px-3 py-2 text-sm text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Rates to {TENANT_CURRENCY} (the tenant currency), fetched automatically — they are not
          entered here. Amounts in another currency (Fixed Cost, Salary Range in USD) are converted
          at the latest rate of their currency. The rate API comes later; a sample is shown until
          then.
        </span>
      </div>
      <Panel
        title="Exchange Rates"
        actions={<span className="text-sm text-muted-foreground">{rows.length} rates</span>}
      >
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={thClass}>Currency</TableHead>
                <TableHead className={cn(thClass, "text-right")}>
                  Rate ({TENANT_CURRENCY})
                </TableHead>
                <TableHead className={thClass}>Rate Date</TableHead>
                <TableHead className={thClass}>Source</TableHead>
                <TableHead className={thClass}>Fetched At</TableHead>
                <TableHead className={thClass}>Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    No exchange rate fetched yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={cn(cell, "font-semibold")}>{r.currency}</TableCell>
                  <TableCell className={cn(cell, "text-right tabular-nums")}>
                    1 {r.currency} = {formatNumber(r.rate)} {TENANT_CURRENCY}
                  </TableCell>
                  <TableCell className={cell}>{formatDate(r.rateDate)}</TableCell>
                  <TableCell className={cn(cell, "text-muted-foreground")}>{r.source}</TableCell>
                  <TableCell className={cn(cell, "text-muted-foreground")}>
                    {formatDateTime(r.fetchedAt)}
                  </TableCell>
                  <TableCell className={cell}>
                    {used.has(r.id) ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        Latest · in use
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Earlier</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
