import type { RouteCalculation } from "@/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

// Providers label alternatives in Vietnamese ("Tuyến n"); this screen shows them in English.
export const altTitle = (_a: RouteCalculation, i: number) => `Route ${i + 1}`;

/** Compact radio cards above the map: one per alternative returned by the last calculation. */
export function RouteAlternativeSelector({
  alternatives,
  selectedId,
  onSelect,
  disabled,
}: {
  alternatives: RouteCalculation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  if (alternatives.length === 0)
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        No route yet — choose Origin and Destination, then click{" "}
        <span className="font-medium text-foreground">Calculate Route</span>.
      </p>
    );
  return (
    <div
      role="radiogroup"
      aria-label="Route options"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(alternatives.length, 3)}, minmax(0, 1fr))` }}
    >
      {alternatives.map((a, i) => {
        const id = a.id ?? `ALT-${i + 1}`;
        const on = id === selectedId;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onSelect(id)}
            className={cn(
              "flex min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors disabled:opacity-60",
              on ? "border-primary bg-accent ring-1 ring-primary" : "hover:border-primary/50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                on ? "border-primary" : "border-muted-foreground/40",
              )}
            >
              {on && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {altTitle(a, i)}
                {a.recommended && (
                  <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                    Recommended
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.distance} km · {formatDuration(a.estimatedTime)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
