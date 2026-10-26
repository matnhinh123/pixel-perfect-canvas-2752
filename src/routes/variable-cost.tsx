import { createFileRoute } from "@tanstack/react-router";
import { VariableCostPage, type VariableCostTab } from "@/components/movex/cost/VariableCostPage";

const TABS: readonly VariableCostTab[] = ["salary", "fuel", "mapping"];

export const Route = createFileRoute("/variable-cost")({
  validateSearch: (s: Record<string, unknown>): { tab?: VariableCostTab } =>
    TABS.includes(s["tab"] as VariableCostTab) ? { tab: s["tab"] as VariableCostTab } : {},
  head: () => ({ meta: [{ title: "Variable Cost — MoveX" }] }),
  component: VariableCostRoute,
});

function VariableCostRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <VariableCostPage
      tab={tab ?? "salary"}
      onTab={(t) => void navigate({ search: { tab: t }, replace: true })}
    />
  );
}
