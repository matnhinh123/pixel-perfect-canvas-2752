// Fixed Cost › Vehicle Type: one row per vehicle the cost applies to, picked like on the Vehicle form
// (Vehicle Type → Truck Type / Trailer Size → Brand). Only combinations an active vehicle has are offered.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/movex/common";
import { useCollection } from "@/hooks/use-store";
import { vehicleMasterRepository } from "@/repositories";
import {
  fcVehicleLabel,
  fcVehicleOptions,
  needsSpec,
  parseFcVehicle,
  specLabelOf,
  vehiclesOf,
  type FcVehicle,
  type FcVehicleKind,
} from "@/services/fixedCostVehicle";
import { cn } from "@/lib/utils";

const EMPTY: FcVehicle = { kind: "TRUCK", spec: "", brand: "" };
const withCur = (list: string[], v: string) => (v && !list.includes(v) ? [...list, v] : list);

export function FixedCostVehicleRows({
  value,
  onChange,
  readOnly,
  error,
  single = false,
}: {
  value: string[];
  onChange: (labels: string[]) => void;
  readOnly: boolean;
  error?: string | undefined;
  /** Exactly one vehicle type: one row, no Add / Remove. */
  single?: boolean;
}) {
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const opts = useMemo(() => fcVehicleOptions(vehiclesAll), [vehiclesAll]);
  // Single: always one row (a fresh one until something is picked).
  const labels =
    single && !value.length
      ? [fcVehicleLabel({ ...EMPTY, kind: opts.kinds[0] ?? EMPTY.kind })]
      : value;
  const rows = labels.map((l) => ({ label: l, v: parseFcVehicle(l) }));
  const setRow = (i: number, v: FcVehicle) =>
    onChange(labels.map((l, j) => (j === i ? fcVehicleLabel(v) : l)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const kind = opts.kinds[0] ?? EMPTY.kind;
    onChange([...value, fcVehicleLabel({ ...EMPTY, kind })]);
  };

  return (
    <div className="sm:col-span-6 lg:col-span-12">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-foreground">Vehicle Type</span>
          <p className="text-xs text-muted-foreground">
            Picked from the vehicles in{" "}
            <Link to="/vehicle" className="text-primary hover:underline">
              Vehicle
            </Link>
            . Leave Brand on “All brands” to cover every brand.
          </p>
        </div>
        {!readOnly && !single && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
            Add Vehicle Type
          </Button>
        )}
      </div>
      {error && <p className="mb-1.5 text-xs font-medium text-destructive">{error}</p>}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          No vehicle type.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {rows.map(({ label, v }, i) => {
            if (!v)
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-destructive">“{label}” is not a valid vehicle type</span>
                  {!readOnly && <RemoveBtn onClick={() => remove(i)} />}
                </div>
              );
            const count = vehiclesOf(v, vehiclesAll).length;
            const specs = withCur(opts.specs(v.kind), v.spec);
            const brands = withCur(opts.brands(v.kind, v.spec), v.brand);
            const ready = !needsSpec(v.kind) || !!v.spec;
            return (
              <div
                key={i}
                className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[150px_200px_190px_1fr_auto]"
              >
                <NativeSelect
                  value={v.kind}
                  onChange={(k) => setRow(i, { kind: k as FcVehicleKind, spec: "", brand: "" })}
                  options={withCur([...opts.kinds], v.kind)}
                  className="h-9 w-full"
                />
                {needsSpec(v.kind) ? (
                  <NativeSelect
                    value={v.spec}
                    onChange={(spec) => setRow(i, { ...v, spec, brand: "" })}
                    options={["", ...specs]}
                    labels={{ "": `Select ${specLabelOf(v.kind)}` }}
                    invalid={!v.spec}
                    className="h-9 w-full"
                  />
                ) : (
                  <span className="hidden text-xs text-muted-foreground sm:block">—</span>
                )}
                <NativeSelect
                  value={v.brand}
                  onChange={(brand) => setRow(i, { ...v, brand })}
                  options={["", ...brands]}
                  labels={{ "": "All brands" }}
                  disabled={!ready}
                  className="h-9 w-full"
                />
                <span
                  className={cn(
                    "text-xs",
                    ready && !count ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {!ready
                    ? ""
                    : count
                      ? `${count} vehicle${count > 1 ? "s" : ""}`
                      : "No active vehicle"}
                </span>
                {!readOnly && !single ? <RemoveBtn onClick={() => remove(i)} /> : <span />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove vehicle type"
      title="Remove"
      className="ml-auto text-destructive hover:opacity-70"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
