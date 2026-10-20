// Create / view / edit a COGS: a route, a vehicle type and the costs set up elsewhere that make up the
// cost of one trip. View shows the costs as saved; Create / Edit rebuild them from the current setup.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { costItemRepository, fixedCostRepository, routeRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { buildCogs } from "@/services/cost/cogsBuild";
import {
  cogsService,
  draftOfCogs,
  newCogsDraft,
  type CogsDraft,
} from "@/services/cost/cogsService";
import { ALL_VEHICLE_TYPES, useSalaryRanges } from "@/services/cost/salaryRange";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CogsLine, CogsLineGroup, CogsRecord } from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const GROUPS: CogsLineGroup[] = ["Fixed Cost", "Variable Cost", "Other Cost"];
let seq = 0;

export function CogsForm({ source, readOnly }: { source: CogsRecord | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const isNew = !source;
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
  const built = route
    ? buildCogs({
        route,
        vehicleType: d.vehicleType,
        tiers: salary.current.tables[d.vehicleType] ?? [],
        fixedCosts: fixedAll,
        costs,
        excluded: d.excluded,
        others: d.others,
      })
    : null;
  const toggle = (key: string, on: boolean) =>
    patch({ excluded: on ? d.excluded.filter((k) => k !== key) : [...d.excluded, key] });
  const setOther = (rid: string, p: Partial<CogsDraft["others"][number]>) =>
    patch({ others: d.others.map((o) => (o.rid === rid ? { ...o, ...p } : o)) });

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
              className="sm:col-span-3"
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{source?.vehicleType}</div>
              ) : (
                <NativeSelect
                  value={d.vehicleType}
                  onChange={(vehicleType) => patch({ vehicleType })}
                  options={ALL_VEHICLE_TYPES}
                  className="w-full"
                />
              )}
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
                  {built?.variable.calculated
                    ? `${formatNumber(built.variable.distanceKm)} km`
                    : "—"}
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
        </Panel>

        {!readOnly && built && (
          <Panel title="Costs" bodyClassName="p-0">
            <CostChecklist
              title="Fixed Cost"
              hint={`Fixed Costs that apply to ${d.vehicleType}, allocated per trip`}
              lines={built.fixedLines}
              excluded={d.excluded}
              onToggle={toggle}
              empty="No active Fixed Cost applies to this vehicle type."
            />
            <CostChecklist
              title="Variable Cost"
              hint="From the Variable Cost setup and the route"
              lines={built.variableLines}
              excluded={d.excluded}
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
                    patch({
                      others: [
                        ...d.others,
                        { rid: `o${Date.now()}${++seq}`, costId: "", amount: 0 },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Cost
                </Button>
              </div>
              {errors["others"] && (
                <p className="mb-2 text-xs font-medium text-destructive">{errors["others"]}</p>
              )}
              {d.others.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other cost.</p>
              ) : (
                <div className="space-y-2">
                  {d.others.map((o) => (
                    <div key={o.rid} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          value={o.costId}
                          onChange={(costId) => setOther(o.rid, { costId })}
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
                        value={o.amount ? String(o.amount) : ""}
                        onChange={(e) =>
                          setOther(o.rid, {
                            amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                          })
                        }
                        className="w-40 text-right tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label="Remove cost"
                        className="text-destructive hover:opacity-70"
                        onClick={() => patch({ others: d.others.filter((x) => x.rid !== o.rid) })}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}

        <Panel
          title={route || source ? "COGS / Trip" : "COGS"}
          bodyClassName="p-0"
          actions={
            readOnly && source ? (
              <span className="text-xs text-muted-foreground">
                As saved {formatDateTime(source.updatedAt)} · {source.updatedBy}
              </span>
            ) : undefined
          }
        >
          {lines.length === 0 ? (
            <EmptyState
              title={route || source ? "No cost selected" : "Select a route to build its COGS"}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={thClass}>Group</TableHead>
                  <TableHead className={thClass}>Cost Code</TableHead>
                  <TableHead className={thClass}>Cost Name</TableHead>
                  <TableHead className={thClass}>Basis</TableHead>
                  <TableHead className={cn(thClass, "text-right")}>Amount / Trip (₫)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
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
                    <TableCell className={cn("py-2", num)}>{money(l.amount)}</TableCell>
                  </TableRow>
                ))}
                {GROUPS.map((g) => (
                  <TableRow key={g} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={4} className="py-1.5 text-sm text-muted-foreground">
                      Subtotal {g}
                    </TableCell>
                    <TableCell className={cn("py-1.5", num)}>
                      {money(lines.filter((l) => l.group === g).reduce((s, l) => s + l.amount, 0))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-accent hover:bg-accent">
                  <TableCell colSpan={4} className="py-2.5 font-semibold">
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
        <div className="sticky bottom-0 z-20 -mx-8 mt-6 flex items-center justify-end gap-2 border-t bg-card/95 px-8 py-3 backdrop-blur">
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

function CostChecklist({
  title,
  hint,
  lines,
  excluded,
  onToggle,
  empty,
}: {
  title: string;
  hint: string;
  lines: CogsLine[];
  excluded: string[];
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
                checked={!excluded.includes(l.key)}
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
