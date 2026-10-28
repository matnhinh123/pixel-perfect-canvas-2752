// Create / view / edit a COGS: Code + Name, a route, a vehicle type (from Master Data > Vehicle), the
// Fixed Cost Mappings picked (their fixed costs, shared by the trips of a day) and the Variable Cost of
// the Variable Cost Mapping of the route × vehicle type (Salary Range, Fuel Cost, Toll Fee, each with its
// Fare Code). Lines can be edited or removed; other Fare Codes can be added. View shows them as saved.
import { Fragment, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/movex/general/MoneyInput";
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
  InlineFields,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
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
  variableCostMappingRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { buildCogs, fixedCostPerDay, mappingsFor } from "@/services/cost/cogsBuild";
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
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CogsLine, CogsLineGroup, CogsRecord, VariableComponent } from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
let seq = 0;
/** A part of the COGS: Fixed Cost, each variable cost (Trip Salary, Fuel Cost, Toll Fee), Other Cost. */
type Section = CogsLineGroup | VariableComponent;
/** Colour mark of each part of the COGS. */
const ACCENT: Record<Section, string> = {
  "Fixed Cost": "bg-primary",
  "Variable Cost": "bg-warning",
  "Trip Salary": "bg-warning",
  "Fuel Cost": "bg-success",
  "Toll Fee": "bg-destructive/70",
  "Other Cost": "bg-muted-foreground",
};
/** The variable cost of a line (older lines: by its name). */
const componentOf = (l: CogsLine): VariableComponent =>
  l.component ??
  (l.name === "Fuel Cost" ? "Fuel Cost" : l.name === "Toll Fee" ? "Toll Fee" : "Trip Salary");
/** Is a line in a part? ("Variable Cost" = the three variable costs together.) */
const inSection = (l: CogsLine, s: Section) =>
  l.group === s || (l.group === "Variable Cost" && componentOf(l) === s);
/** What the code column holds in each part. */
const CODE_HEAD: Partial<Record<Section, string>> = {
  "Trip Salary": "Salary Range Code",
  "Fuel Cost": "Fuel Cost Code",
  "Toll Fee": "Toll Station",
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
  const variableMappings = useCollection(variableCostMappingRepository);
  const tollMasters = useMemo(() => tollAll.filter((t) => !t.deleted), [tollAll]);
  const routes = useMemo(
    () => routesAll.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [routesAll],
  );
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const vehicleTypes = useVehicleTypes();
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
  // Route: typed by its code or its name; one found fills the other.
  const [routeText, setRouteText] = useState({ code: route?.code ?? "", name: route?.name ?? "" });
  const typeRoute = (field: "code" | "name", v: string) => {
    const m = routes.find((r) => r[field].trim().toLowerCase() === v.trim().toLowerCase());
    if ((m?.id ?? "") !== d.routeId) patch({ routeId: m?.id ?? "" });
    setRouteText(m ? { code: m.code, name: m.name } : { code: "", name: "", [field]: v });
  };
  const routeMiss = (text: string) =>
    text.trim() && !d.routeId ? "Not found in Route Management." : undefined;
  const vehicle = vehicleTypes.find((t) => t.key === d.vehicleType);
  /** Fixed Cost: every Fixed Cost Mapping of the vehicle type (set up in Fixed Cost). */
  const autoMappingIds = useMemo(
    () => (vehicle ? mappingsFor(mappings, vehicle).map((m) => m.id) : []),
    [vehicle, mappings],
  );
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
          mappingIds: autoMappingIds,
          variableMappings,
          utilizationFactor: factorOf(d),
          costs,
          excluded: d.excluded,
          overrides: d.overrides,
          others: d.others,
        })
      : null;

  // View: the costs as saved. Create / Edit: rebuilt from the current setup.
  const lines: CogsLine[] = readOnly && source ? source.lines : (built?.lines ?? []);
  const total = readOnly && source ? source.total : (built?.total ?? 0);
  const costErrors = errors["utilizationFactor"] ?? errors["others"] ?? errors["overrides"];

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
  const groupTotal = (g: Section) => sum(lines.filter((l) => inSection(l, g)));
  const share = (n: number) => (total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : "—");
  const cols = readOnly ? 6 : 7;

  /** Section title row: name, what it holds, the way to add more. */
  const sectionHead = (
    g: Section,
    detail: string,
    add?: ReactNode,
    link?: { to: "/fixed-cost" | "/variable-cost"; label: string },
  ) => (
    <TableRow key={`h:${g}`} className="border-t-2 bg-muted/50 hover:bg-muted/50">
      <TableCell colSpan={cols} className="py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={cn("h-4 w-1 rounded-full", ACCENT[g])} />
          <span className="text-sm font-semibold">{g}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
          {link && (
            <Link to={link.to} className="text-xs text-primary hover:underline">
              Open {link.label}
            </Link>
          )}
          {add && <span className="ml-auto flex items-center gap-3">{add}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
  /** Total row under a part: what goes with the total (Utilization Factor), share and amount. */
  const sectionFoot = (g: Section, extra?: ReactNode) => (
    <TableRow key={`t:${g}`} className="border-y bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={5} className="py-2">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {extra}
          <span className="text-sm font-semibold">Total {g}</span>
          <span className="rounded bg-background px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {share(groupTotal(g))}
          </span>
        </div>
      </TableCell>
      <TableCell className={cn("py-2 text-sm font-bold", num)}>{money(groupTotal(g))}</TableCell>
      {!readOnly && <TableCell />}
    </TableRow>
  );

  /** Column header of a part: what each column holds. */
  const colHead = (g: Section) => (
    <TableRow key={`c:${g}`} className="border-y bg-muted/20 hover:bg-muted/20">
      {["Fare Code", "Fare Name", CODE_HEAD[g] ?? "Internal Cost", "Cost", "Remark"].map((h) => (
        <TableCell
          key={h}
          className="py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {h}
        </TableCell>
      ))}
      <TableCell className="py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Amount / Trip (₫)
      </TableCell>
      {!readOnly && (
        <TableCell className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Actions
        </TableCell>
      )}
    </TableRow>
  );
  /** Remark of a cost line: typed in edit, shown in view. */
  const remarkCell = (key: string) => (
    <TableCell className="py-1.5 align-top">
      {readOnly ? (
        <span className="text-sm">
          {(source?.remarks ?? {})[key] || <span className="text-muted-foreground">—</span>}
        </span>
      ) : (
        <Input
          value={d.remarks[key] ?? ""}
          maxLength={200}
          placeholder="Add remark"
          onChange={(e) => patch({ remarks: { ...d.remarks, [key]: e.target.value } })}
          className="h-8"
          aria-label="Remark"
        />
      )}
    </TableCell>
  );
  /** Where a cost is read from: the kind of setup and its code (not a Fare Code). */
  const sourceOf = (l: CogsLine): [string, string] | null => {
    // The kind of setup a variable cost code belongs to (shown under the code).
    if (l.group !== "Variable Cost" || !l.code) return null;
    const c = componentOf(l);
    if (c === "Fuel Cost") return ["Fuel Cost", l.code];
    if (c === "Toll Fee") return [l.name === "Toll Fee" ? "Route" : "Toll Station", l.code];
    return ["Salary Range", l.code];
  };

  const amountCell = (l: CogsLine) =>
    readOnly ? (
      money(l.amount)
    ) : editing === l.key ? (
      <MoneyInput
        autoFocus
        value={l.amount}
        onChange={(v) => editAuto(l, Number.isFinite(v) ? v : 0)}
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

  /** Fare Code and Fare Name cells spanning the costs they book. */
  const fareCells = (code: string | undefined, name: string | undefined, span: number) => (
    <>
      <TableCell rowSpan={span} className="bg-card py-2 align-top font-semibold text-primary">
        {code || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell rowSpan={span} className="border-r bg-card py-2 align-top">
        <div className="truncate" title={name}>
          {name || <span className="text-muted-foreground">—</span>}
        </div>
      </TableCell>
    </>
  );
  /** Fare Code cells of a Fixed Cost Mapping. */
  const fareCell = (id: string, span: number) => {
    const fare = fareOfMapping(id);
    return fareCells(fare?.code, fare?.name, span);
  };

  /** One cost: its code and name, how it is worked out, and the amount. */
  const costCells = (l: CogsLine) => (
    <>
      <TableCell className="py-2 align-top font-mono text-xs">
        {l.group !== "Other Cost" && l.code ? (
          <>
            <div>{l.code}</div>
            {sourceOf(l) && (
              <div className="font-sans text-[11px] text-muted-foreground">{sourceOf(l)![0]}</div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 align-top">
        <div className="truncate font-medium" title={`${l.name}: ${l.basis}`}>
          {l.name}
        </div>
      </TableCell>
      {remarkCell(l.key)}
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
          <RemoveButton onClick={() => removeAuto(l.key)} />
        </TableCell>
      )}
    </>
  );

  /** Picked mappings of a section: the Fare Code spans the costs it books. */
  const mappingRowsOf = (picked: string[], rows: MappingRow[], label: string) => {
    if (!picked.some((id) => lines.some((l) => l.mappingId === id)))
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={cols} className="py-3 text-center text-xs text-muted-foreground">
            {readOnly
              ? `No ${label}.`
              : picked.length
                ? "Every fixed cost was removed from this COGS — add them back below the table."
                : `No ${label} for ${vehicle?.key ?? "this vehicle type"} yet — set it up in Fixed Cost.`}
          </TableCell>
        </TableRow>
      );
    return picked.map((id) => {
      const items = lines.filter((l) => l.mappingId === id);
      // Every cost of it removed: the Fare Code goes too (it can be added back below the table).
      if (!items.length) return null;
      return items.map((l, k) => (
        <TableRow key={l.key} className={cn("group", k === 0 && "border-t")}>
          {k === 0 && fareCell(id, items.length)}
          {costCells(l)}
        </TableRow>
      ));
    });
  };

  // A variable cost (Trip Salary, Fuel Cost, Toll Fee — a line per toll station): its lines, under the
  // Fare Code of its Variable Cost Mapping.
  const variableRowsOf = (c: VariableComponent) => {
    const vLines = lines.filter((l) => inSection(l, c));
    // One group per Fare Code (Variable Cost Mapping), in the order of the costs; none = "—".
    const fares = [...new Set(vLines.map((l) => l.fareCode ?? ""))];
    const rows = fares.flatMap((code) => {
      const items = vLines.filter((l) => (l.fareCode ?? "") === code);
      const fare = costsAll.find((c) => c.code === code && !c.deleted);
      return items.map((l, k) => (
        <TableRow key={l.key} className={cn("group", k === 0 && "border-t")}>
          {k === 0 && fareCells(code, fare?.name, items.length)}
          {costCells(l)}
        </TableRow>
      ));
    });
    return rows.length ? (
      rows
    ) : (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={cols} className="py-3 text-center text-xs text-muted-foreground">
          No {c}.
        </TableCell>
      </TableRow>
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

  /** A value shown in view. */
  const text = (v: ReactNode) => <div className="flex h-10 items-center text-sm">{v || "—"}</div>;
  /** A field that cannot be changed any more: the box, greyed out. */
  const locked = (v: string | undefined) => (
    <Input value={v ?? ""} disabled readOnly className="bg-muted text-muted-foreground" />
  );

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
          <InlineFields labelWidth="7.5rem">
            <div className="grid grid-cols-1 justify-start gap-x-12 gap-y-3 sm:grid-cols-[19rem_30rem]">
              <Field
                label="COGS Code"
                required
                error={errors["code"]}
                info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters). Automatic COGS: route code + vehicle type."
              >
                {readOnly ? (
                  text(<b>{source?.code}</b>)
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
              <Field label="COGS Name" required error={errors["name"]}>
                {readOnly ? (
                  text(source?.name)
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
              <Field
                label="Route Code"
                required
                error={errors["routeId"] || routeMiss(routeText.code)}
                info={
                  isNew
                    ? "Type the code or the name: the other one is filled in."
                    : "Fixed once the COGS is created: its costs are worked out from the route."
                }
              >
                {readOnly ? (
                  text(<b>{source?.routeCode}</b>)
                ) : !isNew ? (
                  locked(source?.routeCode)
                ) : (
                  <SuggestInput
                    value={routeText.code}
                    onChange={(v) => typeRoute("code", v)}
                    suggestions={routes.map((r) => r.code)}
                    hint={(code) => routes.find((r) => r.code === code)?.name ?? ""}
                    placeholder="Enter Route Code"
                    invalid={!!errors["routeId"] || !!routeMiss(routeText.code)}
                    upper
                    emptyText="No matching Route Code"
                  />
                )}
              </Field>
              <Field label="Route Name" required error={routeMiss(routeText.name)}>
                {readOnly ? (
                  text(source?.routeName)
                ) : !isNew ? (
                  locked(source?.routeName)
                ) : (
                  <SuggestInput
                    value={routeText.name}
                    onChange={(v) => typeRoute("name", v)}
                    suggestions={routes.map((r) => r.name)}
                    hint={(name) => routes.find((r) => r.name === name)?.code ?? ""}
                    placeholder="Enter Route Name"
                    invalid={!!errors["routeId"] || !!routeMiss(routeText.name)}
                    emptyText="No matching Route Name"
                  />
                )}
              </Field>
              <Field
                label="Vehicle Type"
                required
                error={errors["vehicleType"]}
                className={isNew ? "sm:col-span-2" : undefined}
                info={
                  isNew
                    ? "From Master Data › Vehicle: Truck → Truck Type, or Header → Container Type, then Brand."
                    : "Fixed once the COGS is created: its costs are worked out from the vehicle type."
                }
              >
                {readOnly ? (
                  text(source?.vehicleType)
                ) : !isNew ? (
                  locked(source?.vehicleType)
                ) : (
                  <VehicleTypePicker
                    value={d.vehicleType}
                    onChange={(vehicleType) =>
                      patch({
                        vehicleType,
                        mappingIds: [],
                        excluded: [],
                        overrides: {},
                      })
                    }
                    types={vehicleTypes}
                    invalid={!!errors["vehicleType"]}
                  />
                )}
              </Field>
              {route && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">Distance </span>
                    {built?.calculated
                      ? `${formatNumber(built.stdKm)} km`
                      : route.outbound
                        ? "—"
                        : "Not calculated"}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Terrain </span>
                    {route.terrain ?? "Plain"}
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
              {!readOnly && vehicleTypes.length === 0 && (
                <p className="text-xs text-destructive sm:col-span-2">
                  No active vehicle in Vehicle yet: add a truck (with Truck Type) or a header first.
                </p>
              )}
            </div>
          </InlineFields>
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

              <Table className="table-fixed [&_td+td]:border-l">
                <colgroup>
                  <col className="w-28" />
                  <col className="w-44" />
                  <col className="w-40" />
                  <col className="w-[18%]" />
                  <col />
                  <col className="w-36" />
                  {!readOnly && <col className="w-20" />}
                </colgroup>
                <TableBody>
                  {sectionHead(
                    "Fixed Cost",
                    "loaded from the Fixed Cost Mappings of the vehicle type · per day ÷ Utilization Factor",
                    undefined,
                    { to: "/fixed-cost", label: "Fixed Cost" },
                  )}
                  {colHead("Fixed Cost")}
                  {mappingRowsOf(
                    readOnly && source ? (source.mappingIds ?? []) : autoMappingIds,
                    fixedRows,
                    "Fixed Cost Mapping",
                  )}
                  {sectionFoot(
                    "Fixed Cost",
                    <>
                      <label
                        className="flex items-center gap-2 text-xs"
                        title="Trips the vehicle runs per day. The fixed costs of a day are shared by them — Fixed Cost per trip = per day ÷ factor (e.g. 2 → half). 1 = one trip a day."
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
                    </>,
                  )}

                  {(
                    [
                      [
                        "Trip Salary",
                        "from the Salary Range of the vehicle type, by the route's distance",
                      ],
                      ["Fuel Cost", "average Fuel Rate of the vehicles × distance × Fuel Price"],
                      [
                        "Toll Fee",
                        "every Toll Station of the route, at the fee of the vehicle's toll group",
                      ],
                    ] as const
                  ).map(([c, detail]) => (
                    <Fragment key={c}>
                      {sectionHead(c, detail, undefined, {
                        to: "/variable-cost",
                        label: "Variable Cost",
                      })}
                      {colHead(c)}
                      {variableRowsOf(c)}
                      {sectionFoot(c)}
                    </Fragment>
                  ))}

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
                  {colHead("Other Cost")}
                  {readOnly ? (
                    lines.some((l) => l.group === "Other Cost") ? (
                      lines
                        .filter((l) => l.group === "Other Cost")
                        .map((l) => (
                          <TableRow key={l.key} className="border-t">
                            {fareCells(l.code, l.name, 1)}
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
                        <TableRow key={o.rid} className="border-t">
                          <TableCell className="py-1.5 align-top">
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
                          <TableCell className="border-r py-2 align-top">
                            {c ? (
                              <div className="truncate" title={c.name}>
                                {c.name}
                              </div>
                            ) : text ? (
                              <span className="text-xs text-destructive">Fare Code not found</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Type a Fare Code
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <span className="text-muted-foreground">—</span>
                          </TableCell>
                          <TableCell className="py-2 align-top">
                            <div className="truncate font-medium" title={c?.name}>
                              {c?.name ?? "—"}
                            </div>
                          </TableCell>
                          {remarkCell(`O:${o.rid}`)}
                          <TableCell className={cn("py-1.5 align-top", num)}>
                            <MoneyInput
                              emptyZero
                              value={o.amount}
                              onChange={(v) =>
                                setOther(o.rid, { amount: Number.isFinite(v) ? v : 0 })
                              }
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

                  {sectionFoot("Other Cost")}
                  <TableRow className="border-t-2 bg-primary/10 hover:bg-primary/10">
                    <TableCell colSpan={5} className="py-3 font-semibold">
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
                  {l.mappingId && `${fareOfMapping(l.mappingId)?.code ?? ""} · `}
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
