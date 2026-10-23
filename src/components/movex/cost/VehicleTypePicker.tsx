// Vehicle Type of the Variable Cost setups and the COGS, picked as in Master Data › Vehicle:
// TRUCK → Truck Type (load), or HEADER → Container (trailer size) + Reefer (cont lạnh); then the Brand
// (“All brands” = a setup that applies to every brand).
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
}: {
  value: string;
  onChange: (key: string) => void;
  types: readonly CogsVehicleType[];
  invalid?: boolean;
  className?: string;
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
  const vt = types.find((t) => t.key === value);
  const set = (k: VariableVehicleKind | "", s: string, r: boolean, b: string) =>
    onChange(k && s ? vehicleKey({ kind: k, spec: s, reefer: r, brand: b }) : k ? `${k} · ` : "");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <NativeSelect
        value={kind}
        onChange={(k) => set(k as VariableVehicleKind | "", "", false, "")}
        options={["", ...kinds, ...(kind && !kinds.includes(kind) ? [kind] : [])]}
        labels={{ "": "Select Vehicle", TRUCK: "Truck", HEADER: "Header (đầu kéo)" }}
        invalid={!!invalid && !kind}
        className="h-10 w-44"
      />
      {kind && (
        <NativeSelect
          value={spec}
          onChange={(s) => set(kind, s, reefer, "")}
          options={["", ...specs, ...(spec && !specs.includes(spec) ? [spec] : [])]}
          labels={{ "": `Select ${specLabel(kind)}` }}
          invalid={!!invalid && !spec}
          className="h-10 w-40"
        />
      )}
      {kind === "HEADER" && (
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
          <Checkbox
            checked={reefer}
            disabled={!spec}
            onCheckedChange={(v) => set(kind, spec, v === true, brand)}
          />
          Reefer (cont lạnh)
        </label>
      )}
      {kind && spec && (
        <NativeSelect
          value={brand || ALL}
          onChange={(b) => set(kind, spec, reefer, b === ALL ? "" : b)}
          options={[ALL, ...brands, ...(brand && !brands.includes(brand) ? [brand] : [])]}
          labels={{ [ALL]: "All brands" }}
          className="h-10 w-40"
        />
      )}
      {vt ? (
        <span className="text-xs text-muted-foreground">
          {vt.vehicleCount} vehicle{vt.vehicleCount === 1 ? "" : "s"} · Group {vt.group}
        </span>
      ) : (
        value &&
        spec && <span className="text-xs text-destructive">No active vehicle of this type</span>
      )}
    </div>
  );
}
