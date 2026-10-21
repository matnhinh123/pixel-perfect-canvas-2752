import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type FixedCostTab = "list" | "summary";
const TABS: { key: FixedCostTab; label: string }[] = [
  { key: "list", label: "Internal Cost List" },
  { key: "summary", label: "Fixed Cost Mapping" },
];

/** The two tabs of the Fixed Cost screen (same route, `?tab=`). */
export function FixedCostTabs({ active }: { active: FixedCostTab }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to="/fixed-cost"
          search={{ tab: t.key }}
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
  );
}
