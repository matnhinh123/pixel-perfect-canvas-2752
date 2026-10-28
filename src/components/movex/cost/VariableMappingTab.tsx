// Variable Cost › Variable Cost Mapping (as Fixed Cost Mapping): each row is a Fare Code, the one variable
// cost booked to it (Trip Salary, Fuel Cost or Toll Fee) and the vehicle types it applies
// to. One mapping per Fare Code; a variable cost of a vehicle type is booked to one Fare Code only.
import { useMemo, useState } from "react";
import { Ban, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  gridInBoxClass,
  NativeSelect,
  StatusBadge,
  Tag,
  thClass,
  InlineFields,
} from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fuelCostRepository,
  salaryRangeRepository,
  variableCostMappingRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { fuelCostFor, setupsFor } from "@/services/cost/cogsBuild";
import {
  variableCostMappingCrud,
  variableCostMappingService,
  type VariableCostMappingDraft,
} from "@/services/cost/variableSetup";
import { cn } from "@/lib/utils";
import {
  VARIABLE_COMPONENTS,
  type VariableComponent,
  type VariableCostMappingRecord,
} from "@/types";

/** Where each variable cost is read from. */
const READ_FROM: Record<VariableComponent, string> = {
  "Trip Salary": "Salary Range",
  "Fuel Cost": "Fuel Cost",
  "Toll Fee": "Route",
};

export function VariableMappingTab() {
  const all = useCollection(variableCostMappingRepository);
  const costsAll = useCollection(costItemRepository);
  const types = useVehicleTypes();
  const typeKeys = types.map((t) => t.key);
  /** Open mapping: null = closed, "new" = add. */
  const [open, setOpen] = useState<VariableCostMappingRecord | "new" | null>(null);

  const fareOf = (m: VariableCostMappingRecord) => costsAll.find((c) => c.id === m.assignCostId);
  const rows = useMemo(
    () =>
      all
        .filter((m) => !m.deleted)
        .sort((a, b) => (fareOf(a)?.code ?? "").localeCompare(fareOf(b)?.code ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, costsAll],
  );

  const columns = useMemo<ListColumn<VariableCostMappingRecord>[]>(
    () => [
      {
        key: "fareCode",
        width: 120,
        label: "Fare Code",
        type: "text",
        pinned: true,
        value: (m) => fareOf(m)?.code ?? "",
        render: (m) => <span className="font-semibold text-primary">{fareOf(m)?.code ?? "—"}</span>,
      },
      {
        key: "fareName",
        width: 240,
        label: "Fare Name",
        type: "text",
        value: (m) => fareOf(m)?.name ?? "",
      },
      {
        key: "component",
        width: 170,
        label: "Variable Cost",
        type: "enum",
        options: [...VARIABLE_COMPONENTS],
        value: (m) => m.component,
        render: (m) => <Tag>{m.component}</Tag>,
      },
      {
        key: "vehicleTypes",
        width: 380,
        label: "Vehicle Types",
        type: "text",
        value: (m) => m.vehicleTypes.join(", "),
        render: (m) => (
          <div className="flex flex-wrap gap-1">
            {m.vehicleTypes.map((t) => (
              <span
                key={t}
                className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (m) => m.status,
        render: (m) => <StatusBadge status={m.status} />,
      },
      updatedAtColumn<VariableCostMappingRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costsAll],
  );

  return (
    <>
      <EntityListPage<VariableCostMappingRecord>
        fillHeight
        lang="en"
        screen="variable-cost-mapping.v3"
        entityType="Variable Cost Mapping"
        entityLabel="Mapping"
        title="Variable Cost"
        above={<VariableCostTabs active="mapping" />}
        rows={rows}
        columns={columns}
        searchPlaceholder="Search fare code, variable cost, vehicle type..."
        searchValues={(m) => [
          fareOf(m)?.code ?? "",
          fareOf(m)?.name ?? "",
          m.component,
          ...m.vehicleTypes,
        ]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: typeKeys.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleTypes", operator: "contains", value: v }],
            })),
          },
          statusFilter,
        ]}
        crud={variableCostMappingCrud}
        readOnlyReason="Import is not available for mappings yet"
        bordered
        addLabel="Add Mapping"
        onAdd={() => setOpen("new")}
        onView={(m) => setOpen(m)}
        onEdit={(m) => setOpen(m)}
      />
      {open && (
        <MappingDialog
          key={open === "new" ? "new" : open.id}
          source={open === "new" ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * Add / edit one mapping: the variable cost, the Fare Code booked to it, then the vehicle types — all of
 * them listed, the ones not booked to it removed. A vehicle type whose variable cost is booked to another
 * Fare Code is greyed out and left out.
 */
function MappingDialog({
  source,
  onClose,
}: {
  source: VariableCostMappingRecord | null;
  onClose: () => void;
}) {
  const costsAll = useCollection(costItemRepository);
  const all = useCollection(variableCostMappingRepository);
  const salaryRanges = useCollection(salaryRangeRepository);
  const fuelCosts = useCollection(fuelCostRepository);
  const types = useVehicleTypes();
  /** Fare Codes with a mapping already (one mapping per Fare Code): not offered. */
  const usedFares = useMemo(
    () => new Set(all.filter((m) => !m.deleted && m.id !== source?.id).map((m) => m.assignCostId)),
    [all, source],
  );
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active" && !usedFares.has(c.id)),
    [costsAll, usedFares],
  );
  /** Every vehicle type of the system (all brands), plus any brand one the mapping already has. */
  const allKeys = [
    ...new Set([
      ...types.filter((t) => !t.brand).map((t) => t.key),
      ...(source?.vehicleTypes ?? []),
    ]),
  ];
  const current = costsAll.find((c) => c.id === source?.assignCostId);
  const [d, setD] = useState<VariableCostMappingDraft>({
    assignCostId: source?.assignCostId ?? "",
    component: source?.component ?? "Trip Salary",
    // A new mapping lists every vehicle type; the ones not booked to the Fare Code are removed.
    vehicleTypes: source ? [...source.vehicleTypes] : allKeys,
  });
  const [fareText, setFareText] = useState({
    code: current?.code ?? "",
    name: current?.name ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeFare = (field: "code" | "name", v: string) => {
    const m = costs.find((c) => same(c[field], v));
    setD((x) => ({ ...x, assignCostId: m?.id ?? "" }));
    setFareText(m ? { code: m.code, name: m.name } : { code: "", name: "", [field]: v });
    setErrors((e) => ({ ...e, assignCost: "" }));
  };
  const fareMiss = (text: string) => {
    if (!text.trim() || d.assignCostId) return undefined;
    const taken = costsAll.find(
      (c) => !c.deleted && usedFares.has(c.id) && (same(c.code, text) || same(c.name, text)),
    );
    return taken
      ? `${taken.code} already has a Variable Cost Mapping — edit that one.`
      : "Not found in Fare Code Management.";
  };

  /** The other Fare Code this vehicle type's variable cost is booked to ("" = free). */
  const blockOf = (k: string) => {
    const m = all.find(
      (x) =>
        !x.deleted &&
        x.id !== source?.id &&
        x.component === d.component &&
        x.vehicleTypes.includes(k),
    );
    return m ? (costsAll.find((x) => x.id === m.assignCostId)?.code ?? "?") : "";
  };
  /** Vehicle types booked to this Fare Code (the blocked ones never are). */
  const picked = d.vehicleTypes.filter((k) => !blockOf(k));
  const blocked = allKeys.filter((k) => blockOf(k));
  const removedKeys = allKeys.filter((k) => !d.vehicleTypes.includes(k) && !blockOf(k));
  const vehicleOf = (k: string) => types.find((t) => t.key === k);
  /** The code the variable cost of a vehicle type is read from. */
  const codeOf = (k: string) => {
    if (d.component === "Toll Fee") return "Toll Stations of the route";
    if (d.component === "Fuel Cost") {
      const ft = vehicleOf(k)?.fuelType ?? "";
      return fuelCostFor(fuelCosts, ft)?.code ?? (ft ? `No price for ${ft}` : "No Fuel Type");
    }
    return setupsFor(salaryRanges, k)[0]?.code ?? "None yet";
  };
  const removeVehicle = (k: string) => {
    setD((x) => ({ ...x, vehicleTypes: x.vehicleTypes.filter((y) => y !== k) }));
    setErrors((e) => ({ ...e, vehicleTypes: "" }));
  };
  const addVehicle = (k: string) => {
    setD((x) => ({ ...x, vehicleTypes: [...x.vehicleTypes, k] }));
    setErrors((e) => ({ ...e, vehicleTypes: "" }));
  };

  const save = () => {
    try {
      const rec = variableCostMappingService.save({ ...d, vehicleTypes: picked }, source?.id);
      toast.success(
        `${costsAll.find((c) => c.id === rec.assignCostId)?.code ?? "Mapping"} ${source ? "saved" : "added"}`,
      );
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const cell = "px-3 py-2";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92vh] max-w-4xl flex-col gap-4 overflow-y-auto"
        // No auto-focus: it would open the Fare Code suggestions over the form.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {source ? `Variable Cost Mapping · ${current?.code ?? ""}` : "Add Mapping"}
          </DialogTitle>
          <DialogDescription>
            Pick the variable cost, the Fare Code it is booked to, then keep the vehicle types it
            applies to.
          </DialogDescription>
        </DialogHeader>

        <InlineFields labelWidth="8rem">
          <div className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            <Field label="Variable Cost" required error={errors["component"]}>
              <NativeSelect
                value={d.component}
                onChange={(v) => {
                  setD((x) => ({ ...x, component: v as VariableComponent }));
                  setErrors((e) => ({ ...e, component: "", vehicleTypes: "" }));
                }}
                options={[...VARIABLE_COMPONENTS]}
                className="h-10 w-full"
              />
            </Field>
            <Field
              label="Fare Code"
              required
              error={errors["assignCost"] || fareMiss(fareText.code)}
              info="One mapping per Fare Code: Fare Codes with a mapping already are not offered."
            >
              <SuggestInput
                value={fareText.code}
                onChange={(v) => typeFare("code", v)}
                suggestions={costs.map((c) => c.code)}
                hint={(code) => costs.find((c) => c.code === code)?.name ?? ""}
                placeholder="Enter Fare Code"
                invalid={!!errors["assignCost"] || !!fareMiss(fareText.code)}
                upper
                emptyText="No matching Fare Code"
              />
            </Field>
            <Field
              label="Fare Name"
              required
              error={fareMiss(fareText.name)}
              className="sm:col-start-2"
            >
              <SuggestInput
                value={fareText.name}
                onChange={(v) => typeFare("name", v)}
                suggestions={costs.map((c) => c.name)}
                hint={(name) => costs.find((c) => c.name === name)?.code ?? ""}
                placeholder="Enter Fare Name"
                invalid={!!errors["assignCost"] || !!fareMiss(fareText.name)}
                emptyText="No matching Fare Name"
              />
            </Field>
          </div>
        </InlineFields>
        <div>
          <div className="mb-2">
            <div className="text-sm font-semibold">
              Vehicle Types <span className="text-destructive">*</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Every vehicle type of Master Data › Vehicle — remove the ones not booked to this Fare
              Code. Greyed out: its {d.component} is booked to another Fare Code already.
            </p>
          </div>
          {errors["vehicleTypes"] && (
            <p className="mb-2 text-xs font-medium text-destructive">{errors["vehicleTypes"]}</p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className={cn("w-full text-sm", gridInBoxClass)}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted text-left">
                  {["Vehicle Type", "Vehicles", READ_FROM[d.component]].map((h) => (
                    <th key={h} className={cn(thClass, cell)}>
                      {h}
                    </th>
                  ))}
                  <th className={cn(thClass, "w-12")} />
                </tr>
              </thead>
              <tbody>
                {picked.length === 0 && blocked.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No vehicle type — add one back below.
                    </td>
                  </tr>
                )}
                {picked.map((k) => (
                  <tr key={k} className="border-t">
                    <td className={cn(cell, "font-medium")}>{k}</td>
                    <td className={cn(cell, "text-muted-foreground")}>
                      {vehicleOf(k)?.vehicleCount ?? 0}
                    </td>
                    <td className={cn(cell, "font-mono text-xs")}>{codeOf(k)}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`Remove ${k}`}
                        title="Remove"
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeVehicle(k)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {blocked.map((k) => (
                  <tr key={k} className="border-t bg-muted/40 text-muted-foreground">
                    <td className={cell}>
                      <span className="line-through">{k}</span>
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                        <Ban className="h-3.5 w-3.5" />
                        Mapped to {blockOf(k)}
                      </span>
                    </td>
                    <td className={cell}>{vehicleOf(k)?.vehicleCount ?? 0}</td>
                    <td className={cn(cell, "font-mono text-xs")}>{codeOf(k)}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {removedKeys.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Removed:</span>
              {removedKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addVehicle(k)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 hover:bg-accent"
                  title="Add back"
                >
                  <Plus className="h-3 w-3" />
                  {k}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {picked.length} vehicle type{picked.length === 1 ? "" : "s"} booked to this Fare Code
            {blocked.length > 0 && ` · ${blocked.length} mapped to another Fare Code`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
