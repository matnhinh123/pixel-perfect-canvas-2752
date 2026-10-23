// Create / view / edit a COGS: Code + Name, a route, a vehicle type (from Master Data > Vehicle), the
// Fixed Cost Mappings picked (their fixed costs) and the Variable Cost of the route × vehicle type (Trip
// Salary and Road Support Fee from its Salary Range, Fuel Cost from its Fuel Cost, Toll Fee of the route).
// Lines can be edited or removed; other Fare Codes can be added. View shows the costs as saved.
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Panel,
  StatusBadge,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  routeRepository,
  fuelCostRepository,
  salaryRangeRepository,
  tollStationRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { buildCogs, fixedCostPerDay, mappingsFor, setupsFor } from "@/services/cost/cogsBuild";
import { cogsVehicleTypes } from "@/services/cost/cogsVehicle";
import {
  cogsService,
  draftOfCogs,
  newCogsDraft,
  factorOf,
  sanitizeCogsCode,
  type CogsDraft,
} from "@/services/cost/cogsService";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CogsLine, CogsLineGroup, CogsRecord } from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
let seq = 0;
/** Colour mark of each part of the COGS. */
const ACCENT: Record<CogsLineGroup, string> = {
  "Fixed Cost": "bg-primary",
  "Variable Cost": "bg-warning",
  "Other Cost": "bg-muted-foreground",
};

export function CogsForm({ source, readOnly }: { source: CogsRecord | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const isNew = !source;
  const routesAll = useCollection(routeRepository);
  const fixedAll = useCollection(fixedCostRepository);
  const mappings = useCollection(fixedCostSummaryRepository);
  const costsAll = useCollection(costItemRepository);
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const salaryRanges = useCollection(salaryRangeRepository);
  const fuelCosts = useCollection(fuelCostRepository);
  const tollAll = useCollection(tollStationRepository);
  const tollMasters = useMemo(() => tollAll.filter((t) => !t.deleted), [tollAll]);
  const routes = useMemo(
    () => routesAll.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [routesAll],
  );
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const vehicleTypes = useMemo(() => cogsVehicleTypes(vehiclesAll), [vehiclesAll]);
  const initial = useMemo<CogsDraft>(
    () => (source ? draftOfCogs(source) : newCogsDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<CogsDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const route = routes.find((r) => r.id === d.routeId);
  const vehicle = vehicleTypes.find((t) => t.key === d.vehicleType);
  const built =
    route && vehicle
      ? buildCogs({
          route,
          vehicle,
          salaryRanges,
          fuelCosts,
          tollMasters,
          fixedCosts: fixedAll,
          mappings,
          mappingIds: d.mappingIds,
          utilizationFactor: factorOf(d),
          salaryRangeId: d.salaryRangeId,
          fuelCostId: d.fuelCostId,
          costs,
          excluded: d.excluded,
          overrides: d.overrides,
          others: d.others,
        })
      : null;

  // View: the costs as saved. Create / Edit: rebuilt from the current setup.
  const lines: CogsLine[] = readOnly && source ? source.lines : (built?.lines ?? []);
  const total = readOnly && source ? source.total : (built?.total ?? 0);
  const costErrors =
    errors["utilizationFactor"] ??
    errors["mappingIds"] ??
    errors["salaryRangeId"] ??
    errors["fuelCostId"] ??
    errors["others"] ??
    errors["overrides"];

  // Mappings of the vehicle type (Fixed and Variable) a COGS can pick.
  type MappingRow = { id: string; fareCode: string; fareName: string; hint: string };
  const fareOf = (id: string) => costsAll.find((c) => c.id === id);
  const fixedRows = useMemo<MappingRow[]>(
    () =>
      (vehicle ? mappingsFor(mappings, vehicle) : []).map((m) => {
        const items = m.fixedCostIds
          .map((id) => fixedAll.find((f) => f.id === id && !f.deleted && f.status === "Active"))
          .filter((f): f is NonNullable<typeof f> => !!f);
        return {
          id: m.id,
          fareCode: fareOf(m.assignCostId)?.code ?? "—",
          fareName: fareOf(m.assignCostId)?.name ?? "",
          hint: `${money(items.reduce((sum, f) => sum + fixedCostPerDay(f), 0))} / trip`,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicle, mappings, costsAll, fixedAll],
  );
  /** Fare Code of a picked mapping, also when it no longer applies (view of an old COGS). */
  const fareOfMapping = (id: string) => {
    const m = mappings.find((x) => x.id === id);
    return m ? fareOf(m.assignCostId) : undefined;
  };
  /** Picks / drops a mapping, keeping the picked ones in list order. */
  const toggleMapping = (field: "mappingIds", rows: MappingRow[], id: string, on: boolean) =>
    patch({
      [field]: on
        ? rows.filter((m) => m.id === id || d[field].includes(m.id)).map((m) => m.id)
        : d[field].filter((x) => x !== id),
    });

  // Other Cost rows: the Fare Code is typed; the text is kept while it matches no code yet.
  const [codeText, setCodeText] = useState<Record<string, string>>({});
  const typeCode = (rid: string, v: string) => {
    const code = v.toUpperCase();
    setCodeText((x) => ({ ...x, [rid]: code }));
    const c = costs.find((x) => x.code.toUpperCase() === code.trim());
    setOther(rid, { costId: c?.id ?? "" });
  };
  /** Line whose amount is being edited (click the amount to edit it). */
  const [editing, setEditing] = useState<string | null>(null);

  const sum = (ls: CogsLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  const groupTotal = (g: CogsLineGroup) => sum(lines.filter((l) => l.group === g));
  const share = (n: number) => (total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : "—");
  const cols = readOnly ? 4 : 5;

  /** Section title row: name, what it holds, the way to add more, subtotal and share. */
  const sectionHead = (
    g: CogsLineGroup,
    detail: string,
    add?: ReactNode,
    link?: { to: "/fixed-cost" | "/variable-cost"; label: string },
  ) => (
    <TableRow key={`h:${g}`} className="border-t-2 bg-muted/50 hover:bg-muted/50">
      <TableCell colSpan={3} className="py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={cn("h-4 w-1 rounded-full", ACCENT[g])} />
          <span className="text-sm font-semibold">{g}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
          {link && (
            <Link to={link.to} className="text-xs text-primary hover:underline">
              Open {link.label}
            </Link>
          )}
          <span className="ml-auto flex items-center gap-3">
            {add}
            <span className="rounded bg-background px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {share(groupTotal(g))}
            </span>
          </span>
        </div>
      </TableCell>
      <TableCell className={cn("py-2.5 text-sm font-semibold", num)}>
        {money(groupTotal(g))}
      </TableCell>
      {!readOnly && <TableCell />}
    </TableRow>
  );

  const amountCell = (l: CogsLine) =>
    readOnly ? (
      money(l.amount)
    ) : editing === l.key ? (
      <Input
        autoFocus
        inputMode="numeric"
        value={String(l.amount)}
        onChange={(e) => editAuto(l, digits(e.target.value))}
        onBlur={() => setEditing(null)}
        onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
        className="ml-auto h-8 w-32 text-right tabular-nums"
      />
    ) : (
      <button
        type="button"
        title="Edit amount"
        onClick={() => setEditing(l.key)}
        className="group/amt inline-flex items-center gap-1.5 rounded px-1 tabular-nums hover:bg-accent"
      >
        <Pencil className="h-3 w-3 opacity-0 group-hover/amt:opacity-60" />
        {money(l.amount)}
      </button>
    );

  /** Fare Code cell spanning the costs it books (with the way to drop the mapping). */
  const fareCell = (id: string, span: number, onRemove?: () => void) => {
    const fare = fareOfMapping(id);
    return (
      <TableCell rowSpan={span} className="border-r bg-card py-2 align-top">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="font-semibold text-primary">{fare?.code ?? "—"}</div>
            <div className="truncate text-xs text-muted-foreground" title={fare?.name}>
              {fare?.name}
            </div>
          </div>
          {onRemove && (
            <button
              type="button"
              title={`Remove ${fare?.code ?? "mapping"} from this COGS`}
              aria-label={`Remove ${fare?.code ?? "mapping"}`}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </TableCell>
    );
  };

  /** One cost: its code and name, how it is worked out, and the amount. */
  const costCells = (l: CogsLine) => (
    <>
      <TableCell className="py-2 align-top">
        <div className="flex min-w-0 items-baseline gap-2">
          {l.code && l.group !== "Variable Cost" && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {l.code}
            </span>
          )}
          <span className="truncate" title={l.name}>
            {l.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2 align-top text-xs leading-5 text-muted-foreground">
        {l.basis}
      </TableCell>
      <TableCell className={cn("py-1.5 align-top", num)}>
        {amountCell(l)}
        {l.calculated !== undefined && (
          <div className="mt-0.5 text-[10px] text-warning">
            Edited · calculated {money(l.calculated)}
            {!readOnly && (
              <button
                type="button"
                className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                onClick={() => editAuto(l, l.calculated!)}
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
        )}
      </TableCell>
      {!readOnly && (
        <TableCell className="py-1.5 text-center align-top">
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            <RemoveButton onClick={() => removeAuto(l.key)} />
          </span>
        </TableCell>
      )}
    </>
  );

  /** Picked mappings of a section: the Fare Code spans the costs it books. */
  const mappingRowsOf = (
    picked: string[],
    rows: MappingRow[],
    field: "mappingIds",
    label: string,
  ) => {
    if (!picked.length)
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={cols} className="py-3 text-center text-xs text-muted-foreground">
            {rows.length || readOnly
              ? `No ${label} picked.`
              : `No ${label} for ${vehicle?.key ?? "this vehicle type"} yet.`}
          </TableCell>
        </TableRow>
      );
    return picked.map((id) => {
      const items = lines.filter((l) => l.mappingId === id);
      const remove = readOnly ? undefined : () => toggleMapping(field, rows, id, false);
      if (!items.length)
        return (
          <TableRow key={id} className="hover:bg-transparent">
            {fareCell(id, 1, remove)}
            <TableCell colSpan={cols - 1} className="py-2 text-xs text-muted-foreground">
              Nothing for this route / vehicle type (or every cost of it was removed).
            </TableCell>
          </TableRow>
        );
      return items.map((l, k) => (
        <TableRow key={l.key} className="group">
          {k === 0 && fareCell(id, items.length, remove)}
          {costCells(l)}
        </TableRow>
      ));
    });
  };

  // Variable Cost: read from the vehicle type's Salary Range / Fuel Cost and the route's Toll Stations.
  const salaryOptions = vehicle ? setupsFor(salaryRanges, vehicle.key) : [];
  const fuelOptions = vehicle ? setupsFor(fuelCosts, vehicle.key) : [];
  type SourceKey = "salaryRangeId" | "fuelCostId" | "toll";
  const SOURCES: { key: SourceKey; label: string; names: string[] }[] = [
    { key: "salaryRangeId", label: "Salary Range", names: ["Trip Salary", "Road Support Fee"] },
    { key: "fuelCostId", label: "Fuel Cost", names: ["Fuel Cost"] },
    { key: "toll", label: "Toll Station · Route", names: ["Toll Fee"] },
  ];
  const sourceCell = (src: (typeof SOURCES)[number], span: number, code: string) => {
    const options =
      src.key === "salaryRangeId" ? salaryOptions : src.key === "fuelCostId" ? fuelOptions : [];
    const picked =
      src.key === "salaryRangeId"
        ? built?.variable.salaryRange?.id
        : src.key === "fuelCostId"
          ? built?.variable.fuelCost?.id
          : undefined;
    return (
      <TableCell rowSpan={span} className="border-r bg-card py-2 align-top">
        <div className="text-xs text-muted-foreground">{src.label}</div>
        {!readOnly && src.key !== "toll" && options.length > 1 ? (
          <NativeSelect
            value={picked ?? ""}
            onChange={(id) => patch({ [src.key]: id })}
            options={options.map((o) => o.id)}
            labels={Object.fromEntries(
              options.map((o) => [
                o.id,
                `${o.code}${o.vehicleType === vehicle?.key ? "" : " (all brands)"}`,
              ]),
            )}
            className="mt-1 h-8 w-full text-xs"
          />
        ) : (
          <div className="font-semibold text-primary">{code || "—"}</div>
        )}
      </TableCell>
    );
  };
  const variableRowsOf = () => {
    const vLines = lines.filter((l) => l.group === "Variable Cost");
    const rows = SOURCES.flatMap((src) => {
      const ls = vLines.filter((l) => src.names.includes(l.name));
      return ls.map((l, k) => (
        <TableRow key={l.key} className="group">
          {k === 0 && sourceCell(src, ls.length, l.code)}
          {costCells(l)}
        </TableRow>
      ));
    });
    const missing =
      !readOnly && built && vehicle
        ? [
            !built.variable.salaryRange && "Salary Range (Trip Salary, Road Support Fee)",
            !built.variable.fuelCost && "Fuel Cost",
          ].filter(Boolean)
        : [];
    return (
      <>
        {rows}
        {missing.length > 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={cols} className="py-2 text-xs text-warning">
              Not counted: no {missing.join(" or ")} for {vehicle?.key} yet.{" "}
              <Link to="/variable-cost" className="text-primary hover:underline">
                Add it in Variable Cost
              </Link>
            </TableCell>
          </TableRow>
        )}
        {rows.length === 0 && missing.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={cols} className="py-3 text-center text-xs text-muted-foreground">
              No variable cost.
            </TableCell>
          </TableRow>
        )}
      </>
    );
  };

  /** "+ Add …" picker of the mappings not picked yet. */
  const addMapping = (rows: MappingRow[], picked: string[], field: "mappingIds", label: string) => {
    const off = rows.filter((m) => !picked.includes(m.id));
    if (readOnly || !built) return null;
    return (
      <div className="w-64">
        <SearchableSelect
          value=""
          onChange={(id) => id && toggleMapping(field, rows, id, true)}
          options={["", ...off.map((m) => m.id)]}
          labels={{
            "": off.length ? `+ Add ${label}` : `All ${label}s added`,
            ...Object.fromEntries(
              off.map((m) => [m.id, `${m.fareCode} · ${m.fareName} · ${m.hint}`]),
            ),
          }}
          disabled={!off.length}
          searchPlaceholder="Search Fare Code…"
          emptyText="No matching mapping"
        />
      </div>
    );
  };

  const removeAuto = (key: string) => {
    const { [key]: _drop, ...overrides } = d.overrides;
    patch({ excluded: [...d.excluded, key], overrides });
  };
  const restoreAuto = (key: string) => patch({ excluded: d.excluded.filter((k) => k !== key) });
  const editAuto = (l: CogsLine, amount: number) => {
    const calc = l.calculated ?? l.amount;
    const { [l.key]: _drop, ...rest } = d.overrides;
    patch({ overrides: amount === calc ? rest : { ...rest, [l.key]: amount } });
  };
  const setOther = (rid: string, p: Partial<CogsDraft["others"][number]>) =>
    patch({ others: d.others.map((o) => (o.rid === rid ? { ...o, ...p } : o)) });
  const addOther = () =>
    patch({ others: [...d.others, { rid: `o${Date.now()}${++seq}`, costId: "", amount: 0 }] });
  /** Enter in an Other Cost row adds the next row (its Fare Code box takes the focus). */
  const onOtherEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    addOther();
  };

  const back = () =>
    source
      ? void navigate({ to: "/cogs/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: "/cogs" });
  const save = () => {
    setFormError(null);
    try {
      const saved = cogsService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `${saved.code} created` : `${saved.code} saved`);
      void navigate({ to: "/cogs/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const removed = built ? built.autoLines.filter((l) => d.excluded.includes(l.key)) : [];

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "COGS", to: "/cogs" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Create COGS"
            : readOnly
              ? source.name || `COGS #${source.code}`
              : `Edit: ${source.name || source.code}`
        }
        subtitle={
          source ? `${source.code} · ${source.routeCode} · ${source.vehicleType}` : undefined
        }
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/cogs" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              {!readOnly && (
                <NativeSelect
                  value={d.status}
                  onChange={(v) => patch({ status: v as CogsDraft["status"] })}
                  options={["Active", "Inactive"]}
                  className="h-11"
                />
              )}
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
              {readOnly && (
                <Button asChild size="lg">
                  <Link to="/cogs/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="space-y-4">
        <Panel title="General Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Field
              label="COGS Code"
              required
              error={errors["code"]}
              className="sm:col-span-4"
              hint={readOnly ? undefined : `${d.code.length}/20`}
              info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters)."
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm font-semibold">{source?.code}</div>
              ) : (
                <Input
                  value={d.code}
                  maxLength={20}
                  placeholder="Enter COGS Code"
                  onChange={(e) => patch({ code: sanitizeCogsCode(e.target.value) })}
                  aria-invalid={!!errors["code"] || undefined}
                />
              )}
            </Field>
            <Field label="COGS Name" required error={errors["name"]} className="sm:col-span-8">
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{source?.name || "—"}</div>
              ) : (
                <Input
                  value={d.name}
                  maxLength={200}
                  placeholder="Enter COGS Name"
                  onChange={(e) => patch({ name: e.target.value })}
                  aria-invalid={!!errors["name"] || undefined}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Route & Vehicle">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Field label="Route" required error={errors["routeId"]} className="sm:col-span-8">
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">
                  {source?.routeCode} - {source?.routeName}
                </div>
              ) : (
                <SearchableSelect
                  value={d.routeId}
                  onChange={(routeId) => patch({ routeId })}
                  options={["", ...routes.map((r) => r.id)]}
                  labels={{
                    "": "Select Route",
                    ...Object.fromEntries(routes.map((r) => [r.id, `${r.code} - ${r.name}`])),
                  }}
                  invalid={!!errors["routeId"]}
                  searchPlaceholder="Search route…"
                  emptyText="No matching route"
                />
              )}
            </Field>
            {route && (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-1 pb-2 text-sm sm:col-span-4">
                <span>
                  <span className="text-muted-foreground">Distance </span>
                  {built?.calculated
                    ? `${formatNumber(built.stdKm)} km`
                    : route.outbound
                      ? "—"
                      : "Not calculated"}
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
            <Field
              label="Vehicle Type"
              required
              error={errors["vehicleType"]}
              className="sm:col-span-12"
              info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer)."
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{source?.vehicleType}</div>
              ) : (
                <VehicleTypePicker
                  value={d.vehicleType}
                  onChange={(vehicleType) =>
                    patch({
                      vehicleType,
                      mappingIds: [],
                      salaryRangeId: "",
                      fuelCostId: "",
                      excluded: [],
                      overrides: {},
                    })
                  }
                  types={vehicleTypes}
                  invalid={!!errors["vehicleType"]}
                />
              )}
            </Field>
            {!readOnly && vehicleTypes.length === 0 && (
              <p className="text-xs text-destructive sm:col-span-12">
                No active vehicle in Vehicle yet: add a truck (with Truck Type) or a header first.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Cost Detail" bodyClassName="p-0">
          {costErrors && (
            <p className="px-4 pt-3 text-xs font-medium text-destructive">{costErrors}</p>
          )}
          {!readOnly && !built ? (
            <EmptyState title="Select a route and a vehicle type to build its Cost Detail" />
          ) : (
            <>
              {/* Summary: each part, its share, and the total of one trip. */}
              <div className="grid grid-cols-2 gap-3 border-b p-4 lg:grid-cols-4">
                {(["Fixed Cost", "Variable Cost", "Other Cost"] as const).map((g) => (
                  <div key={g} className="rounded-lg border bg-card px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", ACCENT[g])} />
                      {g}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">
                      {money(groupTotal(g))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {share(groupTotal(g))} of total · {lines.filter((l) => l.group === g).length}{" "}
                      cost
                      {lines.filter((l) => l.group === g).length === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                  <div className="text-xs font-medium text-primary">Total COGS / Trip</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{money(total)} ₫</div>
                  <div className="text-xs text-muted-foreground">
                    {route
                      ? `${route.code} · ${built?.calculated ? `${formatNumber(built.stdKm)} km` : ""}`
                      : source
                        ? source.routeCode
                        : ""}
                    {(vehicle?.key ?? source?.vehicleType) &&
                      ` · ${vehicle?.key ?? source?.vehicleType}`}
                  </div>
                </div>
              </div>

              <Table className="table-fixed">
                <colgroup>
                  <col className="w-52" />
                  <col className="w-[24%]" />
                  <col />
                  <col className="w-40" />
                  {!readOnly && <col className="w-14" />}
                </colgroup>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thClass}>Fare Code / Source</TableHead>
                    <TableHead className={thClass}>Cost</TableHead>
                    <TableHead className={thClass}>How it is worked out</TableHead>
                    <TableHead className={cn(thClass, "text-right")}>Amount / Trip (₫)</TableHead>
                    {!readOnly && <TableHead className={thClass} />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionHead(
                    "Fixed Cost",
                    "per day of the vehicle ÷ Utilization Factor, from the Fixed Cost Mappings",
                    <>
                      <label
                        className="flex items-center gap-2 text-xs"
                        title="Hệ số khai thác: trips the vehicle runs per day. The fixed costs of a day are shared by them — Fixed Cost per trip = per day ÷ factor (e.g. 2 → half). 1 = one trip a day."
                      >
                        <span className="whitespace-nowrap font-medium">Utilization Factor</span>
                        {readOnly ? (
                          <b className="tabular-nums">{source?.utilizationFactor ?? 1}</b>
                        ) : (
                          <Input
                            inputMode="decimal"
                            value={d.utilizationFactor}
                            onChange={(e) =>
                              patch({
                                utilizationFactor: e.target.value
                                  .replace(/[^\d.]/g, "")
                                  .slice(0, 5),
                              })
                            }
                            className="h-8 w-16 bg-background text-right tabular-nums"
                            aria-label="Utilization Factor"
                            aria-invalid={!!errors["utilizationFactor"] || undefined}
                          />
                        )}
                        <span className="whitespace-nowrap text-muted-foreground">trip/day</span>
                      </label>
                      {addMapping(fixedRows, d.mappingIds, "mappingIds", "Fixed Cost Mapping")}
                    </>,
                    { to: "/fixed-cost", label: "Fixed Cost" },
                  )}
                  {mappingRowsOf(d.mappingIds, fixedRows, "mappingIds", "Fixed Cost Mapping")}

                  {sectionHead(
                    "Variable Cost",
                    "worked out for this route and vehicle type",
                    undefined,
                    { to: "/variable-cost", label: "Variable Cost" },
                  )}
                  {variableRowsOf()}

                  {sectionHead(
                    "Other Cost",
                    "Fare Codes added by hand",
                    !readOnly && built ? (
                      <Button variant="outline" size="sm" onClick={addOther}>
                        <Plus className="h-4 w-4" />
                        Add Cost
                      </Button>
                    ) : undefined,
                  )}
                  {readOnly ? (
                    lines.some((l) => l.group === "Other Cost") ? (
                      lines
                        .filter((l) => l.group === "Other Cost")
                        .map((l) => (
                          <TableRow key={l.key}>
                            <TableCell className="border-r py-2 align-top">
                              <div className="font-semibold text-primary">{l.code}</div>
                            </TableCell>
                            {costCells(l)}
                          </TableRow>
                        ))
                    ) : (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={cols}
                          className="py-3 text-center text-xs text-muted-foreground"
                        >
                          No other cost.
                        </TableCell>
                      </TableRow>
                    )
                  ) : d.others.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={cols}
                        className="py-3 text-center text-xs text-muted-foreground"
                      >
                        No other cost — use Add Cost and type its Fare Code.
                      </TableCell>
                    </TableRow>
                  ) : (
                    d.others.map((o) => {
                      const c = costs.find((x) => x.id === o.costId);
                      const text = codeText[o.rid] ?? c?.code ?? "";
                      return (
                        <TableRow key={o.rid}>
                          <TableCell className="border-r py-1.5 align-top">
                            <Input
                              autoFocus={!text}
                              list="cogs-fare-codes"
                              value={text}
                              placeholder="Fare Code"
                              aria-label="Fare Code"
                              aria-invalid={(!!text && !c) || undefined}
                              onChange={(e) => typeCode(o.rid, e.target.value)}
                              onKeyDown={onOtherEnter}
                              className="h-8 font-semibold uppercase"
                            />
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            {c ? (
                              <span className="truncate" title={c.name}>
                                {c.name}
                              </span>
                            ) : text ? (
                              <span className="text-xs text-destructive">Fare Code not found</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Type a Fare Code
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 align-top text-xs text-muted-foreground">
                            Entered by hand{c?.group ? ` · ${c.group}` : ""}
                          </TableCell>
                          <TableCell className={cn("py-1.5 align-top", num)}>
                            <Input
                              inputMode="numeric"
                              placeholder="0"
                              value={o.amount ? String(o.amount) : ""}
                              onChange={(e) => setOther(o.rid, { amount: digits(e.target.value) })}
                              onKeyDown={onOtherEnter}
                              className="ml-auto h-8 w-32 text-right tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="py-1.5 text-center align-top">
                            <RemoveButton
                              onClick={() =>
                                patch({ others: d.others.filter((x) => x.rid !== o.rid) })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}

                  <TableRow className="border-t-2 bg-primary/10 hover:bg-primary/10">
                    <TableCell colSpan={3} className="py-3 font-semibold">
                      Total COGS / Trip
                    </TableCell>
                    <TableCell className={cn("py-3 text-base font-bold", num)}>
                      {money(total)}
                    </TableCell>
                    {!readOnly && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
          <datalist id="cogs-fare-codes">
            {costs.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </datalist>
          {!readOnly && removed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">Removed from this COGS:</span>
              {removed.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => restoreAuto(l.key)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-accent"
                  title="Add back"
                >
                  <Plus className="h-3 w-3" />
                  {l.code ? `${l.code} · ` : ""}
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Remark">
          {readOnly ? (
            <p className="text-sm">
              {source?.remark || <span className="text-muted-foreground">—</span>}
            </p>
          ) : (
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Enter Remark"
              value={d.remark}
              onChange={(e) => patch({ remark: e.target.value })}
            />
          )}
        </Panel>
      </div>

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="COGS"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove cost"
      title="Remove"
      className="text-destructive hover:opacity-70"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
