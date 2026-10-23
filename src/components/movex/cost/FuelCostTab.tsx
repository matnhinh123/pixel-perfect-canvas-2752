// Variable Cost › Fuel Cost: the fuel of one vehicle type (Truck → Truck Type, or Header → Container,
// dry or reefer), each under its own code; a COGS reads the one of its vehicle type.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, NativeSelect, StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { fuelCostRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { fuelUnitOf } from "@/services/vehicleMasterService";
import {
  fuelCostCrud,
  fuelCostService,
  sanitizeSetupCode,
  type FuelCostDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import type { FuelCostRecord } from "@/types";

const perKm = (f: Pick<FuelCostRecord, "fuelRate" | "fuelPrice">) =>
  Math.round((f.fuelRate / 100) * f.fuelPrice);

export function FuelCostTab() {
  const all = useCollection(fuelCostRepository);
  const types = useVehicleTypes();
  const [open, setOpen] = useState<FuelCostRecord | "new" | null>(null);
  const rows = useMemo(
    () => all.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [all],
  );
  const typeKeys = types.map((t) => t.key);
  const columns = useMemo<ListColumn<FuelCostRecord>[]>(
    () => [
      {
        key: "code",
        width: 120,
        label: "Fuel Cost Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      { key: "name", width: 220, label: "Fuel Cost Name", type: "text", value: (r) => r.name },
      {
        key: "vehicleType",
        width: 190,
        label: "Vehicle Type",
        type: "enum",
        options: typeKeys,
        value: (r) => r.vehicleType,
        render: (r) => (
          <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {r.vehicleType}
          </span>
        ),
      },
      {
        key: "fuelType",
        width: 110,
        label: "Fuel Type",
        type: "text",
        value: (r) => r.fuelType,
      },
      {
        key: "fuelRate",
        width: 130,
        label: "Fuel Rate",
        type: "number",
        value: (r) => r.fuelRate,
        render: (r) => `${r.fuelRate} ${fuelUnitOf(r.fuelType).rate}`,
        className: "text-right",
      },
      {
        key: "fuelPrice",
        width: 130,
        label: "Fuel Price",
        type: "number",
        value: (r) => r.fuelPrice,
        render: (r) => `${formatNumber(r.fuelPrice)} đ / ${fuelUnitOf(r.fuelType).capacity}`,
        className: "text-right",
      },
      {
        key: "perKm",
        width: 120,
        label: "Fuel Cost / km",
        type: "number",
        value: (r) => perKm(r),
        render: (r) => <b className="tabular-nums">{formatNumber(perKm(r))} đ</b>,
        className: "text-right",
      },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeKeys.join("|")],
  );

  return (
    <>
      <EntityListPage<FuelCostRecord>
        embedded
        lang="en"
        screen="fuel-cost"
        entityType="Fuel Cost"
        entityLabel="Fuel Cost"
        title="Fuel Cost"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, name, vehicle type..."
        searchValues={(r) => [r.code, r.name, r.vehicleType, r.fuelType]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: typeKeys.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleType", operator: "eq", value: v }],
            })),
          },
          statusFilter,
        ]}
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
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function FuelCostDialog({
  source,
  onClose,
}: {
  source: FuelCostRecord | null;
  onClose: () => void;
}) {
  const types = useVehicleTypes();
  const [d, setD] = useState<FuelCostDraft>({
    code: source?.code ?? "",
    name: source?.name ?? "",
    vehicleType: source?.vehicleType ?? "",
    fuelType: source?.fuelType ?? "",
    fuelRate: source?.fuelRate ?? 0,
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
  const vt = types.find((t) => t.key === d.vehicleType);
  const fuelTypes = vt?.fuelTypes ?? [];
  const unit = fuelUnitOf(d.fuelType);
  /** A new vehicle type: its only Fuel Type is picked, the Fuel Rate filled from its vehicles' average. */
  const pickVehicle = (vehicleType: string) => {
    const t = types.find((x) => x.key === vehicleType);
    patch({
      vehicleType,
      fuelType: t?.fuelTypes.includes(d.fuelType)
        ? d.fuelType
        : t?.fuelTypes.length === 1
          ? t.fuelTypes[0]!
          : "",
      ...(t && !d.fuelRate && t.fuelNorm ? { fuelRate: t.fuelNorm } : {}),
    });
  };

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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92vh] max-w-3xl flex-col gap-4 overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{source ? `Fuel Cost · ${source.code}` : "Add Fuel Cost"}</DialogTitle>
          <DialogDescription>
            Fuel of one vehicle type. Fuel Cost of a trip = Fuel Rate × route km ÷ 100 × Fuel Price.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <Field
            label="Fuel Cost Code"
            required
            error={errors["code"]}
            className="sm:col-span-4"
            hint={`${d.code.length}/20`}
            info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters)."
          >
            <Input
              value={d.code}
              maxLength={20}
              placeholder="Enter Code"
              onChange={(e) => patch({ code: sanitizeSetupCode(e.target.value) })}
              aria-invalid={!!errors["code"] || undefined}
            />
          </Field>
          <Field label="Fuel Cost Name" required error={errors["name"]} className="sm:col-span-5">
            <Input
              value={d.name}
              maxLength={200}
              placeholder="Enter Name"
              onChange={(e) => patch({ name: e.target.value })}
              aria-invalid={!!errors["name"] || undefined}
            />
          </Field>
          <Field label="Status" className="sm:col-span-3">
            <NativeSelect
              value={d.status}
              onChange={(v) => patch({ status: v as FuelCostDraft["status"] })}
              options={["Active", "Inactive"]}
              className="h-10 w-full"
            />
          </Field>
          <Field
            label="Vehicle Type"
            required
            error={errors["vehicleType"]}
            className="sm:col-span-12"
            info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer)."
          >
            <VehicleTypePicker
              value={d.vehicleType}
              onChange={pickVehicle}
              types={types}
              invalid={!!errors["vehicleType"]}
            />
          </Field>
          <Field
            label="Fuel Type"
            required
            error={errors["fuelType"]}
            className="sm:col-span-4"
            info="The Fuel Types the vehicles of this type (and brand) run on in Master Data › Vehicle."
          >
            <NativeSelect
              value={d.fuelType}
              onChange={(fuelType) => patch({ fuelType })}
              options={[
                "",
                ...fuelTypes,
                ...(d.fuelType && !fuelTypes.includes(d.fuelType) ? [d.fuelType] : []),
              ]}
              labels={{
                "": !vt
                  ? "Pick a vehicle type"
                  : fuelTypes.length
                    ? "Select Fuel Type"
                    : "Not set in Vehicle",
              }}
              disabled={!vt || !fuelTypes.length}
              invalid={!!errors["fuelType"]}
              className="h-10 w-full"
            />
          </Field>
          <Field
            label={`Fuel Rate (${unit.rate})`}
            required
            error={errors["fuelRate"]}
            className="sm:col-span-4"
            hint={vt?.fuelNorm ? `Average of the vehicles: ${vt.fuelNorm}` : undefined}
          >
            <Input
              inputMode="decimal"
              value={d.fuelRate ? String(d.fuelRate) : ""}
              placeholder="0"
              onChange={(e) =>
                patch({ fuelRate: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })
              }
              className="text-right tabular-nums"
              aria-invalid={!!errors["fuelRate"] || undefined}
            />
          </Field>
          <Field
            label={`Fuel Price (đ / ${unit.capacity})`}
            required
            error={errors["fuelPrice"]}
            className="sm:col-span-4"
          >
            <Input
              inputMode="numeric"
              value={d.fuelPrice ? String(d.fuelPrice) : ""}
              placeholder="0"
              onChange={(e) =>
                patch({ fuelPrice: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })
              }
              className="text-right tabular-nums"
              aria-invalid={!!errors["fuelPrice"] || undefined}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm sm:col-span-12">
            <span className="text-muted-foreground">Fuel Cost / km</span>
            <b className="tabular-nums text-primary">{formatNumber(perKm(d))} đ</b>
          </div>
          <Field label="Remark" className="sm:col-span-12">
            <Textarea
              rows={4}
              maxLength={500}
              placeholder="Enter Remark"
              value={d.remark}
              onChange={(e) => patch({ remark: e.target.value })}
            />
          </Field>
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
