import { createFileRoute } from "@tanstack/react-router";
import { VariableCostPage } from "@/components/movex/cost/VariableCostPage";

export const Route = createFileRoute("/variable-cost")({
  head: () => ({ meta: [{ title: "Variable Cost — MoveX" }] }),
  component: VariableCostPage,
});
