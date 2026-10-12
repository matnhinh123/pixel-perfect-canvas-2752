import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/variable-cost")({
  head: () => ({ meta: [{ title: "Variable Cost — MoveX" }] }),
  component: VariableCostPage,
});

function VariableCostPage() {
  return (
    <ComingSoon title="Variable Cost" description="Costs that change with volume or activity." />
  );
}
