// Fuel Cost › Price History: every version at a glance — one row per version (newest first) with when and
// by whom it was saved, its price and the change from the version before. A row opens that version.
import { CurrencyTag } from "@/components/movex/general/Amount";
import { thClass } from "@/components/movex/common";
import { atVersion, versionOf } from "@/services/cost/versions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FuelCostRecord } from "@/types";

export function FuelPriceHistory({
  record,
  shownVersion,
  onPick,
  money,
  cur,
  unit,
}: {
  /** The Fuel Cost as it is now (with its history). */
  record: FuelCostRecord;
  /** The version on screen: its row is marked. */
  shownVersion: number;
  onPick: (version: number) => void;
  money: (n: number) => string;
  cur: string;
  unit: string;
}) {
  const current = versionOf(record);
  // Every version, newest first: the current one, then the saved ones.
  const versions = [
    { version: current, savedAt: record.updatedAt || record.createdAt, savedBy: record.updatedBy },
    ...(record.history ?? [])
      .map((h) => ({ version: h.version, savedAt: h.savedAt, savedBy: h.savedBy }))
      .sort((a, b) => b.version - a.version),
  ].map((v) => {
    const r = v.version === current ? record : atVersion(record, v.version);
    return { ...v, price: r.fuelPrice };
  });
  const pct = (from: number, to: number) => Math.round(((to - from) / from) * 1000) / 10;
  const cell = "px-3 py-2";
  const head = (h: string, right = true) => (
    <th
      key={h}
      className={cn(thClass, cell, "whitespace-nowrap leading-tight", right && "text-right")}
    >
      {h}
    </th>
  );

  return (
    <div className="w-fit max-w-full overflow-auto rounded-lg border">
      <table className="text-sm tabular-nums">
        <thead>
          <tr className="bg-muted text-left">
            {head("Version", false)}
            {head("Created At", false)}
            {head("Created By", false)}
            {head(`Price / ${unit}`)}
            {head("Ratio (%)")}
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => {
            const before = versions[i + 1];
            const change = before && before.price > 0 ? pct(before.price, v.price) : undefined;
            const shown = v.version === shownVersion;
            return (
              <tr
                key={v.version}
                onClick={() => onPick(v.version)}
                title={shown ? "On screen" : `Open v${v.version}`}
                className={cn(
                  "cursor-pointer border-t transition-colors hover:bg-muted/60",
                  shown && "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <td className={cn(cell, "whitespace-nowrap font-semibold")}>
                  v{v.version}
                  {v.version === current && (
                    <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      current
                    </span>
                  )}
                </td>
                <td className={cn(cell, "whitespace-nowrap text-muted-foreground")}>
                  {formatDate(v.savedAt)}
                </td>
                <td className={cn(cell, "whitespace-nowrap text-muted-foreground")}>
                  {v.savedBy || "—"}
                </td>
                <td className={cn(cell, "whitespace-nowrap text-right font-medium")}>
                  {money(v.price)}
                  <CurrencyTag cur={cur} />
                </td>
                <td
                  className={cn(
                    cell,
                    "whitespace-nowrap text-right font-semibold",
                    change === undefined || change === 0
                      ? "text-muted-foreground"
                      : change > 0
                        ? "text-destructive"
                        : "text-success",
                  )}
                >
                  {change === undefined ? "—" : `${change > 0 ? "+" : ""}${change}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
