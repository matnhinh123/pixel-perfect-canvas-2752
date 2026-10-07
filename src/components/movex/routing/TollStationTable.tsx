import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Tag } from "@/components/movex/common";
import type { TollStation } from "@/types";
import { cn } from "@/lib/utils";

export interface TollRow {
  key: string;
  leg: "Outbound" | "Return";
  station: TollStation;
}

/** Tolls of the selected route (+ return leg). The fee per pass can be edited. */
export function TollStationTable({
  rows,
  showLeg,
  calculated,
  onPriceChange,
}: {
  rows: TollRow[];
  showLeg?: boolean;
  calculated: boolean;
  onPriceChange: (row: TollRow, price: number) => void;
}) {
  if (rows.length === 0)
    return (
      <EmptyState
        title="No tolls"
        description={
          calculated
            ? "The selected route does not pass any toll."
            : 'Click "Recalculate Route" to load tolls.'
        }
      />
    );

  const headers = ["#", "Toll Code", "Toll Name", "Location", "Fee (₫)"];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {headers.map((h) => (
            <TableHead
              key={h}
              className={cn(
                "h-9 text-sm font-semibold text-foreground",
                h === "Fee (₫)" && "text-right",
              )}
            >
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const t = r.station;
          return (
            <TableRow key={r.key}>
              <TableCell className="w-10 py-2 text-center">{i + 1}</TableCell>
              <TableCell className="py-2">
                {t.code ? (
                  <Link
                    to="/toll-station"
                    search={{ q: t.code }}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.code}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="py-2">
                {t.name}
                {showLeg && (
                  <span className="ml-2 align-middle">
                    <Tag tone={r.leg}>{r.leg === "Outbound" ? "Outbound" : "Return Trip"}</Tag>
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2 text-muted-foreground">{t.address || "—"}</TableCell>
              <TableCell className="w-36 py-1.5">
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  aria-label={`Fee of ${t.name}`}
                  value={Number.isFinite(t.price) ? t.price : ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) onPriceChange(r, v);
                  }}
                  className="h-8 text-right font-medium"
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
