// Variable Cost › Fuel Cost: the price of each Fuel Type the vehicles run on (one per Fuel Type). Picking a
// Fuel Type lists the vehicle types running on it with the smallest / largest / average Fuel Rate of their
// vehicles (Vehicle › Fuel Rate); a COGS burns the average rate of its vehicle type at this price.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/movex/general/MoneyInput";
import { Textarea } from "@/components/ui/textarea";
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
  InlineFields,
  NativeSelect,
  StatusBadge,
  thClass,
} from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { fuelCostRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { fuelUnitOf } from "@/services/vehicleMasterService";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { FUEL_TYPES } from "@/mock-data/vehicleMaster";
import {
  fuelCodeOf,
  fuelCostCrud,
  fuelCostService,
  type FuelCostDraft,
} from "@/services/cost/variableSetup";
import type { CogsVehicleType } from "@/services/cost/cogsVehicle";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FuelCostRecord } from "@/types";

/** Vehicle types (all brands) running on a Fuel Type, with their vehicles' Fuel Rates on it. */
const usersOf = (types: readonly CogsVehicleType[], fuelType: string) =>
  types
    .filter((t) => !t.brand && t.fuelRates[fuelType])
    .map((t) => ({ t, r: t.fuelRates[fuelType]! }));

export function FuelCostTab() {
  const all = useCollection(fuelCostRepository);
  const types = useVehicleTypes();
  const [open, setOpen] = useState<FuelCostRecord | "new" | null>(null);
  const rows = useMemo(
    () => all.filter((r) => !r.deleted).sort((a, b) => a.fuelType.localeCompare(b.fuelType)),
    [all],
  );
  const columns = useMemo<ListColumn<FuelCostRecord>[]>(
    () => [
      {
        key: "code",
        width: 130,
        label: "Fuel Cost Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      { key: "fuelType", width: 140, label: "Fuel Type", type: "text", value: (r) => r.fuelType },
      {
        key: "fuelPrice",
        width: 160,
        label: "Fuel Price",
        type: "number",
        value: (r) => r.fuelPrice,
        render: (r) => `${formatNumber(r.fuelPrice)} đ / ${fuelUnitOf(r.fuelType).capacity}`,
        className: "text-right",
      },
      {
        key: "vehicleTypes",
        width: 150,
        label: "Vehicle Types",
        type: "number",
        value: (r) => usersOf(types, r.fuelType).length,
        className: "text-right",
      },
      {
        key: "rateRange",
        width: 200,
        label: "Fuel Rate (min – max)",
        type: "text",
        value: (r) => {
          const rs = usersOf(types, r.fuelType)
            .map((u) => u.r)
            .filter((x) => x.max > 0);
          if (!rs.length) return "";
          const min = Math.min(...rs.map((x) => x.min));
          const max = Math.max(...rs.map((x) => x.max));
          return `${min} – ${max} ${fuelUnitOf(r.fuelType).rate}`;
        },
      },
      { key: "remark", width: 220, label: "Remark", type: "text", value: (r) => r.remark },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (r) => r.status,
        render: (r) => <StatusBadge status={r.status} />,
      },
      updatedAtColumn<FuelCostRecord>(),
    ],
    [types],
  );

  return (
    <>
      <EntityListPage<FuelCostRecord>
        fillHeight
        above={<VariableCostTabs active="fuel" />}
        lang="en"
        screen="fuel-cost.v2"
        entityType="Fuel Cost"
        entityLabel="Fuel Cost"
        title="Variable Cost"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, fuel type..."
        searchValues={(r) => [r.code, r.fuelType, r.remark]}
        quickFilters={[statusFilter]}
        crud={fuelCostCrud}
        readOnlyReason="Import is not available for fuel costs yet"
        bordered
        addLabel="Add Fuel Cost"
        onAdd={() => setOpen("new")}
        onView={(r) => setOpen(r)}
        onEdit={(r) => setOpen(r)}
      />
      {open && (
        <FuelCostDialog
          key={open === "new" ? "new" : open.id}
          source={open === "new" ? null : open}
          types={types}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** Add / edit the price of one Fuel Type; the vehicle types running on it are listed. */
function FuelCostDialog({
  source,
  types,
  onClose,
}: {
  source: FuelCostRecord | null;
  types: readonly CogsVehicleType[];
  onClose: () => void;
}) {
  const all = useCollection(fuelCostRepository);
  /** Fuel Types of Common Code (Vehicle › Fuel Type); the ones with a price already are not offered. */
  const codeFuelTypes = useCodeOptions(CC.FUEL_TYPE, FUEL_TYPES);
  const priced = new Set(
    all.filter((r) => !r.deleted && r.id !== source?.id).map((r) => r.fuelType),
  );
  const fuelTypes = withCurrent(
    codeFuelTypes.filter((f) => !priced.has(f)),
    source?.fuelType,
  );
  /** "Diesel · 26 vehicle types" / "CNG · no vehicle yet". */
  const fuelLabel = (f: string) => {
    const n = usersOf(types, f).length;
    return n ? `${f} · ${n} vehicle type${n === 1 ? "" : "s"}` : `${f} · no vehicle yet`;
  };
  const [d, setD] = useState<FuelCostDraft>({
    fuelType: source?.fuelType ?? fuelTypes[0] ?? "",
    fuelPrice: source?.fuelPrice ?? 0,
    remark: source?.remark ?? "",
    status: source?.status === "Inactive" ? "Inactive" : "Active",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const patch = (p: Partial<FuelCostDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const unit = fuelUnitOf(d.fuelType);
  const users = usersOf(types, d.fuelType);
  const perKm = (rate: number) => Math.round((rate / 100) * d.fuelPrice);

  const save = () => {
    try {
      const rec = fuelCostService.save(d, source?.id);
      toast.success(`${rec.code} ${source ? "saved" : "added"}`);
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };
  const cell = "px-3 py-2";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source ? `Fuel Cost · ${source.code}` : "Add Fuel Cost"}</DialogTitle>
          <DialogDescription>
            The price of one Fuel Type. A COGS burns the average Fuel Rate of its vehicle type
            (Vehicle › Fuel Rate) at this price.
          </DialogDescription>
        </DialogHeader>

        <InlineFields labelWidth="7rem">
          <div className="grid grid-cols-1 justify-start gap-x-12 gap-y-3 sm:grid-cols-[20rem_20rem]">
            <Field
              label="Fuel Type"
              required
              error={errors["fuelType"]}
              info="Common Code › Fuel Type (the list Vehicle › Fuel Type picks from); one Fuel Cost per Fuel Type."
              hint={d.fuelType ? `Code ${fuelCodeOf(d.fuelType)}` : undefined}
            >
              <NativeSelect
                value={d.fuelType}
                onChange={(fuelType) => patch({ fuelType })}
                options={fuelTypes}
                labels={Object.fromEntries(fuelTypes.map((f) => [f, fuelLabel(f)]))}
                placeholder={fuelTypes.length ? "Select Fuel Type" : "Every Fuel Type has a price"}
                invalid={!!errors["fuelType"]}
                className="h-10 w-full"
              />
            </Field>
            <Field label={`Price (đ / ${unit.capacity})`} required error={errors["fuelPrice"]}>
              <MoneyInput
                value={d.fuelPrice}
                emptyZero
                onChange={(v) => patch({ fuelPrice: Number.isFinite(v) ? v : 0 })}
                invalid={!!errors["fuelPrice"]}
              />
            </Field>
            <Field label="Status">
              <NativeSelect
                value={d.status}
                onChange={(v) => patch({ status: v as FuelCostDraft["status"] })}
                options={["Active", "Inactive"]}
                className="h-10 w-full"
              />
            </Field>
          </div>
        </InlineFields>

        <div>
          <div className="mb-2">
            <div className="text-sm font-semibold">
              Vehicle types running on {d.fuelType || "…"}
            </div>
            <p className="text-xs text-muted-foreground">
              From Master Data › Vehicle: the Fuel Rates of their vehicles. A COGS uses the average.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <table className={cn("w-full text-sm", gridInBoxClass)}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted text-left">
                  {["Vehicle Type", "Vehicles"].map((h) => (
                    <th key={h} className={cn(thClass, cell)}>
                      {h}
                    </th>
                  ))}
                  {[`Min (${unit.rate})`, `Max (${unit.rate})`, "Average", "Fuel Cost / km"].map(
                    (h) => (
                      <th key={h} className={cn(thClass, cell, "text-right")}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No active vehicle runs on {d.fuelType || "this fuel"} yet — set Fuel Type /
                      Fuel Rate on the vehicles in Master Data › Vehicle.
                    </td>
                  </tr>
                )}
                {users.map(({ t, r }) => (
                  <tr key={t.key} className="border-t">
                    <td className={cn(cell, "font-medium")}>{t.key}</td>
                    <td className={cn(cell, "text-muted-foreground")}>{r.vehicles}</td>
                    <td className={cn(cell, "text-right tabular-nums")}>{r.min || "—"}</td>
                    <td className={cn(cell, "text-right tabular-nums")}>{r.max || "—"}</td>
                    <td className={cn(cell, "text-right font-semibold tabular-nums")}>
                      {r.avg || "—"}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums text-primary")}>
                      {d.fuelPrice && r.avg ? `${formatNumber(perKm(r.avg))} đ` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Field label="Remark">
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="Enter Remark"
            value={d.remark}
            onChange={(e) => patch({ remark: e.target.value })}
          />
        </Field>

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
