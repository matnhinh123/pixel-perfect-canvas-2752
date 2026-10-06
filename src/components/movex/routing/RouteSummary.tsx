import type { ReactNode } from "react";
import { Clock, Coins, Route as RouteIcon, Ticket } from "lucide-react";
import { formatDuration, formatVnd } from "@/lib/format";

/** The four route metrics shown under the map. */
export function RouteSummary({
  calculated,
  distanceKm,
  estimatedTimeMin,
  tollCost,
  stationCount,
}: {
  calculated: boolean;
  distanceKm: number;
  estimatedTimeMin: number;
  tollCost: number;
  stationCount: number;
}) {
  const items: [ReactNode, string, string][] = [
    [<RouteIcon key="d" />, "Tổng khoảng cách", calculated ? `${distanceKm} km` : "—"],
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
          <span className="text-muted-foreground [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="block truncate text-lg font-bold">{value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
