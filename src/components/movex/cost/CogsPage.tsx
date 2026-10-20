// COGS (cost of goods sold) of one trip: pick a route and a vehicle type, then the costs already set
// up (Fixed Cost, Variable Cost, other Cost Details) that make up the trip's cost.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Field,
  NativeSelect,
  PageHeader,
  Panel,
  thClass,
} from "@/components/movex/common";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository, fixedCostRepository, routeRepository } from "@/repositories";
import { calcFixedCost } from "@/services/fixedCostService";
import { ALL_VEHICLE_TYPES, routeVariableCost, useSalaryRanges } from "@/services/cost/salaryRange";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";

/** Fixed Cost vehicle type code of a vehicle type ("Xe tải 2T" → "2T", "Đầu kéo 40ft" → "40DC"). */
const fixedCostCodes = (type: string): string[] => {
  const t = /(\d+)T$/.exec(type);
  if (t) return [`${t[1]}T`, "TRUCK"];
  if (type.endsWith("20ft")) return ["20DC", "HEAD"];
  if (type.endsWith("40ft")) return ["40DC", "HEAD"];
  return [];
};

interface Line {
  key: string;
  group: "Fixed Cost" | "Variable Cost" | "Other Cost";
  code: string;
  name: string;
  basis: string;
  amount: number;
}
interface OtherRow {
  rid: string;
  costId: string;
  amount: string;
}

let seq = 0;

export function CogsPage() {
  const routesAll = useCollection(routeRepository);
  const fixedAll = useCollection(fixedCostRepository);
  const costsAll = useCollection(costItemRepository);
  const salary = useSalaryRanges();
  const routes = useMemo(
    () => routesAll.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [routesAll],
  );
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const [routeId, setRouteId] = useState(routes.find((r) => r.outbound)?.id ?? "");
  const [type, setType] = useState("Xe tải 2T");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [others, setOthers] = useState<OtherRow[]>([]);

  const route = routes.find((r) => r.id === routeId);
  const v = route ? routeVariableCost(route, type, salary.current.tables[type] ?? []) : null;

  const fixedLines: Line[] = useMemo(() => {
    const codes = fixedCostCodes(type);
    return fixedAll
      .filter(
        (f) => !f.deleted && f.status === "Active" && f.vehicleTypes.some((t) => codes.includes(t)),
      )
      .map((f) => ({
        key: `F:${f.id}`,
        group: "Fixed Cost" as const,
        code: f.code,
        name: f.name,
        basis: `${formatNumber(f.costValue)} ${f.currency} per ${f.allocationBase} ${f.allocationUnit} → per trip`,
        amount: calcFixedCost(f).trip ?? 0,
      }));
  }, [fixedAll, type]);

  const variableLines: Line[] = v
    ? [
        {
          key: "V:salary",
          group: "Variable Cost",
          code: "TDS",
          name: "Trip Salary",
          basis: v.salary
            ? `Tier ${v.salary.tier} (${v.salary.tierRange}) + ${v.salary.extraKm} km × ${formatNumber(v.salary.extraRate)}`
            : "—",
          amount: v.salary?.salary ?? 0,
        },
        {
          key: "V:allowance",
          group: "Variable Cost",
          code: "IRA",
          name: "Toll Allowance",
          basis: v.salary ? `Tier ${v.salary.tier}` : "—",
          amount: v.salary?.tollAllowance ?? 0,
        },
        {
          key: "V:toll",
          group: "Variable Cost",
          code: "TOL",
          name: "Toll Cost",
          basis: "Tolls, ferries and manual costs of the route",
          amount: v.routeCost,
        },
        {
          key: "V:fuel",
          group: "Variable Cost",
          code: "FUE",
          name: "Fuel Cost",
          basis: `${v.fuelNorm} l/100km × ${v.distanceKm} km = ${v.fuelLitres} l × ${formatNumber(v.fuelPrice)} ₫`,
          amount: v.fuel,
        },
      ]
    : [];

  const otherLines: Line[] = others
    .map((o): Line | null => {
      const c = costs.find((x) => x.id === o.costId);
      return c
        ? {
            key: `O:${o.rid}`,
            group: "Other Cost" as const,
            code: c.code,
            name: c.name,
            basis: c.group || "—",
            amount: Number(o.amount) || 0,
          }
        : null;
    })
    .filter((l): l is Line => !!l);

  const picked = [...fixedLines, ...variableLines].filter((l) => !off.has(l.key));
  const lines = [...picked, ...otherLines];
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const sum = (g: Line["group"]) =>
    lines.filter((l) => l.group === g).reduce((s, l) => s + l.amount, 0);
  const toggle = (key: string, on: boolean) =>
    setOff((s) => {
      const n = new Set(s);
      if (on) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[{ label: "COGS" }]}
        title="COGS"
        subtitle="Cost of goods sold of one trip: pick a route, a vehicle type and the costs to include"
      />

      <Panel title="Route & Vehicle">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <Field label="Route" required className="sm:col-span-5">
            <SearchableSelect
              value={routeId}
              onChange={setRouteId}
              options={["", ...routes.map((r) => r.id)]}
              labels={{
                "": "Select Route",
                ...Object.fromEntries(routes.map((r) => [r.id, `${r.code} - ${r.name}`])),
              }}
              searchPlaceholder="Search route…"
              emptyText="No matching route"
            />
          </Field>
          <Field label="Vehicle Type" required className="sm:col-span-3">
            <NativeSelect
              value={type}
              onChange={setType}
              options={ALL_VEHICLE_TYPES}
              className="w-full"
            />
          </Field>
          {route && (
            <div className="flex flex-wrap items-end gap-x-6 gap-y-1 text-sm sm:col-span-4">
              <span>
                <span className="text-muted-foreground">Type </span>
                {route.type}
              </span>
              <span>
                <span className="text-muted-foreground">Terrain </span>
                {route.terrain ?? "Plain"}
              </span>
              <span>
                <span className="text-muted-foreground">Distance </span>
                {v?.calculated ? `${formatNumber(v.distanceKm)} km` : "—"}
              </span>
              <Link
                to="/routing/$id"
                params={{ id: route.id }}
                search={{ mode: "view" }}
                className="text-primary hover:underline"
              >
                Open route
              </Link>
            </div>
          )}
        </div>
        {route && !v?.calculated && (
          <p className="mt-3 text-sm text-warning">
            This route has not been calculated yet: open it and click Calculate Route to get its
            distance, tolls and fuel.
          </p>
        )}
      </Panel>

      {!route ? (
        <Panel>
          <EmptyState title="Select a route to build its COGS" />
        </Panel>
      ) : (
        <>
          <Panel title="Costs" bodyClassName="p-0">
            <CostChecklist
              title="Fixed Cost"
              hint={`Fixed Costs that apply to ${type}, allocated per trip`}
              lines={fixedLines}
              off={off}
              onToggle={toggle}
              empty="No active Fixed Cost applies to this vehicle type."
            />
            <CostChecklist
              title="Variable Cost"
              hint="From the Variable Cost setup and the route"
              lines={variableLines}
              off={off}
              onToggle={toggle}
              empty="—"
            />
            <div className="border-t px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Other Cost</h3>
                  <p className="text-xs text-muted-foreground">
                    Any other Cost Detail of this trip, with its amount
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOthers((o) => [...o, { rid: `o${++seq}`, costId: "", amount: "" }])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Cost
                </Button>
              </div>
              {others.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other cost.</p>
              ) : (
                <div className="space-y-2">
                  {others.map((o) => (
                    <div key={o.rid} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          value={o.costId}
                          onChange={(costId) =>
                            setOthers((rs) =>
                              rs.map((r) => (r.rid === o.rid ? { ...r, costId } : r)),
                            )
                          }
                          options={["", ...costs.map((c) => c.id)]}
                          labels={{
                            "": "Select Cost Detail",
                            ...Object.fromEntries(
                              costs.map((c) => [c.id, `${c.code} - ${c.name}`]),
                            ),
                          }}
                          searchPlaceholder="Search cost…"
                          emptyText="No matching cost"
                        />
                      </div>
                      <Input
                        inputMode="numeric"
                        placeholder="Amount (₫)"
                        value={o.amount}
                        onChange={(e) => {
                          const amount = e.target.value.replace(/[^\d]/g, "");
                          setOthers((rs) =>
                            rs.map((r) => (r.rid === o.rid ? { ...r, amount } : r)),
                          );
                        }}
                        className="w-40 text-right tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label="Remove cost"
                        className="text-destructive hover:opacity-70"
                        onClick={() => setOthers((rs) => rs.filter((r) => r.rid !== o.rid))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title={`COGS — ${route.code} · ${type}`} bodyClassName="p-0">
            {lines.length === 0 ? (
              <EmptyState title="No cost selected" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thClass}>Group</TableHead>
                    <TableHead className={thClass}>Cost Code</TableHead>
                    <TableHead className={thClass}>Cost Name</TableHead>
                    <TableHead className={cn(thClass, "text-right")}>Amount / Trip (₫)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="py-2 text-muted-foreground">{l.group}</TableCell>
                      <TableCell className="py-2 font-semibold text-primary">{l.code}</TableCell>
                      <TableCell className="py-2">{l.name}</TableCell>
                      <TableCell className={cn("py-2", num)}>{money(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {(["Fixed Cost", "Variable Cost", "Other Cost"] as const).map((g) => (
                    <TableRow key={g} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={3} className="py-1.5 text-sm text-muted-foreground">
                        Subtotal {g}
                      </TableCell>
                      <TableCell className={cn("py-1.5", num)}>{money(sum(g))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-accent hover:bg-accent">
                    <TableCell colSpan={3} className="py-2.5 font-semibold">
                      Total COGS / Trip
                    </TableCell>
                    <TableCell className={cn("py-2.5 text-base font-bold", num)}>
                      {money(total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function CostChecklist({
  title,
  hint,
  lines,
  off,
  onToggle,
  empty,
}: {
  title: string;
  hint: string;
  lines: Line[];
  off: Set<string>;
  onToggle: (key: string, on: boolean) => void;
  empty: string;
}) {
  return (
    <div className="border-t px-4 py-3 first:border-t-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y rounded-md border">
          {lines.map((l) => (
            <label key={l.key} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <Checkbox
                checked={!off.has(l.key)}
                onCheckedChange={(c) => onToggle(l.key, c === true)}
              />
              <span className="w-28 shrink-0 font-semibold text-primary">{l.code}</span>
              <span className="w-44 shrink-0">{l.name}</span>
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={l.basis}
              >
                {l.basis}
              </span>
              <span className={cn("w-32 shrink-0", num)}>{money(l.amount)} ₫</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
