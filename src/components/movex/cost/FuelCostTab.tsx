// Variable Cost › Fuel Cost: the price of each Fuel Type the vehicles run on (one per Fuel Type), one row
// each, with the vehicle types listed on it. Each Fuel Cost opens on its own page (FuelCostForm), where
// the Fuel Rate of each vehicle type is set. A COGS burns its vehicle type's rate × the route's
// distance at this price.
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { fuelCostRepository } from "@/repositories";
import { fuelUnitOf } from "@/services/vehicleMasterService";
import { fuelCostCrud, fuelCostNameOf } from "@/services/cost/variableSetup";
import { withoutBrand, type CogsVehicleType } from "@/services/cost/cogsVehicle";
import { fuelRateFor, fuelVehiclesOf, HEADER_ROW, headerTypeOn } from "@/services/cost/fuelRates";
import { versionOf } from "@/services/cost/versions";
import { Amount } from "@/components/movex/general/Amount";
import type { FuelCostRecord } from "@/types";
import { cn } from "@/lib/utils";

/** A vehicle type of a Fuel Cost with what it burns, as on the Fuel Cost page (0: no vehicle behind it). */
interface VehicleRate {
  vehicleType: string;
  k1: number;
  k2: number;
  /** Estimate (K1 + K2) ÷ 2, per 100 km. */
  rate: number;
}

/** A row of the list: a Fuel Cost and its vehicle types (no brands) with their Fuel Rates. */
type FuelRow = FuelCostRecord & { vehicleTypes: string[]; vehicleRates: VehicleRate[] };

function rowsOf(recs: readonly FuelCostRecord[], types: readonly CogsVehicleType[]): FuelRow[] {
  const byKey = new Map(types.map((t) => [t.key, t]));
  return recs.map((f) => {
    // The rows of the Fuel Cost page, all on one level: each Truck Type, HEADER, any header + container.
    const vehicleRates = fuelVehiclesOf(f, types)
      .filter((v) => withoutBrand(v.vehicleType) === v.vehicleType)
      .map((v): VehicleRate => {
        const vt =
          v.vehicleType === HEADER_ROW ? headerTypeOn(types, f.fuelType) : byKey.get(v.vehicleType);
        const use = vt ? fuelRateFor(f, vt) : undefined;
        return {
          vehicleType: v.vehicleType,
          k1: use?.k1 ?? 0,
          k2: use?.k2 ?? 0,
          rate: use?.rate ?? 0,
        };
      });
    return { ...f, vehicleTypes: vehicleRates.map((v) => v.vehicleType), vehicleRates };
  });
}

/** The vehicle types of a Fuel Cost and what each burns: a small table, like the one on its page. */
function VehicleRatesCell({ r }: { r: FuelRow }) {
  const unit = fuelUnitOf(r.fuelType).capacity;
  if (!r.vehicleRates.length)
    return <span className="text-xs text-muted-foreground">No vehicle type yet</span>;
  const n = (v: number) => (v > 0 ? v : "—");
  // A grid (not a table): the list's cell borders stay out of it. Vehicle Type · K1 · K2 · Estimate · Cost / km.
  const cols = "grid grid-cols-[minmax(6.5rem,1fr)_2.5rem_2.5rem_5.5rem_6rem] items-center gap-x-3";
  return (
    <div className="text-xs tabular-nums">
      <div className={cn(cols, "pb-1 text-[11px] font-medium text-muted-foreground")}>
        <span>Vehicle Type</span>
        <span className="text-right" title="Running empty">
          K1
        </span>
        <span className="text-right" title="Running loaded">
          K2
        </span>
        <span className="whitespace-nowrap text-right">Estimate / 100 km</span>
        <span className="whitespace-nowrap text-right">Fuel Cost / km</span>
      </div>
      {r.vehicleRates.map((v) => (
        <div key={v.vehicleType} className={cn(cols, "border-t border-border/60 py-1")}>
          <span className="truncate text-foreground" title={v.vehicleType}>
            {v.vehicleType}
          </span>
          <span className="text-right">{n(v.k1)}</span>
          <span className="text-right">{n(v.k2)}</span>
          <span className="whitespace-nowrap text-right font-semibold text-foreground">
            {v.rate > 0 ? `${v.rate} ${unit}` : "—"}
          </span>
          <span className="text-right">
            {v.rate > 0 ? <Amount vnd={Math.round((v.rate / 100) * r.fuelPrice)} /> : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FuelCostTab() {
  const all = useCollection(fuelCostRepository);
  const types = useVehicleTypes();
  const navigate = useNavigate();
  const open = (id: string, mode: "view" | "edit" = "view") =>
    void navigate({ to: "/fuel-cost/$id", params: { id }, search: { mode } });
  const rows = useMemo(
    () =>
      rowsOf(
        all.filter((r) => !r.deleted).sort((a, b) => a.fuelType.localeCompare(b.fuelType)),
        types,
      ),
    [all, types],
  );
  const columns = useMemo<ListColumn<FuelRow>[]>(
    () => [
      {
        key: "code",
        width: 150,
        label: "Fuel Cost Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      {
        key: "name",
        width: 190,
        label: "Fuel Cost Name",
        type: "text",
        value: (r) => fuelCostNameOf(r),
      },
      {
        key: "fuelType",
        width: 110,
        label: "Fuel Type",
        type: "text",
        value: (r) => r.fuelType,
      },
      {
        key: "fuelPrice",
        width: 150,
        label: "Fuel Price",
        type: "number",
        value: (r) => r.fuelPrice,
        render: (r) => (
          <>
            <Amount vnd={r.fuelPrice} /> / {fuelUnitOf(r.fuelType).capacity}
          </>
        ),
        className: "text-right",
      },
      {
        // Each vehicle type with its Fuel Rates (K1 / K2 / Estimate) and cost per km — the table of the
        // Fuel Cost page, so the list reads the same.
        key: "vehicleTypes",
        width: 500,
        label: "Vehicle Types · Fuel Rate",
        type: "text",
        value: (r) => r.vehicleTypes.join(", "),
        render: (r) => <VehicleRatesCell r={r} />,
      },
      {
        key: "remark",
        width: 200,
        label: "Remark",
        type: "text",
        value: (r) => r.remark,
      },
      {
        key: "version",
        width: 90,
        label: "Version",
        type: "number",
        value: (r) => versionOf(r),
        render: (r) => `v${versionOf(r)}`,
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
      updatedAtColumn<FuelRow>(),
    ],
    [],
  );

  return (
    <EntityListPage<FuelRow>
      fillHeight
      above={<VariableCostTabs active="fuel" />}
      lang="en"
      screen="fuel-cost.v6"
      entityType="Fuel Cost"
      entityLabel="Fuel Cost"
      title="Variable Cost"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search code, name, fuel type, vehicle type..."
      searchValues={(r) => [r.code, fuelCostNameOf(r), r.fuelType, r.remark, ...r.vehicleTypes]}
      quickFilters={[statusFilter]}
      crud={fuelCostCrud as never}
      readOnlyReason="Import is not available for fuel costs yet"
      bordered
      addLabel="Add Fuel Cost"
      onAdd={() => void navigate({ to: "/fuel-cost/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r.id)}
      onEdit={(r) => open(r.id, "edit")}
    />
  );
}
