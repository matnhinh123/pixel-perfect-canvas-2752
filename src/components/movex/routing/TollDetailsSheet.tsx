import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Tag, thClass } from "@/components/movex/common";
import { FEE_TYPE_LABEL } from "./RouteSections";
import type { TollRow } from "./TollStationTable";

const HEADERS = ["#", "Toll Code", "Toll Name", "Fee Type", "Vehicle Group", "Location"];

/** Read-only detail of the route's tolls, grouped by leg (no amounts — cost is not computed here). */
export function TollDetailsSheet({
  open,
  onOpenChange,
  rows,
  roundTrip,
  routeLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: TollRow[];
  roundTrip: boolean;
  routeLabel: string;
}) {
  const [q, setQ] = useState("");
  const legs: TollRow["leg"][] = roundTrip ? ["Outbound", "Return"] : ["Outbound"];
  // A route can pass many tolls: filter by code, name or location.
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) =>
        [r.station.code, r.station.name, r.station.address].some((x) =>
          (x ?? "").toLowerCase().includes(needle),
        ),
      )
    : rows;
  let no = 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[820px] overflow-y-auto sm:max-w-[820px]">
        <SheetHeader>
          <SheetTitle>Toll Details</SheetTitle>
          <SheetDescription>
            {routeLabel} · {rows.length} toll{rows.length === 1 ? "" : "s"}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {rows.length === 0 ? (
            <EmptyState
              title="No tolls"
              description='Click "Recalculate Route" or "Add Toll" to list tolls.'
            />
          ) : (
            <>
              <div className="relative mb-3 w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search toll code, name, location..."
                  className="pl-9"
                />
              </div>
              <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                    <TableRow className="hover:bg-transparent">
                      {HEADERS.map((h) => (
                        <TableHead key={h} className={thClass}>
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legs.map((leg) => {
                      const items = shown.filter((r) => r.leg === leg);
                      return [
                        roundTrip && (
                          <TableRow key={`h-${leg}`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell
                              colSpan={HEADERS.length}
                              className="py-1.5 text-xs font-semibold"
                            >
                              <Tag tone={leg}>
                                {leg === "Outbound" ? "Outbound" : "Return Trip"}
                              </Tag>
                              <span className="ml-2 text-muted-foreground">
                                {items.length} toll{items.length === 1 ? "" : "s"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ),
                        ...items.map((r) => (
                          <TableRow key={r.key}>
                            <TableCell className="w-10 text-center">{++no}</TableCell>
                            <TableCell className="font-medium text-primary">
                              {r.station.code ?? "—"}
                            </TableCell>
                            <TableCell>{r.station.name}</TableCell>
                            <TableCell>{FEE_TYPE_LABEL[r.station.feeType]}</TableCell>
                            <TableCell>{r.station.vehicleTollGroup}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.station.address || "—"}
                            </TableCell>
                          </TableRow>
                        )),
                      ];
                    })}
                  </TableBody>
                </Table>
                {shown.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No toll matches “{q}”.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
