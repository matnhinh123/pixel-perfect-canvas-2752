import { Link } from "@tanstack/react-router";
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

/** Tolls of the selected route (+ return leg) in route order; only the first `limit` are shown here. */
export function TollStationTable({
  rows,
  showLeg,
  calculated,
  limit,
}: {
  rows: TollRow[];
  showLeg?: boolean;
  calculated: boolean;
  /** Show only the first N rows (the rest are in View Details). */
  limit?: number;
}) {
  if (rows.length === 0)
    return (
      <EmptyState
        title="No tolls"
        description={
          calculated
            ? "The selected route does not pass any toll."
            : 'Click "Calculate Route" to load tolls.'
        }
      />
    );

  const headers = ["#", "Toll Code", "Toll Name", "Location"];
  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {headers.map((h) => (
            <TableHead key={h} className={cn("h-8 text-xs font-semibold text-foreground")}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(limit ? rows.slice(0, limit) : rows).map((r, i) => {
          const t = r.station;
          return (
            <TableRow key={r.key}>
              <TableCell className="w-10 py-1.5 text-center">{i + 1}</TableCell>
              <TableCell className="py-1.5">
                {t.code && t.reconciled !== false ? (
                  <Link
                    to="/toll-station"
                    search={{ q: t.code }}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.code}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t.code || "—"}</span>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {t.name}
                {showLeg && (
                  <span className="ml-2 align-middle">
                    <Tag tone={r.leg}>{r.leg === "Outbound" ? "Outbound" : "Return Trip"}</Tag>
                  </span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-muted-foreground">{t.address || "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
