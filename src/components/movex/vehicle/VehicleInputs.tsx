import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const unitBox =
  "flex shrink-0 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm font-medium text-muted-foreground";

const digits = (v: string) => v.replace(/[^\d.]/g, "");

/** Number input with a fixed unit on its right edge (l/100km, liter, kg, cm3…). */
export function UnitInput({
  value,
  onChange,
  unit,
  placeholder,
  invalid,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  unit: string;
  placeholder?: string;
  invalid?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="flex">
      <Input
        inputMode="decimal"
        className="rounded-r-none"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange?.(digits(e.target.value))}
      />
      <span className={unitBox}>{unit}</span>
    </div>
  );
}

const DIM_PARTS = [
  { tag: "L", label: "Length", placeholder: "Dài" },
  { tag: "W", label: "Width", placeholder: "Rộng" },
  { tag: "H", label: "Height", placeholder: "Cao" },
];

/**
 * "Length × Width × Height" in mm, stored as `L×W×H` (empty parts allowed while typing). Each part
 * carries its letter (L / W / H) so it is clear which number is which.
 */
export function DimensionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = [0, 1, 2].map((i) => value.split("×")[i] ?? "");
  const set = (i: number, v: string) => {
    const next = parts.map((p, j) => (j === i ? digits(v) : p));
    onChange(next.every((p) => p === "") ? "" : next.join("×"));
  };
  return (
    <div className="flex">
      <div className="flex min-w-0 flex-1 items-center rounded-l-md border border-r-0 border-input bg-card focus-within:ring-1 focus-within:ring-ring">
        {parts.map((p, i) => (
          <div key={i} className="flex min-w-0 flex-1 items-center">
            {i > 0 && <span className="px-0.5 text-muted-foreground">×</span>}
            <span
              className="ml-1.5 shrink-0 rounded bg-muted px-1 text-[10px] font-bold leading-4 text-muted-foreground"
              title={DIM_PARTS[i]!.label}
            >
              {DIM_PARTS[i]!.tag}
            </span>
            <input
              inputMode="numeric"
              aria-label={DIM_PARTS[i]!.label}
              placeholder={DIM_PARTS[i]!.placeholder}
              value={p}
              onChange={(e) => set(i, e.target.value)}
              className={cn(
                "h-[34px] w-full min-w-0 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-default disabled:bg-muted/40 disabled:text-foreground disabled:placeholder:text-transparent",
              )}
            />
          </div>
        ))}
      </div>
      <span className={unitBox}>mm</span>
    </div>
  );
}
