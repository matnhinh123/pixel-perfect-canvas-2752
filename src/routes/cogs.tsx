import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/cogs")({
  head: () => ({ meta: [{ title: "COGS — MoveX" }] }),
  component: CogsPage,
});

function CogsPage() {
  return <ComingSoon title="COGS" description="Cost of goods sold." />;
}
