import { createFileRoute } from "@tanstack/react-router";
import { VariableCostPage } from "@/components/movex/cost/VariableCostPage";
import type { VariableCostTab } from "@/components/movex/cost/VariableCostTabs";

const TABS: readonly VariableCostTab[] = ["salary", "fuel", "mapping", "reference"];

export const Route = createFileRoute("/variable-cost")({
  validateSearch: (s: Record<string, unknown>): { tab?: VariableCostTab } =>
    TABS.includes(s["tab"] as VariableCostTab) ? { tab: s["tab"] as VariableCostTab } : {},
  head: () => ({ meta: [{ title: "Variable Cost — MoveX" }] }),
  component: VariableCostRoute,
});

function VariableCostRoute() {
  const { tab } = Route.useSearch();
  return <VariableCostPage tab={tab ?? "salary"} />;
}
