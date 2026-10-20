// Create / view / edit a COGS: a route, a vehicle type (from Master Data > Vehicle) and the costs that
// make up the cost of one trip. Fixed / Variable costs are filled in from their setup and can be
// edited or removed; other Cost Details can be added. View shows the costs as saved.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  routeRepository,
  tollStationRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { buildCogs } from "@/services/cost/cogsBuild";
import { cogsVehicleTypes } from "@/services/cost/cogsVehicle";
import {
  cogsService,
  draftOfCogs,
  newCogsDraft,
  type CogsDraft,
} from "@/services/cost/cogsService";
import { useFuelSetup, useSalaryRanges } from "@/services/cost/salaryRange";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CogsLine, CogsLineGroup, CogsRecord } from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const GROUPS: CogsLineGroup[] = ["Fixed Cost", "Variable Cost", "Other Cost"];
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
let seq = 0;

export function CogsForm({ source, readOnly }: { source: CogsRecord | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const isNew = !source;
  const routesAll = useCollection(routeRepository);
  const fixedAll = useCollection(fixedCostRepository);
  const costsAll = useCollection(costItemRepository);
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const salary = useSalaryRanges();
  const fuel = useFuelSetup();
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
          tables: salary.current.tables,
          fuel,
          tollMasters,
          fixedCosts: fixedAll,
          costs,
          excluded: d.excluded,
          overrides: d.overrides,
          others: d.others,
        })
      : null;

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

  // View: the costs as saved. Create / Edit: rebuilt from the current setup.
  const lines: CogsLine[] = readOnly && source ? source.lines : (built?.lines ?? []);
  const total = readOnly && source ? source.total : (built?.total ?? 0);
  const removed = built ? built.autoLines.filter((l) => d.excluded.includes(l.key)) : [];
  const typeOptions = [
    "",
    ...vehicleTypes.map((t) => t.key),
    ...(d.vehicleType && !vehicle ? [d.vehicleType] : []),
  ];

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "COGS", to: "/cogs" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew ? "Create COGS" : readOnly ? `COGS #${source.code}` : `Edit COGS #${source.code}`
        }
        subtitle={source ? `${source.routeCode} · ${source.vehicleType}` : undefined}
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
        <Panel title="Route & Vehicle">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Field label="Route" required error={errors["routeId"]} className="sm:col-span-5">
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
            <Field
              label="Vehicle Type"
              required
              error={errors["vehicleType"]}
              className="sm:col-span-4"
              info="From Master Data > Vehicle: Truck by Truck Type, Header by trailer size."
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{source?.vehicleType}</div>
              ) : (
                <NativeSelect
                  value={d.vehicleType}
                  onChange={(vehicleType) => patch({ vehicleType, excluded: [], overrides: {} })}
                  options={typeOptions}
                  labels={{
                    "": "Select Vehicle Type",
                    ...Object.fromEntries(
                      vehicleTypes.map((t) => [
                        t.key,
                        `${t.key} (${t.vehicleCount} vehicle${t.vehicleCount === 1 ? "" : "s"})`,
                      ]),
                    ),
                  }}
                  invalid={!!errors["vehicleType"]}
                  className="w-full"
                />
              )}
            </Field>
            {route && (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-1 text-sm sm:col-span-3">
                <span>
                  <span className="text-muted-foreground">Distance </span>
                  {built?.variable.calculated
                    ? `${formatNumber(built.variable.stdKm)} km`
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
            {!readOnly && vehicle && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs sm:col-span-12">
                <span>
                  <span className="text-muted-foreground">Vehicle Group </span>Group {vehicle.group}
                </span>
                <span>
                  <span className="text-muted-foreground">Fuel Rate </span>
                  {vehicle.fuelNorm
                    ? `${vehicle.fuelNorm} l/100km (average of the vehicles)`
                    : `${fuel.norms[vehicle.salaryTable] ?? 0} l/100km (Fuel Cost setup)`}
                </span>
                <span>
                  <span className="text-muted-foreground">Salary Range </span>
                  {vehicle.salaryTable}
                </span>
                <span>
                  <span className="text-muted-foreground">Fixed Cost for </span>
                  {vehicle.kind === "TRUCK"
                    ? `TRUCK · ${vehicle.spec}`
                    : `HEADER, TRAILER · ${vehicle.spec}`}
                </span>
                <Link to="/vehicle" className="text-primary hover:underline">
                  Open Vehicle
                </Link>
              </div>
            )}
            {!readOnly && vehicleTypes.length === 0 && (
              <p className="text-xs text-destructive sm:col-span-12">
                No active vehicle in Vehicle yet: add a truck (with Truck Type) or a header first.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title={route || source ? "COGS / Trip" : "COGS"}
          bodyClassName="p-0"
          actions={
            readOnly && source ? (
              <span className="text-xs text-muted-foreground">
                As saved {formatDateTime(source.updatedAt)} · {source.updatedBy}
              </span>
            ) : built ? (
              <Button variant="outline" size="sm" onClick={addOther}>
                <Plus className="h-4 w-4" />
                Add Cost
              </Button>
            ) : undefined
          }
        >
          {(errors["others"] || errors["overrides"]) && (
            <p className="px-4 pt-3 text-xs font-medium text-destructive">
              {errors["others"] ?? errors["overrides"]}
            </p>
          )}
          {!readOnly && !built ? (
            <EmptyState title="Select a route and a vehicle type to build its COGS" />
          ) : lines.length === 0 && d.others.length === 0 ? (
            <EmptyState title="No cost in this COGS" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thClass, "w-32")}>Group</TableHead>
                  <TableHead className={cn(thClass, "w-28")}>Cost Code</TableHead>
                  <TableHead className={thClass}>Cost Name</TableHead>
                  <TableHead className={thClass}>Basis</TableHead>
                  <TableHead className={cn(thClass, "w-44 text-right")}>
                    Amount / Trip (₫)
                  </TableHead>
                  {!readOnly && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines
                  .filter((l) => readOnly || l.group !== "Other Cost")
                  .map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="py-2 text-muted-foreground">{l.group}</TableCell>
                      <TableCell className="py-2 font-semibold text-primary">{l.code}</TableCell>
                      <TableCell className="py-2">{l.name}</TableCell>
                      <TableCell
                        className="max-w-md truncate py-2 text-xs text-muted-foreground"
                        title={l.basis}
                      >
                        {l.basis}
                      </TableCell>
                      <TableCell className={cn("py-1.5", num)}>
                        {readOnly ? (
                          money(l.amount)
                        ) : (
                          <Input
                            inputMode="numeric"
                            value={String(l.amount)}
                            onChange={(e) => editAuto(l, digits(e.target.value))}
                            className="ml-auto h-8 w-36 text-right tabular-nums"
                          />
                        )}
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
                        <TableCell className="py-1.5">
                          <RemoveButton onClick={() => removeAuto(l.key)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                {!readOnly &&
                  d.others.map((o) => {
                    const c = costs.find((x) => x.id === o.costId);
                    return (
                      <TableRow key={o.rid}>
                        <TableCell className="py-2 text-muted-foreground">Other Cost</TableCell>
                        <TableCell className="py-2 font-semibold text-primary">
                          {c?.code ?? "—"}
                        </TableCell>
                        <TableCell className="py-1.5" colSpan={2}>
                          <SearchableSelect
                            value={o.costId}
                            onChange={(costId) => setOther(o.rid, { costId })}
                            options={["", ...costs.map((x) => x.id)]}
                            labels={{
                              "": "Select Fare Code",
                              ...Object.fromEntries(
                                costs.map((x) => [x.id, `${x.code} - ${x.name}`]),
                              ),
                            }}
                            searchPlaceholder="Search cost…"
                            emptyText="No matching cost"
                          />
                        </TableCell>
                        <TableCell className={cn("py-1.5", num)}>
                          <Input
                            inputMode="numeric"
                            placeholder="0"
                            value={o.amount ? String(o.amount) : ""}
                            onChange={(e) => setOther(o.rid, { amount: digits(e.target.value) })}
                            className="ml-auto h-8 w-36 text-right tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <RemoveButton
                            onClick={() =>
                              patch({ others: d.others.filter((x) => x.rid !== o.rid) })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {GROUPS.map((g) => (
                  <TableRow key={g} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={4} className="py-1.5 text-sm text-muted-foreground">
                      Subtotal {g}
                    </TableCell>
                    <TableCell className={cn("py-1.5", num)}>
                      {money(lines.filter((l) => l.group === g).reduce((s, l) => s + l.amount, 0))}
                    </TableCell>
                    {!readOnly && <TableCell />}
                  </TableRow>
                ))}
                <TableRow className="bg-accent hover:bg-accent">
                  <TableCell colSpan={4} className="py-2.5 font-semibold">
                    Total COGS / Trip
                  </TableCell>
                  <TableCell className={cn("py-2.5 text-base font-bold", num)}>
                    {money(total)}
                  </TableCell>
                  {!readOnly && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          )}
          {!readOnly && removed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">Removed:</span>
              {removed.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => restoreAuto(l.key)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-accent"
                  title="Add back"
                >
                  <Plus className="h-3 w-3" />
                  {l.code} · {l.name}
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

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-6 mt-6 flex items-center justify-end gap-2 border-t bg-card/95 px-6 py-3 backdrop-blur">
          <Button variant="outline" size="lg" onClick={back}>
            Cancel
          </Button>
          <Button size="lg" onClick={save}>
            Save
          </Button>
        </div>
      )}
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
