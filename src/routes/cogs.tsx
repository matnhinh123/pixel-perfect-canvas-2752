import { createFileRoute } from "@tanstack/react-router";
import { CogsPage } from "@/components/movex/cost/CogsPage";

export const Route = createFileRoute("/cogs")({
  head: () => ({ meta: [{ title: "COGS — MoveX" }] }),
  component: CogsPage,
});
