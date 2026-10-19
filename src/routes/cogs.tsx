import { createFileRoute } from "@tanstack/react-router";
import { RouteCostSheet } from "@/components/movex/cost/RouteCostSheet";

export const Route = createFileRoute("/cogs")({
  head: () => ({ meta: [{ title: "COGS — MoveX" }] }),
  component: () => <RouteCostSheet mode="cogs" />,
});
