import { useEffect, useState, type ReactNode } from "react";
import { Clock, Coins, Route as RouteIcon, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDuration, formatVnd } from "@/lib/format";

/** Total distance, editable: an empty field falls back to the calculated value. */
function DistanceInput({
  km,
  calculated,
  edited,
  onChange,
}: {
  km: number;
  calculated: boolean;
  edited: boolean;
  onChange: (km: number | undefined) => void;
}) {
  const shown = calculated || edited ? String(km) : "";
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  // While typing, keep the user's text (an empty field must not snap back mid-edit).
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  return (
    <span className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        aria-label="Tổng khoảng cách (km)"
        placeholder="Nhập km"
        className="h-8 w-28 bg-background px-2 text-lg font-bold text-foreground"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          onChange(Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : undefined);
        }}
      />
      <span className="text-sm font-semibold text-foreground">km</span>
      {edited && <span className="text-xs text-primary">(đã sửa)</span>}
    </span>
  );
}

/** The four route metrics shown under the map. */
export function RouteSummary({
  calculated,
  distanceKm,
  distanceEdited = false,
  onDistanceChange,
  estimatedTimeMin,
  tollCost,
  stationCount,
}: {
  calculated: boolean;
  distanceKm: number;
  distanceEdited?: boolean;
  onDistanceChange?: (km: number | undefined) => void;
  estimatedTimeMin: number;
  tollCost: number;
  stationCount: number;
}) {
  const items: [ReactNode, string, ReactNode][] = [
    [
      <RouteIcon key="d" />,
      "Tổng khoảng cách",
      onDistanceChange ? (
        <DistanceInput
          km={distanceKm}
          calculated={calculated}
          edited={distanceEdited}
          onChange={onDistanceChange}
        />
      ) : calculated ? (
        `${distanceKm} km`
      ) : (
        "—"
      ),
    ],
    [<Clock key="t" />, "Thời gian ước tính", calculated ? formatDuration(estimatedTimeMin) : "—"],
    [<Coins key="c" />, "Chi phí trạm thu phí", calculated ? formatVnd(tollCost) : "—"],
    [<Ticket key="n" />, "Số trạm thu phí", calculated ? String(stationCount) : "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-4">
      {items.map(([icon, label, value], i) => (
        <div
          key={label}
          className={
            i > 0 ? "flex items-center gap-3 sm:border-l sm:pl-4" : "flex items-center gap-3"
          }
        >
          <span
            className={
              i === 0
                ? "text-primary [&>svg]:h-6 [&>svg]:w-6"
                : "text-muted-foreground [&>svg]:h-6 [&>svg]:w-6"
            }
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span
              className={
                i === 0
                  ? "block text-xs font-medium text-foreground"
                  : "block text-xs text-muted-foreground"
              }
            >
              {label}
            </span>
            <span className="block truncate text-lg font-bold">{value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
