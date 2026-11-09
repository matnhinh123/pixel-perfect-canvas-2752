import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { cn } from "@/lib/utils";
import { moduleTabClass, moduleTablistClass } from "@/components/movex/cost/moduleTabs";

export type VariableCostTab = "salary" | "fuel" | "toll" | "reference";
const TABS: { key: VariableCostTab; label: string }[] = [
  { key: "salary", label: "Salary Range" },
  { key: "fuel", label: "Fuel Cost" },
  { key: "toll", label: "Toll Fee" },
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
      <div role="tablist" className={cn("-mt-1", moduleTablistClass)}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/variable-cost"
            search={{ tab: t.key }}
            replace
            role="tab"
            aria-selected={active === t.key}
            className={moduleTabClass(active === t.key)}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  );
}
