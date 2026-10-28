import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { cn } from "@/lib/utils";

export type VariableCostTab = "salary" | "fuel" | "mapping" | "reference";
const TABS: { key: VariableCostTab; label: string }[] = [
  { key: "salary", label: "Salary Range" },
  { key: "fuel", label: "Fuel Cost" },
  { key: "mapping", label: "Variable Cost Mapping" },
  { key: "reference", label: "Reference Trip Salary" },
];

/** The tabs of the Variable Cost screen (same route, `?tab=`), as on Fixed Cost. */
export function VariableCostTabs({ active }: { active: VariableCostTab }) {
  const types = useVehicleTypes();
  return (
    <>
      {types.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            No active vehicles in Master Data › Vehicle yet — add a truck or a header there to get
            vehicle types.{" "}
            <Link to="/vehicle" className="font-semibold text-primary hover:underline">
              Open Vehicle
            </Link>
          </span>
        </div>
      )}
      <div role="tablist" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/variable-cost"
            search={{ tab: t.key }}
            replace
            role="tab"
            aria-selected={active === t.key}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground opacity-50 hover:text-foreground hover:opacity-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  );
}
