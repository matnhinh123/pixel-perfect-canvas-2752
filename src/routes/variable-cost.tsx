import { createFileRoute } from "@tanstack/react-router";
import { RouteCostSheet } from "@/components/movex/cost/RouteCostSheet";

export const Route = createFileRoute("/variable-cost")({
  head: () => ({ meta: [{ title: "Variable Cost — MoveX" }] }),
  component: () => <RouteCostSheet mode="variable" />,
});
