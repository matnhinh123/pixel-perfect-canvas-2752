import { Link } from "@tanstack/react-router";
import { moduleTabClass, moduleTablistClass } from "@/components/movex/cost/moduleTabs";

export type FixedCostTab = "list" | "summary";
const TABS: { key: FixedCostTab; label: string }[] = [
  { key: "list", label: "Internal Cost List" },
  { key: "summary", label: "Fixed Cost Mapping" },
];

/** The two tabs of the Fixed Cost screen (same route, `?tab=`). */
export function FixedCostTabs({ active }: { active: FixedCostTab }) {
  return (
    <div role="tablist" className={moduleTablistClass}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          to="/fixed-cost"
          search={{ tab: t.key }}
          role="tab"
          aria-selected={active === t.key}
          className={moduleTabClass(active === t.key)}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
