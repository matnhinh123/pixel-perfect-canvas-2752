import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  NativeSelect,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
  Tag,
  thClass,
} from "@/components/movex/common";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import { cogsOf, type Cogs } from "@/services/cost/cogsMath";
import {
  FIXED_PER_TRIP,
  FUEL_NORMS,
  FUEL_PRICE,
  SALARY_BANDS,
  TERRAIN_FACTORS,
  TRIP_SALARY,
} from "@/mock-data/cogsRates";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VEHICLE_GROUPS } from "@/types";

type Mode = "variable" | "cogs";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";

/**
 * Variable Cost / COGS sheet: one row per Route × Vehicle Group, computed from the route (distance,
 * tolls, ferries, manual costs) and the rate basis below. Rows open to show how the figure is built.
 */
export function RouteCostSheet({ mode }: { mode: Mode }) {
  const routesAll = useCollection(routeRepository);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () =>
      routesAll
        .filter((r) => !r.deleted)
        .map(cogsOf)
        .sort((a, b) => a.route.code.localeCompare(b.route.code)),
    [routesAll],
  );
  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    return (
      (!s || `${r.route.code} ${r.route.name}`.toLowerCase().includes(s)) &&
      (!group || r.group === group) &&
      (!type || r.route.type === type)
    );
  });
  const priced = shown.filter((r) => r.calculated);
  const value = (r: Cogs) => (mode === "cogs" ? r.cogs : r.variable);
  const avgTrip = priced.length ? priced.reduce((s, r) => s + value(r), 0) / priced.length : 0;
  const km = priced.reduce((s, r) => s + r.distanceKm, 0);
  const avgKm = km ? priced.reduce((s, r) => s + value(r), 0) / km : 0;

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const title = mode === "cogs" ? "COGS" : "Variable Cost";
  const heads =
    mode === "cogs"
      ? ["Distance (km)", "Fixed / Trip", "Trip Salary", "Variable Cost", "COGS"]
      : ["Distance (km)", "Fuel (l)", "Fuel Cost", "Toll", "Ferry", "Other", "Variable Cost"];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: title }]}
        title={title}
        subtitle={
          mode === "cogs"
            ? "Operating cost of a trip per Route × Vehicle Group: Fixed / Trip + Trip Salary + Variable Cost"
            : "Cost that grows with the trip per Route × Vehicle Group: Fuel + Toll + Ferry + Other (no fixed cost)"
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Routes"
          value={formatNumber(shown.length)}
          hint={`${priced.length} calculated`}
        />
        <StatCard label={`Average ${title} / trip`} value={`${money(avgTrip)} ₫`} />
        <StatCard label={`Average ${title} / km`} value={`${money(avgKm)} ₫`} />
      </div>

      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="relative w-full min-w-56 max-w-sm flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search route code, name..."
              className="pl-9 pr-8"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2.5 top-2.5 text-muted-foreground"
                onClick={() => setQ("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <NativeSelect
            value={group}
            onChange={setGroup}
            options={["", ...VEHICLE_GROUPS]}
            labels={{ "": "Vehicle Group: All" }}
          />
          <NativeSelect
            value={type}
            onChange={setType}
            options={["", "Single Trip", "Round Trip"]}
            labels={{ "": "Route Type: All" }}
          />
        </div>

        {shown.length === 0 ? (
          <EmptyState title="No matching routes" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(thClass, "w-8")} />
                <TableHead className={thClass}>Route Code</TableHead>
                <TableHead className={thClass}>Route Name</TableHead>
                <TableHead className={thClass}>Route Type</TableHead>
                <TableHead className={thClass}>Vehicle Group</TableHead>
                {heads.map((h) => (
                  <TableHead key={h} className={cn(thClass, "text-right")}>
                    {h}
                  </TableHead>
                ))}
                <TableHead className={thClass}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const isOpen = open.has(r.route.id);
                const cells =
                  mode === "cogs"
                    ? [r.distanceKm, r.fixed, r.salary, r.variable, r.cogs]
                    : [r.distanceKm, r.fuelLitres, r.fuel, r.toll, r.ferry, r.other, r.variable];
                return (
                  <Fragment key={r.route.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(r.route.id)}>
                      <TableCell className="py-2.5 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Link
                          to="/routing/$id"
                          params={{ id: r.route.id }}
                          search={{ mode: "view" }}
                          className="font-semibold text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.route.code}
                        </Link>
                      </TableCell>
                      <TableCell className="py-2.5">{r.route.name}</TableCell>
                      <TableCell className="py-2.5">
                        <Tag>{r.route.type}</Tag>
                      </TableCell>
                      <TableCell className="py-2.5">{r.group}</TableCell>
                      {r.calculated ? (
                        cells.map((c, i) => (
                          <TableCell
                            key={i}
                            className={cn(
                              "py-2.5",
                              num,
                              i === cells.length - 1 && "font-semibold text-foreground",
                            )}
                          >
                            {i === 0 || (mode === "variable" && i === 1)
                              ? formatNumber(c)
                              : money(c)}
                          </TableCell>
                        ))
                      ) : (
                        <TableCell
                          colSpan={cells.length}
                          className="py-2.5 text-center text-muted-foreground"
                        >
                          Not calculated — calculate the route first
                        </TableCell>
                      )}
                      <TableCell className="py-2.5">
                        <StatusBadge status={r.route.status} />
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={5 + heads.length} className="py-3">
                          <Breakdown r={r} mode={mode} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <RateBasis mode={mode} />
    </div>
  );
}

function Line({
  label,
  formula,
  amount,
  strong,
}: {
  label: string;
  formula?: ReactNode;
  amount: number;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline gap-3 py-0.5 text-sm", strong && "font-semibold")}>
      <span className="w-40 shrink-0">{label}</span>
      <span className="flex-1 text-xs text-muted-foreground">{formula}</span>
      <span className={cn("w-36 shrink-0", num)}>{money(amount)} ₫</span>
    </div>
  );
}

function Breakdown({ r, mode }: { r: Cogs; mode: Mode }) {
  if (!r.calculated)
    return (
      <p className="text-sm text-muted-foreground">
        The route has no distance or tolls yet. Open the route and click Calculate Route.
      </p>
    );
  const terrain = r.route.terrain ?? "Plain";
  return (
    <div className="max-w-3xl">
      {mode === "cogs" && (
        <>
          <Line
            label="Fixed / Trip"
            formula={`Allocated per trip for ${r.group}`}
            amount={r.fixed}
          />
          <Line
            label="Trip Salary"
            formula={`${r.group}, ${r.distanceKm} km → band ${r.salaryBand}`}
            amount={r.salary}
          />
        </>
      )}
      <Line
        label="Fuel"
        formula={`${FUEL_NORMS[r.group]} l/100km × ${r.terrainFactor} (${terrain}) = ${r.fuelNorm} l/100km × ${r.distanceKm} km ÷ 100 = ${r.fuelLitres} l × ${formatNumber(r.fuelPrice)} ₫/l`}
        amount={r.fuel}
      />
      <Line label="Toll" formula="Toll / bridge stations on the route" amount={r.toll} />
      <Line label="Ferry" formula="Ferry stations + manual ferry costs" amount={r.ferry} />
      <Line label="Other" formula="Other manual route costs" amount={r.other} />
      <div className="mt-1 border-t pt-1">
        <Line
          label="Variable Cost"
          formula="Fuel + Toll + Ferry + Other"
          amount={r.variable}
          strong
        />
        {mode === "cogs" && (
          <Line
            label="COGS"
            formula="Fixed / Trip + Trip Salary + Variable Cost"
            amount={r.cogs}
            strong
          />
        )}
      </div>
    </div>
  );
}

function RateBasis({ mode }: { mode: Mode }) {
  return (
    <Panel title="Rate Basis" className="mt-4" bodyClassName="p-0">
      <p className="border-b px-4 py-2.5 text-xs text-muted-foreground">
        Fuel price {formatNumber(FUEL_PRICE)} ₫/l · Terrain factor: Plain ×{TERRAIN_FACTORS.Plain},
        Highland ×{TERRAIN_FACTORS.Highland}
      </p>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={thClass}>Vehicle Group</TableHead>
            <TableHead className={cn(thClass, "text-right")}>Fuel Norm (l/100km)</TableHead>
            {mode === "cogs" && (
              <>
                <TableHead className={cn(thClass, "text-right")}>Fixed / Trip</TableHead>
                {SALARY_BANDS.map((b) => (
                  <TableHead key={b.label} className={cn(thClass, "text-right")}>
                    Salary {b.label}
                  </TableHead>
                ))}
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {VEHICLE_GROUPS.map((g) => (
            <TableRow key={g}>
              <TableCell className="py-2 font-medium">{g}</TableCell>
              <TableCell className={cn("py-2", num)}>{FUEL_NORMS[g]}</TableCell>
              {mode === "cogs" && (
                <>
                  <TableCell className={cn("py-2", num)}>{money(FIXED_PER_TRIP[g])}</TableCell>
                  {TRIP_SALARY[g].map((s, i) => (
                    <TableCell key={i} className={cn("py-2", num)}>
                      {money(s)}
                    </TableCell>
                  ))}
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
