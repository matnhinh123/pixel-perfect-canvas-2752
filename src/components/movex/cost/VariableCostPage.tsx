// Variable Cost (as on the old Xink screen): Salary Range · Reference Trip Salary · Trip Salary ·
// Toll Cost · Fuel Cost · Summary.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useUnsavedChangesGuard } from "@/components/movex/general/FormPage";
import { useCollection } from "@/hooks/use-store";
import { routeRepository, tollStationRepository } from "@/repositories";
import { exportView } from "@/services/importExportService";
import { TOLL_GROUPS as TOLL_GROUP_INFO } from "@/services/tollStationService";
import { routeTotals } from "@/services/cost/costMath";
import {
  ALL_VEHICLE_TYPES,
  defOf,
  fuelCostOf,
  fuelService,
  otherCostService,
  otherKey,
  routeTollStations,
  routeVariableCost,
  salaryRangeService,
  TOLL_GROUPS,
  tollTotals,
  tollVersionService,
  tripSalaryOf,
  useFuelSetup,
  useOtherCosts,
  useSalaryRanges,
  useTollVersion,
  validateTiers,
  VEHICLE_TYPE_DEFS,
  VEHICLE_TYPES_BY_CATEGORY,
  type RouteVariableCost,
  type SalaryTier,
  type VehicleCategory,
} from "@/services/cost/salaryRange";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RouteRecord } from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const TABS = [
  ["salary", "Salary Range"],
  ["reference", "Reference Trip Salary"],
  ["trip", "Trip Salary"],
  ["toll", "Toll Cost"],
  ["fuel", "Fuel Cost"],
  ["summary", "Summary"],
] as const;

export function VariableCostPage() {
  const [tab, setTab] = useState<string>("salary");
  return (
    <div>
      <PageHeader crumbs={[{ label: "Variable Cost" }]} title="Variable Cost" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-3 rounded-none border-b bg-transparent p-0 sm:grid-cols-6">
          {TABS.map(([k, label]) => (
            <TabsTrigger
              key={k}
              value={k}
              className="rounded-none border-b-2 border-transparent py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="salary">
          <SalaryRangeTab />
        </TabsContent>
        <TabsContent value="reference">
          <ReferenceTab />
        </TabsContent>
        <TabsContent value="trip">
          <TripSalaryTab />
        </TabsContent>
        <TabsContent value="toll">
          <TollCostTab />
        </TabsContent>
        <TabsContent value="fuel">
          <FuelCostTab />
        </TabsContent>
        <TabsContent value="summary">
          <SummaryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- Shared

/** Routes of the Variable Cost screens, by code. */
function useRoutes() {
  const all = useCollection(routeRepository);
  return useMemo(
    () => all.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [all],
  );
}
function useTollMasters() {
  const all = useCollection(tollStationRepository);
  return useMemo(() => all.filter((t) => !t.deleted), [all]);
}
/** Everything a route × vehicle type figure needs. */
function useVariableContext() {
  const salary = useSalaryRanges();
  const fuel = useFuelSetup();
  const masters = useTollMasters();
  const others = useOtherCosts();
  return useMemo(
    () => ({ tables: salary.current.tables, fuel, masters, others: others.values }),
    [salary, fuel, masters, others],
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 rounded-md border border-dashed border-warning/60 bg-warning/10 px-3 py-1.5 text-xs text-foreground">
      {children}
    </div>
  );
}

function VersionBar({
  from,
  to,
  version,
  onSave,
}: {
  from: string;
  to: string;
  version: string;
  onSave: (from: string, to: string) => void;
}) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  useEffect(() => {
    setF(from);
    setT(to);
  }, [from, to]);
  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Effective From">
          <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="w-40" />
        </Field>
        <Field label="Effective To">
          <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="w-40" />
        </Field>
        <Field label="Version">
          <Input value={version} readOnly className="w-24 bg-muted/50" />
        </Field>
        <Button
          className="ml-auto"
          onClick={() => {
            if (!f || !t || t < f) {
              toast.error("Effective To must not be before Effective From.");
              return;
            }
            onSave(f, t);
          }}
        >
          Save Version
        </Button>
      </div>
    </Panel>
  );
}

const exportRows = (screen: string, headers: string[], rows: unknown[][]) =>
  void exportView({ entityType: "Cost", screen, headers, rows, scope: "current view" })
    .then((file) => toast.success(`Exported ${rows.length} rows → ${file}`))
    .catch(() => toast.error("Export failed, please try again."));

// ---------------------------------------------------------------- Salary Range

function SalaryRangeTab() {
  const store = useSalaryRanges();
  const cur = store.current;
  const [from, setFrom] = useState(cur.effectiveFrom);
  const [to, setTo] = useState(cur.effectiveTo);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setFrom(cur.effectiveFrom);
    setTo(cur.effectiveTo);
  }, [cur.effectiveFrom, cur.effectiveTo]);

  const saveVersion = () => {
    if (!from || !to || to < from) {
      toast.error("Effective To must not be before Effective From.");
      return;
    }
    const v = salaryRangeService.saveVersion(from, to);
    toast.success(`Version ${v} saved`);
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Effective From">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </Field>
          <Field label="Effective To">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </Field>
          <Field label="Version">
            <Input value={cur.version} readOnly className="w-24 bg-muted/50" />
          </Field>
          <span className="mb-2 text-xs text-muted-foreground">
            Saved {formatDateTime(cur.savedAt)} · {cur.savedBy}
            {store.history.length > 0 && ` · ${store.history.length} earlier version(s)`}
          </span>
          <Button className="ml-auto" onClick={saveVersion}>
            Save Version
          </Button>
        </div>
      </Panel>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between bg-card-header px-4 py-3 text-left"
        >
          <h2 className="text-[17px] font-semibold text-card-title">Driver Salary Range</h2>
          <ChevronDown className={cn("h-5 w-5 transition-transform", !open && "-rotate-90")} />
        </button>
        {open && (
          <div className="space-y-4 p-3">
            {(Object.keys(VEHICLE_TYPES_BY_CATEGORY) as VehicleCategory[]).map((c) => (
              <CategoryTiers key={c} category={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryTiers({ category }: { category: VehicleCategory }) {
  const store = useSalaryRanges();
  const types = VEHICLE_TYPES_BY_CATEGORY[category];
  const [type, setType] = useState(category === "Truck" ? "Xe tải 2T" : types[0]!);
  const saved = store.current.tables[type] ?? [];
  const [rows, setRows] = useState<SalaryTier[]>(saved);
  const [open, setOpen] = useState(true);
  const savedSig = JSON.stringify(saved);
  useEffect(() => setRows(JSON.parse(savedSig) as SalaryTier[]), [savedSig, type]);
  const dirty = JSON.stringify(rows) !== savedSig;
  useUnsavedChangesGuard(dirty);
  const check = validateTiers(rows);

  const set = (i: number, k: keyof SalaryTier, v: string) =>
    setRows((r) => r.map((t, j) => (j === i ? { ...t, [k]: v === "" ? NaN : Number(v) } : t)));
  const addTier = () =>
    setRows((r) => {
      const last = r[r.length - 1];
      const start = last ? last.to + 1 : 0;
      return [
        ...r,
        {
          from: start,
          to: start + 99,
          tripSalary: last?.tripSalary ?? 0,
          extraRate: last?.extraRate ?? 0,
          tollAllowance: last?.tollAllowance ?? 0,
        },
      ];
    });
  const save = () => {
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    salaryRangeService.saveTable(type, rows);
    toast.success(`${type} salary range saved`);
  };
  const changeType = (v: string) => {
    if (dirty && !window.confirm("Discard the unsaved changes of this vehicle type?")) return;
    setType(v);
  };

  return (
    <section className="overflow-hidden rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-card-header px-4 py-2.5 text-left"
      >
        <h3 className="font-semibold text-card-title">{category}</h3>
        <ChevronDown className={cn("h-5 w-5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Vehicle Type">
              <NativeSelect value={type} onChange={changeType} options={types} className="w-48" />
            </Field>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={addTier}>
                <Plus className="h-4 w-4" />
                Add Tier
              </Button>
              <Button size="sm" onClick={save} disabled={!dirty}>
                Save
              </Button>
            </div>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
              check.ok
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {check.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            <b>{check.ok ? "Valid." : "Invalid."}</b> {check.message}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thClass, "w-20")}>Tier</TableHead>
                  <TableHead className={cn(thClass, "w-56")}>Distance (km)</TableHead>
                  <TableHead className={thClass}>Trip Salary</TableHead>
                  <TableHead className={thClass}>Extra Distance Rate (đ/km)</TableHead>
                  <TableHead className={thClass}>Toll Allowance</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1.5 text-sm">Tier {i + 1}</TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1">
                        <NumInput
                          value={t.from}
                          onChange={(v) => set(i, "from", v)}
                          className="w-20"
                        />
                        <span className="text-muted-foreground">–</span>
                        <NumInput value={t.to} onChange={(v) => set(i, "to", v)} className="w-20" />
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <NumInput value={t.tripSalary} onChange={(v) => set(i, "tripSalary", v)} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <NumInput value={t.extraRate} onChange={(v) => set(i, "extraRate", v)} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <NumInput
                        value={t.tollAllowance}
                        onChange={(v) => set(i, "tollAllowance", v)}
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <button
                        type="button"
                        aria-label={`Remove tier ${i + 1}`}
                        className="text-destructive hover:opacity-70"
                        onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

function NumInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Input
      inputMode="numeric"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      className={cn("h-8 tabular-nums", className)}
    />
  );
}

// ---------------------------------------------------------------- Reference Trip Salary

function ReferenceTab() {
  const store = useSalaryRanges();
  const routes = useRoutes();
  const [type, setType] = useState("Xe tải 2T");
  const [routeId, setRouteId] = useState("");
  const [std, setStd] = useState("420");
  const [actual, setActual] = useState("452");
  const [toll, setToll] = useState("");
  const pickRoute = (id: string) => {
    setRouteId(id);
    const r = routes.find((x) => x.id === id);
    if (r) setStd(String(Math.round(routeTotals(r).distanceKm)));
  };
  const s = tripSalaryOf(
    store.current.tables[type] ?? [],
    Number(std),
    actual ? Number(actual) : undefined,
    toll ? Number(toll) : undefined,
  );
  const digits = (v: string) => v.replace(/[^\d.]/g, "");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <Panel title="Trip Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle Type" className="sm:col-span-2">
            <NativeSelect
              value={type}
              onChange={setType}
              options={ALL_VEHICLE_TYPES}
              className="w-full"
            />
          </Field>
          <Field label="Route" className="sm:col-span-2">
            <SearchableSelect
              value={routeId}
              onChange={pickRoute}
              options={["", ...routes.map((r) => r.id)]}
              labels={{
                "": "— Select a route —",
                ...Object.fromEntries(routes.map((r) => [r.id, `${r.code} · ${r.name}`])),
              }}
              searchPlaceholder="Search route…"
              emptyText="No matching route"
            />
          </Field>
          <Field label="Standard Distance (km)">
            <Input
              value={std}
              onChange={(e) => setStd(digits(e.target.value))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Actual Distance (km)">
            <Input
              value={actual}
              onChange={(e) => setActual(digits(e.target.value))}
              inputMode="numeric"
            />
          </Field>
          <Field label="Actual Toll (blank = use standard)" className="sm:col-span-2">
            <Input
              value={toll}
              onChange={(e) => setToll(digits(e.target.value))}
              placeholder="Standard: auto by tier"
              inputMode="numeric"
            />
          </Field>
        </div>
      </Panel>

      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Salary tier applied
            </div>
            <span className="mt-1 inline-block rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {s ? `Tier ${s.tier} · ${s.tierRange}` : "Out of range"}
            </span>
          </div>
          {s && (
            <div className="divide-y px-3 text-sm">
              <ReceiptLine
                label="Trip Salary"
                hint={`Tier ${s.tier} · ${s.tierRange}`}
                amount={s.base}
              />
              <ReceiptLine
                label="Extra Distance Pay"
                hint={`${s.extraKm} km × ${formatNumber(s.extraRate)} đ/km`}
                amount={s.extra}
              />
              <ReceiptLine
                label="Toll Allowance"
                hint={toll ? "Actual toll" : `Tier ${s.tier} standard`}
                amount={s.tollAllowance}
              />
            </div>
          )}
          <div className="flex items-center justify-between bg-slate-800 px-3 py-2.5 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Total trip salary
            </span>
            <span className="text-lg font-bold tabular-nums">{money(s?.total ?? 0)} đ</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled title="Trips are not part of this demo yet" className="w-full">
            Apply to Trip
          </Button>
          <Button
            variant="outline"
            disabled={!s}
            onClick={() =>
              s &&
              exportRows(
                "trip-salary-receipt",
                ["Item", "Detail", "Amount (đ)"],
                [
                  ["Vehicle Type", type, ""],
                  ["Standard / Actual Distance", `${std} km / ${actual || std} km`, ""],
                  ["Trip Salary", `Tier ${s.tier} · ${s.tierRange}`, s.base],
                  ["Extra Distance Pay", `${s.extraKm} km × ${s.extraRate} đ/km`, s.extra],
                  [
                    "Toll Allowance",
                    toll ? "Actual toll" : `Tier ${s.tier} standard`,
                    s.tollAllowance,
                  ],
                  ["Total Trip Salary", "", s.total],
                ],
              )
            }
          >
            Export Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReceiptLine({ label, hint, amount }: { label: string; hint: string; amount: number }) {
  return (
    <div className="flex items-start justify-between py-2">
      <div>
        <div>{label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <span className="font-semibold tabular-nums">{money(amount)} đ</span>
    </div>
  );
}

// ---------------------------------------------------------------- Trip Salary

function TripSalaryTab() {
  const routes = useRoutes();
  const ctx = useVariableContext();
  const [vehicle, setVehicle] = useState("");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      routes.flatMap((r) =>
        VEHICLE_TYPE_DEFS.filter((d) => !vehicle || d.type === vehicle).map((d) =>
          routeVariableCost(r, d.type, ctx),
        ),
      ),
    [routes, ctx, vehicle],
  );
  const shown = rows.filter((r) =>
    `${r.route.code} ${r.route.name}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const out = shown.filter((r) => r.calculated && !r.salary).length;
  const headers = [
    "#",
    "Route Code",
    "Route",
    "Std Km",
    "Vehicle Type",
    "Tier",
    "Trip Salary",
    "Toll Allowance",
    "Base Total",
    "đ / km",
    "Extra Rate đ/km",
  ];
  const cells = (r: RouteVariableCost): (string | number)[] => {
    const s = r.salary;
    return [
      r.stdKm,
      defOf(r.type)?.short ?? r.type,
      s ? `Tier ${s.tier}` : "",
      s?.base ?? "",
      s?.tollAllowance ?? "",
      s?.baseTotal ?? "",
      s && r.stdKm ? Math.round(s.baseTotal / r.stdKm) : "",
      s?.extraRate ?? "",
    ];
  };

  return (
    <div>
      <Banner>
        <b>Grain = route × vehicle type.</b> Standard km comes from route master data; every other
        column is looked up from <b>Salary Range</b>. Nothing here is editable — change tiers there
        instead.
      </Banner>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Filter Vehicle">
          <NativeSelect
            value={vehicle}
            onChange={setVehicle}
            options={["", ...ALL_VEHICLE_TYPES]}
            labels={{ "": "All" }}
            className="w-44"
          />
        </Field>
        <Field label="Search Route">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search route..."
            className="w-56"
          />
        </Field>
        <span className="ml-auto text-xs text-muted-foreground">
          {shown.length} rows · <span className="text-destructive">{out} out of range</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportRows(
              "trip-salary",
              headers,
              shown.map((r, i) => [i + 1, r.route.code, r.route.name, ...cells(r)]),
            )
          }
        >
          Export Excel
        </Button>
      </div>
      <Panel bodyClassName="p-0">
        {shown.length === 0 ? (
          <EmptyState title="No matching routes" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {headers.map((h, i) => (
                  <TableHead key={h} className={cn(thClass, i >= 6 || i === 3 ? "text-right" : "")}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, i) => {
                const s = r.salary;
                return (
                  <TableRow key={`${r.route.id}-${r.type}`}>
                    <TableCell className="py-2 text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="py-2">{r.route.code}</TableCell>
                    <TableCell className="py-2">{r.route.name}</TableCell>
                    <TableCell className={cn("py-2", num)}>
                      {r.calculated ? formatNumber(r.stdKm) : "—"}
                    </TableCell>
                    <TableCell className="py-2">{defOf(r.type)?.short}</TableCell>
                    {!r.calculated ? (
                      <TableCell colSpan={6} className="py-2 text-xs text-muted-foreground">
                        Not calculated — calculate the route first
                      </TableCell>
                    ) : !s ? (
                      <TableCell colSpan={6} className="py-2 text-xs text-destructive">
                        <span className="ml-0">Out of range</span>
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="py-2">Tier {s.tier}</TableCell>
                        <TableCell className={cn("py-2", num)}>{money(s.base)}</TableCell>
                        <TableCell className={cn("py-2", num)}>{money(s.tollAllowance)}</TableCell>
                        <TableCell className={cn("py-2 font-semibold", num)}>
                          {money(s.baseTotal)}
                        </TableCell>
                        <TableCell className={cn("py-2 text-muted-foreground", num)}>
                          {r.stdKm ? money(s.baseTotal / r.stdKm) : "—"}
                        </TableCell>
                        <TableCell className={cn("py-2", num)}>{money(s.extraRate)}</TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Toll Cost

function TollCostTab() {
  const routes = useRoutes();
  const masters = useTollMasters();
  const version = useTollVersion();
  const matrix = useMemo(
    () =>
      routes.map((r) => {
        const stations = routeTollStations(r, masters);
        return { route: r, stations, totals: tollTotals(stations) };
      }),
    [routes, masters],
  );
  const withTolls = matrix.filter((m) => m.stations.length > 0);
  const [routeId, setRouteId] = useState(withTolls[0]?.route.id ?? "");
  const [group, setGroup] = useState(5);
  const sel = matrix.find((m) => m.route.id === routeId);

  return (
    <div className="space-y-4">
      <Banner>
        <b>Toll Cost = Σ(station fee) at the column matching the vehicle group.</b> Station lists
        and the 5-group fee schedule come from Routing — this screen only selects a route + group
        and reads the result.
      </Banner>
      <VersionBar
        from={version.effectiveFrom}
        to={version.effectiveTo}
        version={version.version}
        onSave={(f, t) => toast.success(`Version ${tollVersionService.saveVersion(f, t)} saved`)}
      />

      <div>
        <h3 className="text-sm font-semibold">Toll Cost by Route × Vehicle Group</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Reference matrix — every route, every group
        </p>
        <Panel bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={thClass}>#</TableHead>
                <TableHead className={thClass}>Route Code</TableHead>
                <TableHead className={thClass}>Route</TableHead>
                <TableHead className={cn(thClass, "text-right")}>Stations</TableHead>
                {TOLL_GROUPS.map((g) => (
                  <TableHead key={g} className={cn(thClass, "text-right")}>
                    Group {g}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map((m, i) => (
                <TableRow
                  key={m.route.id}
                  className={cn("cursor-pointer", m.route.id === routeId && "bg-accent/60")}
                  onClick={() => m.stations.length && setRouteId(m.route.id)}
                >
                  <TableCell className="py-2 text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="py-2">{m.route.code}</TableCell>
                  <TableCell className="py-2">{m.route.name}</TableCell>
                  <TableCell className={cn("py-2", num)}>{m.stations.length || "—"}</TableCell>
                  {m.totals.map((t, g) => (
                    <TableCell key={g} className={cn("py-2", num, g === 4 && "font-semibold")}>
                      {m.stations.length ? money(t) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Field label="Route" hint="Only routes with toll stations declared in Routing appear here">
        <NativeSelect
          value={routeId}
          onChange={setRouteId}
          options={withTolls.map((m) => m.route.id)}
          labels={Object.fromEntries(
            withTolls.map((m) => [
              m.route.id,
              `${m.route.code} · ${m.route.name} — ${m.stations.length} stations`,
            ]),
          )}
          className="w-full max-w-xl"
        />
      </Field>

      {sel && (
        <>
          <RouteCard route={sel.route} stations={sel.stations.length} />
          <div className="rounded-xl border bg-accent/40 p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicle group
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="inline-flex rounded-lg border bg-card p-1">
                {TOLL_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm",
                      g === group ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    Group {g}
                  </button>
                ))}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary tabular-nums">
                  {money(sel.totals[group - 1] ?? 0)} đ
                </div>
                <div className="text-xs text-muted-foreground">
                  {sel.stations.length} stations · {TOLL_GROUP_INFO[group - 1]?.applied}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Station Details on Route</h3>
            {(["Departure", "Return"] as const).map((leg) => {
              const list = sel.stations.filter((s) => s.leg === leg);
              if (!list.length) return null;
              const tot = tollTotals(list);
              return (
                <div key={leg} className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {leg} · {list.length} stations
                  </div>
                  <Panel bodyClassName="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className={thClass}>Station Code</TableHead>
                          <TableHead className={thClass}>Station Name</TableHead>
                          {TOLL_GROUPS.map((g) => (
                            <TableHead key={g} className={cn(thClass, "text-right")}>
                              Group {g}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-2">{s.code}</TableCell>
                            <TableCell className="py-2">{s.name}</TableCell>
                            {s.fees.map((f, g) => (
                              <TableCell
                                key={g}
                                className={cn(
                                  "py-2",
                                  num,
                                  g === group - 1 && "font-semibold text-primary",
                                )}
                              >
                                {money(f)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={2} className="py-2 text-xs font-semibold">
                            Total {leg}
                          </TableCell>
                          {tot.map((t, g) => (
                            <TableCell
                              key={g}
                              className={cn(
                                "py-2 font-semibold",
                                num,
                                g === group - 1 && "text-primary",
                              )}
                            >
                              {money(t)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </Panel>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function RouteCard({ route, stations }: { route: RouteRecord; stations: number }) {
  const t = routeTotals(route);
  const drops = [...route.waypoints, ...(route.type === "Round Trip" ? [route.destination] : [])];
  const point = (label: string, color: string, name: string) => (
    <div className="flex gap-2">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", color)} />
      <div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
        <div className="text-xs">{name || "—"}</div>
      </div>
    </div>
  );
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3 text-sm sm:grid-cols-[200px_1fr_140px]">
      <div className="space-y-2">
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">
            Route code
          </div>
          <div className="font-semibold">{route.code}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">
            Valid from
          </div>
          <div>{formatDate(route.createdAt)}</div>
        </div>
      </div>
      <div className="space-y-1.5 border-l pl-3">
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">Route name</div>
        <div className="font-semibold">{route.name}</div>
        {point("Departure", "bg-success", route.origin.name)}
        {drops.map((p, i) => (
          <Fragment key={i}>{point("Drop", "bg-warning", p.name)}</Fragment>
        ))}
        {point(
          "Return",
          "bg-destructive",
          route.type === "Round Trip" ? route.origin.name : route.destination.name,
        )}
      </div>
      <div className="space-y-2 border-l pl-3">
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Distance</div>
          <div className="font-semibold">
            {t.calculated ? `${formatNumber(t.distanceKm)} km` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Stations</div>
          <div className="font-semibold">{stations}</div>
        </div>
        <Link
          to="/routing/$id"
          params={{ id: route.id }}
          search={{ mode: "view" }}
          className="text-xs text-primary hover:underline"
        >
          Open route
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Fuel Cost

function FuelCostTab() {
  const routes = useRoutes();
  const fuel = useFuelSetup();
  const [price, setPrice] = useState(String(fuel.price));
  const [norms, setNorms] = useState<Record<string, string>>({});
  const [litres, setLitres] = useState(false);
  useEffect(() => {
    setPrice(String(fuel.price));
    setNorms(Object.fromEntries(ALL_VEHICLE_TYPES.map((t) => [t, String(fuel.norms[t] ?? 0)])));
  }, [fuel]);
  const p = Number(price) || 0;
  const n = (t: string) => Number(norms[t]) || 0;
  const dirty = p !== fuel.price || ALL_VEHICLE_TYPES.some((t) => n(t) !== (fuel.norms[t] ?? 0));
  useUnsavedChangesGuard(dirty);
  const save = () => {
    if (!(p > 0)) {
      toast.error("Fuel price must be above 0.");
      return;
    }
    const v = fuelService.save(p, Object.fromEntries(ALL_VEHICLE_TYPES.map((t) => [t, n(t)])));
    toast.success(`Fuel price saved (${v})`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-warning/40 bg-warning/10 p-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Current fuel price
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
              className="h-8 w-32 bg-card tabular-nums"
            />
            <span className="text-xs font-medium">đ / liter</span>
          </div>
        </div>
        <div className="border-l pl-4 text-xs text-muted-foreground">
          Effective from <b>{formatDate(fuel.effectiveFrom)}</b> to{" "}
          <b>{formatDate(fuel.effectiveTo)}</b>
          <br />
          Version: <b>{fuel.version}</b> · Updated by: {fuel.savedBy}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrice(String(fuel.basePrice))}>
            Reset to Base Price
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty}>
            Save Fuel Price
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Consumption Norm by Vehicle Type</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Liters of fuel per 100 km — basis for the whole matrix below. CNTR Reefer is higher than
          Dry due to the cooling unit.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {ALL_VEHICLE_TYPES.map((t) => (
            <div key={t}>
              <div className="text-xs font-medium">{t}</div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={norms[t] ?? ""}
                  onChange={(e) =>
                    setNorms((x) => ({ ...x, [t]: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                  className="h-8 w-16 tabular-nums"
                />
                <span className="text-[10px] text-muted-foreground">L/100km</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                ≈ {formatNumber(Math.round((n(t) / 100) * p))} đ/km
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold">Fuel Cost by Route × Vehicle Type</h3>
            <p className="text-xs text-muted-foreground">
              Standard km taken from route master data
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLitres((x) => !x)}>
            {litres ? "Show Cost" : "Show Litres"}
          </Button>
        </div>
        <Panel bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={thClass}>#</TableHead>
                <TableHead className={thClass}>Route Code</TableHead>
                <TableHead className={thClass}>Route</TableHead>
                <TableHead className={cn(thClass, "text-right")}>Std Km</TableHead>
                {ALL_VEHICLE_TYPES.map((t) => (
                  <TableHead key={t} className={cn(thClass, "text-right")}>
                    {t}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((r, i) => {
                const t = routeTotals(r);
                const km = Math.round(t.distanceKm);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="py-2 text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="py-2">{r.code}</TableCell>
                    <TableCell className="py-2">{r.name}</TableCell>
                    <TableCell className={cn("py-2", num)}>
                      {t.calculated ? formatNumber(km) : "—"}
                    </TableCell>
                    {ALL_VEHICLE_TYPES.map((type, j) => (
                      <TableCell
                        key={type}
                        className={cn(
                          "py-2",
                          num,
                          j === ALL_VEHICLE_TYPES.length - 1 &&
                            "bg-success/10 font-semibold text-success",
                        )}
                      >
                        {!t.calculated
                          ? "—"
                          : litres
                            ? formatNumber(Math.round((km * n(type)) / 10) / 10)
                            : money(fuelCostOf(km, n(type), p))}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Summary

function SummaryTab() {
  const routes = useRoutes();
  const ctx = useVariableContext();
  const salary = useSalaryRanges();
  const others = useOtherCosts();
  const [routeId, setRouteId] = useState("");
  const [detail, setDetail] = useState<RouteVariableCost | null>(null);
  const rows = useMemo(
    () =>
      routes
        .filter((r) => !routeId || r.id === routeId)
        .flatMap((r) => ALL_VEHICLE_TYPES.map((t) => routeVariableCost(r, t, ctx))),
    [routes, ctx, routeId],
  );
  const cur = salary.current;
  const effective = `${formatDate(cur.effectiveFrom)} – ${formatDate(cur.effectiveTo)}`;
  const headers = [
    "Route",
    "Route Name",
    "Vehicle Group",
    "Vehicle Type",
    "Fuel Cost",
    "Driver Cost",
    "Toll Fee",
    "Other Cost",
    "Total Variable Cost",
    "Effective",
    "Last Modified",
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Filter Route">
          <NativeSelect
            value={routeId}
            onChange={setRouteId}
            options={["", ...routes.map((r) => r.id)]}
            labels={{ "": "All", ...Object.fromEntries(routes.map((r) => [r.id, r.code])) }}
            className="w-44"
          />
        </Field>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            exportRows(
              "variable-cost-summary",
              headers,
              rows.map((r) => [
                r.route.code,
                r.route.name,
                `Group ${r.group}`,
                r.type,
                r.fuel,
                r.salary?.base ?? 0,
                r.toll,
                r.other,
                r.total,
                `${effective} ${cur.version}`,
                formatDateTime(others.savedAt),
              ]),
            )
          }
        >
          Export Excel
        </Button>
      </div>
      <Panel bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {headers.map((h, i) => (
                <TableHead key={h} className={cn(thClass, i >= 4 && i <= 8 && "text-right")}>
                  {h}
                </TableHead>
              ))}
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.route.id}-${r.type}`}>
                <TableCell className="py-1.5">{r.route.code}</TableCell>
                <TableCell className="py-1.5">{r.route.name}</TableCell>
                <TableCell className="py-1.5">Group {r.group}</TableCell>
                <TableCell className="py-1.5">{r.type}</TableCell>
                <TableCell className={cn("py-1.5", num)}>{money(r.fuel)}</TableCell>
                <TableCell className={cn("py-1.5", num)}>
                  {r.salary ? (
                    money(r.salary.base)
                  ) : (
                    <span className="text-xs text-destructive">Out of range</span>
                  )}
                </TableCell>
                <TableCell className={cn("py-1.5", num)}>{money(r.toll)}</TableCell>
                <TableCell className="py-1.5">
                  <OtherInput
                    value={r.other}
                    onSave={(v) => otherCostService.set(r.route.id, r.type, v)}
                  />
                </TableCell>
                <TableCell className={cn("py-1.5 font-semibold", num)}>{money(r.total)}</TableCell>
                <TableCell className="py-1.5 text-[10px] leading-tight text-muted-foreground">
                  {effective}
                  <br />
                  {cur.version}
                </TableCell>
                <TableCell className="py-1.5 text-[10px] leading-tight text-muted-foreground">
                  {formatDateTime(
                    others.values[otherKey(r.route.id, r.type)] !== undefined
                      ? others.savedAt
                      : cur.savedAt,
                  )}
                  <br />
                  {others.values[otherKey(r.route.id, r.type)] !== undefined
                    ? others.savedBy
                    : cur.savedBy}
                </TableCell>
                <TableCell className="py-1.5">
                  <Button variant="outline" size="sm" onClick={() => setDetail(r)}>
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.route.code} · {detail.type}
                </DialogTitle>
                <DialogDescription>
                  {detail.route.name} · Group {detail.group} · {formatNumber(detail.stdKm)} km
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <DetailLine
                  label="Fuel Cost"
                  hint={`${detail.fuelNorm} L/100km × ${detail.stdKm} km = ${detail.fuelLitres} L × ${formatNumber(detail.fuelPrice)} đ`}
                  amount={detail.fuel}
                />
                <DetailLine
                  label="Driver Cost"
                  hint={
                    detail.salary
                      ? `Tier ${detail.salary.tier} · ${detail.salary.tierRange}`
                      : "Out of range"
                  }
                  amount={detail.salary?.base ?? 0}
                />
                <DetailLine
                  label="Toll Fee"
                  hint={`${detail.stationCount} stations at Group ${detail.group}`}
                  amount={detail.toll}
                />
                <DetailLine
                  label="Other Cost"
                  hint="Entered on the Summary"
                  amount={detail.other}
                />
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total Variable Cost</span>
                  <span className="tabular-nums">{money(detail.total)} đ</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OtherInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v) || 0;
    if (n !== value) {
      onSave(n);
      toast.success("Other cost saved");
    }
  };
  return (
    <Input
      value={v}
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="h-8 w-28 tabular-nums"
    />
  );
}

function DetailLine({ label, hint, amount }: { label: string; hint: string; amount: number }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <span className="tabular-nums">{money(amount)} đ</span>
    </div>
  );
}
