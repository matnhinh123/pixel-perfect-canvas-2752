// Variable Cost Mapping page (create / view / edit): the Fare Code, the route and the vehicle type, then
// every variable cost of the trip loaded — Trip Salary and Road Support Fee from the vehicle type's
// Salary Range, Fuel Cost from its Fuel Cost, Toll Fee from the route's Toll Stations at its vehicle
// group — all booked to that Fare Code (Fixed Cost Fare Codes are not offered).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, Panel, StatusBadge, thClass } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useTripSetups } from "@/components/movex/cost/useTripSetups";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fixedCostSummaryRepository,
  routeRepository,
  variableCostMappingRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { setupTypes, setupsFor, tripVariable } from "@/services/cost/cogsBuild";
import { routeTotals } from "@/services/cost/costMath";
import { routeTollStations } from "@/services/cost/salaryRange";
import {
  variableCostMappingService,
  type VariableCostMappingDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  VARIABLE_COMPONENTS,
  type VariableComponent,
  type VariableCostMappingRecord,
} from "@/types";

const money = (n: number) => formatNumber(Math.round(n));
const READ_FROM: Record<VariableComponent, "Salary Range" | "Fuel Cost" | "Toll Station"> = {
  "Trip Salary": "Salary Range",
  "Road Support Fee": "Salary Range",
  "Fuel Cost": "Fuel Cost",
  "Toll Fee": "Toll Station",
};

export function VariableMappingForm({
  source,
  readOnly,
}: {
  source: VariableCostMappingRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const all = useCollection(variableCostMappingRepository);
  const routesAll = useCollection(routeRepository);
  const costsAll = useCollection(costItemRepository);
  const fixedMappings = useCollection(fixedCostSummaryRepository);
  const types = useVehicleTypes();
  const setups = useTripSetups();
  const routes = useMemo(
    () =>
      routesAll
        .filter((r) => !r.deleted && (routeTotals(r).calculated || r.id === source?.routeId))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [routesAll, source],
  );
  /** Fare Code the mappings most often use: a new mapping starts from it. */
  const usualFare = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of all)
      if (!m.deleted && m.assignCostId) n.set(m.assignCostId, (n.get(m.assignCostId) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initial = useMemo<VariableCostMappingDraft>(
    () => ({
      routeId: source?.routeId ?? "",
      vehicleType: source?.vehicleType ?? "",
      salaryRangeId: source?.salaryRangeId ?? "",
      fuelCostId: source?.fuelCostId ?? "",
      assignCostId: source?.assignCostId ?? usualFare,
      remark: source?.remark ?? "",
      status: source?.status === "Inactive" ? "Inactive" : "Active",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const patch = (p: Partial<VariableCostMappingDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };

  const route = routes.find((r) => r.id === d.routeId);
  const vt = types.find((t) => t.key === d.vehicleType);
  const salaryOptions = vt ? setupsFor(setups.salaryRanges, vt.key) : [];
  const fuelOptions = vt ? setupsFor(setups.fuelCosts, vt.key) : [];
  /** Another vehicle type: its own Salary Range and Fuel Cost are loaded. */
  const pickVehicle = (vehicleType: string) =>
    patch({
      vehicleType,
      salaryRangeId: setupsFor(setups.salaryRanges, vehicleType)[0]?.id ?? "",
      fuelCostId: setupsFor(setups.fuelCosts, vehicleType)[0]?.id ?? "",
    });
  const trip =
    route && vt
      ? tripVariable(route, vt, {
          ...setups,
          salaryRangeId: d.salaryRangeId,
          fuelCostId: d.fuelCostId,
        })
      : null;
  const stations = route ? routeTollStations(route, setups.tollMasters) : [];

  // Fare Code: active and not a Fixed Cost one (typed by code or by name, as on a Fixed Cost Mapping).
  const fixed = useMemo(
    () => new Set(fixedMappings.filter((m) => !m.deleted).map((m) => m.assignCostId)),
    [fixedMappings],
  );
  const fares = useMemo(
    () => costsAll.filter((x) => !x.deleted && x.status === "Active" && !fixed.has(x.id)),
    [costsAll, fixed],
  );
  const fare = costsAll.find((x) => x.id === d.assignCostId);
  const [fareText, setFareText] = useState({ code: fare?.code ?? "", name: fare?.name ?? "" });
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeFare = (field: "code" | "name", v: string) => {
    const m = fares.find((c) => same(c[field], v));
    patch({ assignCostId: m?.id ?? "" });
    setFareText(m ? { code: m.code, name: m.name } : { code: "", name: "", [field]: v });
    setErrors((e) => ({ ...e, assignCost: "" }));
  };
  /** Typed a Fixed Cost Fare Code, or one that does not exist. */
  const fareMiss = (field: "code" | "name", text: string) => {
    if (!text.trim() || d.assignCostId) return undefined;
    const taken = costsAll.find((c) => !c.deleted && same(c[field], text) && fixed.has(c.id));
    return taken
      ? `${taken.code} is a Fixed Cost Fare Code.`
      : "Not found in Fare Code Management.";
  };

  const back = () =>
    source
      ? void navigate({
          to: "/variable-cost-mapping/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/variable-cost", search: { tab: "mapping" } });
  const save = () => {
    setFormError(null);
    try {
      const rec = variableCostMappingService.save(d, source?.id);
      guard.allowNext();
      toast.success(`${route?.code ?? "Mapping"} · ${d.vehicleType} ${isNew ? "added" : "saved"}`);
      void navigate({
        to: "/variable-cost-mapping/$id",
        params: { id: rec.id },
        search: { mode: "view" },
      });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const readFrom = (c: VariableComponent) => {
    if (READ_FROM[c] === "Toll Station") return <span>{route?.code ?? "—"}</span>;
    const salary = READ_FROM[c] === "Salary Range";
    const options = salary ? salaryOptions : fuelOptions;
    const value = salary ? d.salaryRangeId : d.fuelCostId;
    const picked = options.find((o) => o.id === value);
    if (readOnly) return <span className="font-medium">{picked?.code ?? "—"}</span>;
    if (!options.length)
      return (
        <span className="text-xs text-warning">
          No {READ_FROM[c]} for this vehicle type —{" "}
          <Link to="/variable-cost" className="text-primary hover:underline">
            add one
          </Link>
        </span>
      );
    return (
      <NativeSelect
        value={value}
        onChange={(id) => patch(salary ? { salaryRangeId: id } : { fuelCostId: id })}
        options={options.map((o) => o.id)}
        labels={Object.fromEntries(
          options.map((o) => [
            o.id,
            `${o.code}${vt && setupTypes(o).includes(vt.key) ? "" : " (all brands)"}`,
          ]),
        )}
        invalid={!!errors[salary ? "salaryRangeId" : "fuelCostId"]}
        className="h-9 w-full"
      />
    );
  };
  const routeLabel = source
    ? `${routesAll.find((r) => r.id === source.routeId)?.code ?? ""} · ${source.vehicleType}`
    : "";

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Variable Cost", to: "/variable-cost" },
          { label: "Variable Cost Mapping" },
          ...(source ? [{ label: routeLabel }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Add Variable Cost Mapping"
            : readOnly
              ? `Variable Cost Mapping · ${routeLabel}`
              : `Edit: ${routeLabel}`
        }
        subtitle={route && !isNew ? route.name : undefined}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() =>
          readOnly || isNew
            ? void navigate({ to: "/variable-cost", search: { tab: "mapping" } })
            : back()
        }
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              {!readOnly && (
                <NativeSelect
                  value={d.status}
                  onChange={(v) => patch({ status: v as VariableCostMappingDraft["status"] })}
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
                  <Link
                    to="/variable-cost-mapping/$id"
                    params={{ id: source.id }}
                    search={{ mode: "edit" }}
                  >
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
        <Panel title="Fare Code, Route & Vehicle">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Field
              label="Fare Code"
              required
              error={errors["assignCost"] || fareMiss("code", fareText.code)}
              className="sm:col-span-3"
              info="The Fare Code the variable costs of this trip are booked to. Fixed Cost Fare Codes are not offered."
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm font-semibold text-primary">
                  {fare?.code ?? "—"}
                </div>
              ) : (
                <SuggestInput
                  value={fareText.code}
                  onChange={(v) => typeFare("code", v)}
                  suggestions={fares.map((c) => c.code)}
                  hint={(code) => fares.find((c) => c.code === code)?.name ?? ""}
                  placeholder="Enter Fare Code"
                  invalid={!!errors["assignCost"] || !!fareMiss("code", fareText.code)}
                  upper
                  emptyText="No matching Fare Code"
                />
              )}
            </Field>
            <Field
              label="Fare Name"
              required
              error={fareMiss("name", fareText.name)}
              className="sm:col-span-9"
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{fare?.name ?? "—"}</div>
              ) : (
                <SuggestInput
                  value={fareText.name}
                  onChange={(v) => typeFare("name", v)}
                  suggestions={fares.map((c) => c.name)}
                  hint={(name) => fares.find((c) => c.name === name)?.code ?? ""}
                  placeholder="Enter Fare Name"
                  invalid={!!errors["assignCost"] || !!fareMiss("name", fareText.name)}
                  emptyText="No matching Fare Name"
                />
              )}
            </Field>
            <Field label="Route" required error={errors["routeId"]} className="sm:col-span-5">
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">
                  {route ? `${route.code} - ${route.name}` : "—"}
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
              className="sm:col-span-7"
              info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer), then Brand."
            >
              {readOnly ? (
                <div className="flex h-9 items-center text-sm">{d.vehicleType}</div>
              ) : (
                <VehicleTypePicker
                  value={d.vehicleType}
                  onChange={pickVehicle}
                  types={types}
                  invalid={!!errors["vehicleType"]}
                />
              )}
            </Field>
            {route && vt && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm sm:col-span-12">
                <span>
                  <span className="text-muted-foreground">Distance </span>
                  {formatNumber(Math.round(routeTotals(route).distanceKm))} km
                </span>
                <span>
                  <span className="text-muted-foreground">Terrain </span>
                  {route.terrain ?? "Plain"}
                </span>
                <span>
                  <span className="text-muted-foreground">Vehicle Group </span>
                  {vt.group}
                </span>
                <span>
                  <span className="text-muted-foreground">Toll Stations </span>
                  {stations.length}
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

        <Panel
          title="Variable Cost of the trip"
          bodyClassName="p-0"
          actions={
            trip ? (
              <span className="text-sm text-muted-foreground">
                Variable Cost / Trip{" "}
                <b className="ml-1 text-base tabular-nums text-foreground">{money(trip.total)} ₫</b>
              </span>
            ) : undefined
          }
        >
          {(errors["salaryRangeId"] || errors["fuelCostId"]) && (
            <p className="px-4 pt-3 text-xs font-medium text-destructive">
              {errors["salaryRangeId"] ?? errors["fuelCostId"]}
            </p>
          )}
          {!route || !vt ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Pick the route and the vehicle type: the driver salary, the fuel and the toll fee of
              the trip are loaded here.
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-44" />
                <col className="w-48" />
                <col />
                <col className="w-40" />
              </colgroup>
              <thead>
                <tr className="bg-muted text-left">
                  <th className={cn(thClass, "px-4 py-2")}>Variable Cost</th>

                  <th className={cn(thClass, "px-3 py-2")}>Read From</th>
                  <th className={cn(thClass, "px-3 py-2")}>How it is worked out</th>
                  <th className={cn(thClass, "px-4 py-2 text-right")}>Amount / Trip (₫)</th>
                </tr>
              </thead>
              <tbody>
                {VARIABLE_COMPONENTS.map((c) => {
                  const line = trip?.lines.find((l) => l.component === c);
                  return (
                    <tr key={c} className="border-t align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{c}</div>
                        <div className="text-xs text-muted-foreground">{READ_FROM[c]}</div>
                      </td>

                      <td className="px-3 py-2">{readFrom(c)}</td>
                      <td className="px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                        {line?.basis ?? "—"}
                        {c === "Toll Fee" && stations.length > 0 && (
                          <table className="mt-2 w-full text-xs">
                            <tbody>
                              {stations.map((s, k) => (
                                <tr key={k} className="border-t">
                                  <td className="py-1">{s.leg}</td>
                                  <td className="py-1">
                                    {s.code} · {s.name}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {money(s.fees[vt.group - 1] ?? 0)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {line ? money(line.amount) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 bg-primary/10">
                  <td colSpan={3} className="px-4 py-3 font-semibold">
                    Variable Cost / Trip
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold tabular-nums">
                    {money(trip?.total ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Remark">
          {readOnly ? (
            <p className="text-sm">
              {source?.remark || <span className="text-muted-foreground">—</span>}
            </p>
          ) : (
            <Textarea
              rows={3}
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
          entityType="Variable Cost Mapping"
          entityId={source.id}
          title={routeLabel}
        />
      )}
    </div>
  );
}
