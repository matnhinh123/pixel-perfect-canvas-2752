import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { CollapsiblePanel, ReadOnlyScope, S3, S4 } from "@/components/movex/general/FormParts";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository, fixedCostRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  calcFixedCost,
  draftOfFixedCost,
  fixedCostService,
  newFixedCostDraft,
  rateOf,
  type FixedCostDraft,
} from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import { COST_CURRENCIES } from "@/mock-data/costMaster";
import { FIXED_COST_TYPES, FIXED_COST_VEHICLE_TYPES } from "@/mock-data/fixedCost";
import { ALLOCATION_UNITS, type FixedCostRecord } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/fixed-cost/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Create Fixed Cost — MoveX" : "Fixed Cost Detail — MoveX" },
    ],
  }),
  component: FixedCostPage,
});

function FixedCostPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(fixedCostRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Fixed Cost not found"
          action={
            <Button asChild size="sm">
              <Link to="/fixed-cost">Back to list</Link>
            </Button>
          }
        />
      </Panel>
    );
  return (
    <FixedCostForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

const NUM = "tabular-nums";

function FixedCostForm({
  source,
  readOnly,
}: {
  source: FixedCostRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const costTypes = useCodeOptions(CC.FIXED_COST_TYPE, FIXED_COST_TYPES);
  const vehicleTypes = useCodeOptions(CC.FIXED_COST_VEHICLE_TYPE, FIXED_COST_VEHICLE_TYPES);
  const units = useCodeOptions(CC.ALLOCATION_UNIT, ALLOCATION_UNITS);
  const isNew = !source;
  const detailsAll = useCollection(costItemRepository);
  const details = useMemo(
    () =>
      detailsAll.filter(
        (c) => !c.deleted && (c.status === "Active" || c.id === source?.costDetailId),
      ),
    [detailsAll, source],
  );

  const initial = useMemo<FixedCostDraft>(
    () => (source ? draftOfFixedCost(source) : newFixedCostDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<FixedCostDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const isTrip = d.allocationUnit === "Trip";
  const calc = calcFixedCost({ ...d, exchangeRate: rateOf(d.currency) });

  /** Number input kept as text-friendly: empty string → 0 so validation flags it. */
  const numInput = (
    k: "costValue" | "allocationBase" | "utilContainer" | "utilDay" | "allocationDays",
    extra: { disabled?: boolean } = {},
  ) => ({
    type: "number" as const,
    inputMode: "decimal" as const,
    min: 0,
    step: "any",
    value: d[k] === 0 ? "" : d[k],
    onChange: (e: { target: { value: string } }) => patch({ [k]: Number(e.target.value) || 0 }),
    "aria-invalid": !!errors[k] || undefined,
    ...extra,
  });
  const select = (
    k: "costTypeCode" | "currency" | "allocationUnit",
    options: readonly string[],
    placeholder: string,
    labels: Record<string, string> = {},
  ): Parameters<typeof NativeSelect>[0] => ({
    value: d[k],
    onChange: (v) => patch({ [k]: v }),
    options: k === "currency" || k === "allocationUnit" ? options : ["", ...options],
    labels: { "": readOnly ? "—" : placeholder, ...labels },
    className: "h-10 w-full",
    invalid: !!errors[k],
  });

  const toggleVehicle = (v: string) =>
    patch({
      vehicleTypes: d.vehicleTypes.includes(v)
        ? d.vehicleTypes.filter((x) => x !== v)
        : [...d.vehicleTypes, v],
    });

  const back = () =>
    source
      ? void navigate({
          to: "/fixed-cost/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/fixed-cost" });

  const save = () => {
    setFormError(null);
    try {
      const saved = fixedCostService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Fixed Cost ${saved.code} added` : `Fixed Cost ${saved.code} saved`);
      void navigate({ to: "/fixed-cost" });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const unitNote = isTrip
    ? "Trip: the Allocation Value is already per trip, so Allocation Days and Utilization are not used."
    : "Only units from the Allocation Base Unit down are calculated; larger units show “—”.";

  const unitLabel = d.allocationUnit;
  const rate = rateOf(d.currency);
  const preview = [
    `Allocation Value = ${fmtMoney(d.costValue, 2)} ${d.currency}${rate !== 1 ? ` × ${fmtMoney(rate)}` : ""} ÷ ${d.allocationBase || 0} = ${fmtMoney(calc.allocation, 2)} ₫ / ${unitLabel}`,
    ...(isTrip
      ? [`Trip = Allocation Value = ${fmtMoney(calc.trip, 2)} ₫`]
      : [
          ...(unitLabel === "Year" ? [`Month = Year ÷ 12 = ${fmtMoney(calc.month, 2)} ₫`] : []),
          ...(unitLabel !== "Day"
            ? [`Day = Month ÷ ${d.allocationDays || 0} days = ${fmtMoney(calc.day, 2)} ₫`]
            : []),
          d.applyUtilization
            ? `Trip = Day ÷ Utilization (${d.utilContainer || 0} container ÷ ${d.utilDay || 0} day) = ${fmtMoney(calc.trip, 2)} ₫`
            : `Trip = Day = ${fmtMoney(calc.trip, 2)} ₫ (utilization not applied)`,
        ]),
  ];

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Cost" },
          { label: "Fixed Cost", to: "/fixed-cost" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Create Fixed Cost"
            : readOnly
              ? `Fixed Cost Detail #${source.code}`
              : `Edit Fixed Cost #${source.code}`
        }
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/fixed-cost" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
              {readOnly && source.status === "Active" && (
                <Button asChild size="lg">
                  <Link to="/fixed-cost/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
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

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <CollapsiblePanel title="General Information">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              label="Fare Detail"
              required
              error={errors["costDetailId"]}
              className={S4}
              info="The Fare Detail (Fare Cost Management) this fixed cost is booked to."
            >
              <SearchableSelect
                value={d.costDetailId}
                onChange={(v) => patch({ costDetailId: v })}
                options={["", ...details.map((c) => c.id)]}
                labels={{
                  "": readOnly ? "—" : "Select Fare Detail",
                  ...Object.fromEntries(details.map((c) => [c.id, `${c.code} · ${c.name}`])),
                }}
                invalid={!!errors["costDetailId"]}
                disabled={readOnly}
                searchPlaceholder="Search cost code or name…"
                emptyText="No matching Fare Detail"
              />
            </Field>
            <Field label="Cost Type Code" required error={errors["costTypeCode"]} className={S4}>
              <NativeSelect
                {...select(
                  "costTypeCode",
                  withCurrent(costTypes, d.costTypeCode),
                  "Select Cost Type Code",
                )}
              />
            </Field>
            <Field label="Status" required className={S4}>
              <label className="flex h-10 cursor-pointer items-center gap-3 group-disabled:cursor-default">
                <Switch
                  checked={d.status === "Active"}
                  onCheckedChange={(c) => patch({ status: c ? "Active" : "Inactive" })}
                />
                <span className="text-sm">{d.status}</span>
              </label>
            </Field>
            <Field
              label="Fixed Cost Code"
              required
              error={errors["code"]}
              className={S4}
              info="Unique, upper-case. 2–30 characters: letters, digits, - or _."
            >
              <Input
                placeholder="Enter Fixed Cost Code"
                maxLength={30}
                value={d.code}
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Fixed Cost Name" required error={errors["name"]} className={S4}>
              <Input
                placeholder="Enter Fixed Cost Name"
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field
              label="Cost Value"
              required
              error={errors["costValue"]}
              className={S4}
              hint={
                d.currency !== "VND"
                  ? `1 ${d.currency} = ${fmtMoney(rate)} ₫ (exchange rate)`
                  : undefined
              }
            >
              <div className="flex gap-2">
                <Input placeholder="0" className={cn("flex-1", NUM)} {...numInput("costValue")} />
                <NativeSelect {...select("currency", COST_CURRENCIES, "")} className="h-10 w-24" />
              </div>
            </Field>
            <Field label="Allocation Base" required error={errors["allocationBase"]} className={S4}>
              <Input placeholder="e.g. 8" className={NUM} {...numInput("allocationBase")} />
            </Field>
            <Field
              label="Allocation Base Unit"
              required
              error={errors["allocationUnit"]}
              className={S4}
              hint={unitNote}
            >
              <NativeSelect
                {...select("allocationUnit", withCurrent(units, d.allocationUnit), "Select unit")}
              />
            </Field>
            <Field
              label="Vehicle Type"
              className="sm:col-span-6 lg:col-span-12"
              hint="Optional. A fixed cost with no vehicle type is listed but appears in no Summary."
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                {withCurrent(vehicleTypes, ...d.vehicleTypes).map((v) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 text-sm group-disabled:cursor-default"
                  >
                    <Checkbox
                      checked={d.vehicleTypes.includes(v)}
                      onCheckedChange={() => toggleVehicle(v)}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Utilization Rate & Allocation Value">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="Apply Utilization" className={S3}>
              <label className="flex h-10 cursor-pointer items-center gap-3 group-disabled:cursor-default">
                <Switch
                  checked={d.applyUtilization && !isTrip}
                  disabled={isTrip}
                  onCheckedChange={(c) => patch({ applyUtilization: c })}
                />
                <span className="text-sm">{d.applyUtilization && !isTrip ? "ON" : "OFF"}</span>
              </label>
            </Field>
            <Field
              label="Utilization Rate – Container"
              error={errors["utilContainer"]}
              className={S3}
              info="Containers handled in one standard cycle of the vehicle type."
            >
              <Input
                className={NUM}
                {...numInput("utilContainer", {
                  disabled: isTrip || !d.applyUtilization,
                })}
              />
            </Field>
            <Field
              label="Utilization Rate – Day"
              error={errors["utilDay"]}
              className={S3}
              info="Length (days) of that cycle. Utilization = Container ÷ Day."
            >
              <Input
                className={NUM}
                {...numInput("utilDay", { disabled: isTrip || !d.applyUtilization })}
              />
            </Field>
            <Field
              label="Allocation Days"
              error={errors["allocationDays"]}
              className={S3}
              info="Days per month used for Month → Day."
            >
              <Input className={NUM} {...numInput("allocationDays", { disabled: isTrip })} />
            </Field>

            <div className="sm:col-span-6 lg:col-span-12">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {(
                  [
                    ["Allocation Value", calc.allocation],
                    ["Year", calc.year],
                    ["Month", calc.month],
                    ["Day", calc.day],
                    ["Trip", calc.trip],
                  ] as const
                ).map(([label, v]) => (
                  <div
                    key={label}
                    className={cn(
                      "rounded-lg border px-3.5 py-2.5",
                      label === "Trip" && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className={cn("mt-0.5 text-lg font-semibold", NUM)}>
                      {fmtMoney(v, 0)}
                      {v != null && <span className="ml-1 text-xs font-normal">₫</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-6 lg:col-span-12">
              <div className="mb-1.5 text-sm font-semibold">Formula Preview</div>
              <div className="space-y-1 rounded-lg border bg-muted/40 px-4 py-3 font-mono text-[13px] leading-relaxed">
                {preview.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </div>
          </div>
        </CollapsiblePanel>
      </ReadOnlyScope>

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
          entityType="Fixed Cost"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
