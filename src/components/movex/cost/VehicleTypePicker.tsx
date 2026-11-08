// Vehicle Type of the Variable Cost setups and the COGS, picked as in Master Data › Vehicle:
// TRUCK → Truck Type (load), or HEADER → Container Type (Common Code, ISO); then the Brand
// (“All brands” = a setup that applies to every brand). A Salary Range (`salary`) is picked as TRUCK →
// Truck Type, or HEADER alone (its tiers have a column per container instead).
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/movex/common";
import {
  parseVehicleKey,
  specLabel,
  vehicleKey,
  type CogsVehicleType,
  type VariableVehicleKind,
} from "@/services/cost/cogsVehicle";
import { cn } from "@/lib/utils";

const ALL = "__all";

export function VehicleTypePicker({
  value,
  onChange,
  types,
  invalid,
  className,
  salary,
  hideCount,
}: {
  value: string;
  onChange: (key: string) => void;
  types: readonly CogsVehicleType[];
  invalid?: boolean;
  className?: string;
  /** Salary Range: Truck → Truck Type (no brand), or Header alone. */
  salary?: boolean;
  /** No "15 vehicles · Group 3" line (a compact form). */
  hideCount?: boolean;
}) {
  const cur = parseVehicleKey(value);
  const kinds = [...new Set(types.map((t) => t.kind))];
  const kind: VariableVehicleKind | "" = cur?.kind ?? "";
  const specs = [...new Set(types.filter((t) => t.kind === kind).map((t) => t.spec))];
  const spec = cur?.spec ?? "";
  const reefer = cur?.reefer ?? false;
  const brand = cur?.brand ?? "";
  const brands = [
    ...new Set(
      types
        .filter((t) => t.kind === kind && t.spec === spec && t.reefer === reefer && t.brand)
        .map((t) => t.brand),
    ),
  ];
  const vt =
    salary && value === "HEADER"
      ? types.find((t) => t.kind === "HEADER" && !t.brand)
      : types.find((t) => t.key === value);
  const set = (k: VariableVehicleKind | "", s: string, r: boolean, b: string) =>
    onChange(
      salary && k === "HEADER"
        ? "HEADER"
        : k && s
          ? vehicleKey({ kind: k, spec: s, reefer: r, brand: b })
          : k
            ? `${k} · `
            : "",
    );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <NativeSelect
        value={kind}
        onChange={(k) => set(k as VariableVehicleKind | "", "", false, "")}
        options={[...kinds, ...(kind && !kinds.includes(kind) ? [kind] : [])]}
        labels={{ TRUCK: "Truck", HEADER: "Header" }}
        placeholder="Select Vehicle"
        invalid={!!invalid && !kind}
        className={salary ? "h-10 min-w-0 flex-1" : "h-10 w-44"}
      />
      {kind && !(salary && kind === "HEADER") && (
        <NativeSelect
          value={spec}
          onChange={(s) => set(kind, s, reefer, "")}
          options={[...specs, ...(spec && !specs.includes(spec) ? [spec] : [])]}
          labels={Object.fromEntries(
            types
              .filter((t) => t.kind === kind && !t.brand && t.specName)
              .map((t) => [t.spec, `${t.spec} · ${t.specName}`]),
          )}
          placeholder={`Select ${specLabel(kind)}`}
          invalid={!!invalid && !spec}
          className={salary ? "h-10 min-w-0 flex-1" : "h-10 w-40"}
        />
      )}
      {kind && spec && !salary && (
        <NativeSelect
          value={brand || ALL}
          onChange={(b) => set(kind, spec, reefer, b === ALL ? "" : b)}
          options={[ALL, ...brands, ...(brand && !brands.includes(brand) ? [brand] : [])]}
          labels={{ [ALL]: "All brands" }}
          className="h-10 w-40"
        />
      )}
      {hideCount ? null : vt ? (
        <span className={cn("text-xs text-muted-foreground", salary && "w-full")}>
          {vt.vehicleCount} vehicle{vt.vehicleCount === 1 ? "" : "s"}
          {salary && kind === "HEADER" ? " · every container" : ` · Group ${vt.group}`}
        </span>
      ) : (
        value &&
        (spec || value === "HEADER") && (
          <span className="text-xs text-destructive">No active vehicle of this type</span>
        )
      )}
    </div>
  );
}
