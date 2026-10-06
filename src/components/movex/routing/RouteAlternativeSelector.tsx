import type { RouteCalculation } from "@/types";
import { stationsTotal } from "@/services/cost/costMath";
import { formatDuration, formatVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const altTitle = (a: RouteCalculation, i: number) => a.label ?? `Tuyến ${i + 1}`;

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
        Chưa có phương án tuyến — chọn Điểm đi, Điểm đến, Xe rồi bấm{" "}
        <span className="font-medium text-foreground">Tính lại lộ trình</span>.
      </p>
    );
  return (
    <div
      role="radiogroup"
      aria-label="Lựa chọn tuyến"
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
                    Đề xuất
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.distance} km · {formatDuration(a.estimatedTime)} ·{" "}
                {formatVnd(stationsTotal(a.tollStations))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
