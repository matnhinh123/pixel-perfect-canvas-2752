// Variable Cost (as on the old Xink screen): Salary Range · Reference Trip Salary · Trip Salary ·
// Toll Cost · Fuel Cost · Summary.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  StatusBadge,
  thClass,
} from "@/components/movex/common";
import { useUnsavedChangesGuard } from "@/components/movex/general/FormPage";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import {
  ALL_VEHICLE_TYPES,
  FUEL_NORM_BY_TYPE,
  routeVariableCost,
  salaryRangeService,
  tripSalaryOf,
  useSalaryRanges,
  validateTiers,
  VEHICLE_TYPES_BY_CATEGORY,
  type RouteVariableCost,
  type SalaryTier,
  type VehicleCategory,
} from "@/services/cost/salaryRange";
import { FUEL_PRICE, TERRAIN_FACTORS } from "@/mock-data/cogsRates";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

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
          <RouteTab mode="trip" />
        </TabsContent>
        <TabsContent value="toll">
          <RouteTab mode="toll" />
        </TabsContent>
        <TabsContent value="fuel">
          <RouteTab mode="fuel" />
        </TabsContent>
        <TabsContent value="summary">
          <RouteTab mode="summary" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
  const [type, setType] = useState("Xe tải 2T");
  const [km, setKm] = useState("320");
  const tiers = store.current.tables[type] ?? [];
  const r = tripSalaryOf(tiers, Number(km));
  return (
    <div className="space-y-4">
      <Panel title="Trip Salary Calculator">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Vehicle Type">
            <NativeSelect
              value={type}
              onChange={setType}
              options={ALL_VEHICLE_TYPES}
              className="w-48"
            />
          </Field>
          <Field label="Distance (km)">
            <Input
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-32"
            />
          </Field>
        </div>
        {r && (
          <div className="mt-4 max-w-xl space-y-1 text-sm">
            <Line label={`Tier ${r.tier} (${r.tierRange})`} amount={r.base} />
            <Line
              label="Extra distance"
              hint={`${r.extraKm} km × ${formatNumber(r.extraRate)} đ/km`}
              amount={r.extra}
            />
            <Line label="Trip Salary" amount={r.salary} strong />
            <Line label="Toll Allowance" amount={r.tollAllowance} />
            <Line label="Total paid to the driver" amount={r.total} strong />
          </div>
        )}
      </Panel>
      <Panel title={`Reference — ${type}`} bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Tier", "Distance (km)", "Salary at start", "Salary at end", "Toll Allowance"].map(
                (h, i) => (
                  <TableHead key={h} className={cn(thClass, i > 1 && "text-right")}>
                    {h}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((t, i) => (
              <TableRow key={i}>
                <TableCell className="py-2">Tier {i + 1}</TableCell>
                <TableCell className="py-2">
                  {t.from} – {t.to}
                </TableCell>
                <TableCell className={cn("py-2", num)}>{money(t.tripSalary)}</TableCell>
                <TableCell className={cn("py-2", num)}>
                  {money(t.tripSalary + (t.to - t.from) * t.extraRate)}
                </TableCell>
                <TableCell className={cn("py-2", num)}>{money(t.tollAllowance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function Line({
  label,
  hint,
  amount,
  strong,
}: {
  label: string;
  hint?: string;
  amount: number;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline gap-3", strong && "border-t pt-1 font-semibold")}>
      <span className="w-56 shrink-0">{label}</span>
      <span className="flex-1 text-xs text-muted-foreground">{hint}</span>
      <span className={cn("w-32", num)}>{money(amount)} ₫</span>
    </div>
  );
}

// ---------------------------------------------------------------- Route tabs

type RouteMode = "trip" | "toll" | "fuel" | "summary";

function RouteTab({ mode }: { mode: RouteMode }) {
  const store = useSalaryRanges();
  const routesAll = useCollection(routeRepository);
  const [type, setType] = useState("Xe tải 2T");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      routesAll
        .filter((r) => !r.deleted)
        .map((r) => routeVariableCost(r, type, store.current.tables[type] ?? []))
        .sort((a, b) => a.route.code.localeCompare(b.route.code)),
    [routesAll, store, type],
  );
  const shown = rows.filter((r) =>
    `${r.route.code} ${r.route.name}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const cols: { label: string; value: (r: RouteVariableCost) => ReactNode; strong?: boolean }[] =
    mode === "trip"
      ? [
          { label: "Distance (km)", value: (r) => formatNumber(r.distanceKm) },
          { label: "Tier", value: (r) => (r.salary ? `Tier ${r.salary.tier}` : "—") },
          { label: "Tier Salary", value: (r) => money(r.salary?.base ?? 0) },
          { label: "Extra Distance", value: (r) => money(r.salary?.extra ?? 0) },
          { label: "Trip Salary", value: (r) => money(r.salary?.salary ?? 0) },
          { label: "Toll Allowance", value: (r) => money(r.salary?.tollAllowance ?? 0) },
          { label: "Total", value: (r) => money(r.salary?.total ?? 0), strong: true },
        ]
      : mode === "toll"
        ? [
            { label: "Outbound Toll", value: (r) => money(r.outboundToll) },
            { label: "Return Toll", value: (r) => money(r.returnToll) },
            { label: "Ferry", value: (r) => money(r.ferry) },
            { label: "Other", value: (r) => money(r.other) },
            { label: "Toll Cost", value: (r) => money(r.routeCost), strong: true },
          ]
        : mode === "fuel"
          ? [
              { label: "Distance (km)", value: (r) => formatNumber(r.distanceKm) },
              { label: "Terrain ×", value: (r) => r.terrainFactor },
              { label: "Norm (l/100km)", value: (r) => r.fuelNorm },
              { label: "Fuel (l)", value: (r) => formatNumber(r.fuelLitres) },
              { label: "Fuel Price (₫/l)", value: (r) => formatNumber(r.fuelPrice) },
              { label: "Fuel Cost", value: (r) => money(r.fuel), strong: true },
            ]
          : [
              { label: "Distance (km)", value: (r) => formatNumber(r.distanceKm) },
              { label: "Trip Salary", value: (r) => money(r.salary?.total ?? 0) },
              { label: "Toll Cost", value: (r) => money(r.routeCost) },
              { label: "Fuel Cost", value: (r) => money(r.fuel) },
              { label: "Variable Cost", value: (r) => money(r.total), strong: true },
            ];

  return (
    <div className="space-y-4">
      {mode === "fuel" && (
        <Panel title="Fuel Norms" bodyClassName="p-0">
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            Fuel price {formatNumber(FUEL_PRICE)} ₫/l · Terrain factor: Plain ×
            {TERRAIN_FACTORS.Plain}, Highland ×{TERRAIN_FACTORS.Highland}
          </p>
          <div className="grid grid-cols-2 gap-x-6 px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {ALL_VEHICLE_TYPES.map((t) => (
              <div key={t} className="flex justify-between border-b py-1">
                <span>{t}</span>
                <span className="tabular-nums">{FUEL_NORM_BY_TYPE[t]} l/100km</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search route code, name..."
            className="max-w-xs"
          />
          {mode !== "toll" && (
            <NativeSelect value={type} onChange={setType} options={ALL_VEHICLE_TYPES} />
          )}
          {mode === "toll" && (
            <span className="text-xs text-muted-foreground">
              Tolls, ferries and manual costs of each route (both legs on a Round Trip).
            </span>
          )}
        </div>
        {shown.length === 0 ? (
          <EmptyState title="No matching routes" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={thClass}>Route Code</TableHead>
                <TableHead className={thClass}>Route Name</TableHead>
                <TableHead className={thClass}>Route Type</TableHead>
                {cols.map((c) => (
                  <TableHead key={c.label} className={cn(thClass, "text-right")}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className={thClass}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.route.id}>
                  <TableCell className="py-2">
                    <Link
                      to="/routing/$id"
                      params={{ id: r.route.id }}
                      search={{ mode: "view" }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {r.route.code}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2">{r.route.name}</TableCell>
                  <TableCell className="py-2">{r.route.type}</TableCell>
                  {r.calculated ? (
                    cols.map((c) => (
                      <TableCell
                        key={c.label}
                        className={cn("py-2", num, c.strong && "font-semibold")}
                      >
                        {c.value(r)}
                      </TableCell>
                    ))
                  ) : (
                    <TableCell
                      colSpan={cols.length}
                      className="py-2 text-center text-muted-foreground"
                    >
                      Not calculated — calculate the route first
                    </TableCell>
                  )}
                  <TableCell className="py-2">
                    <StatusBadge status={r.route.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
