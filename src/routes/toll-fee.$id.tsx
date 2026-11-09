import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { TollFeeForm } from "@/components/movex/cost/TollFeeForm";
import { useCollection } from "@/hooks/use-store";
import { tollFeeRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/toll-fee/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: () => ({ meta: [{ title: "Toll Fee — MoveX" }] }),
  component: TollFeePage,
});

function TollFeePage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(tollFeeRepository);
  const r = all.find((x) => x.id === id && !x.deleted);
  if (r) {
    const readOnly = mode !== "edit";
    return <TollFeeForm key={`${r.id}-${readOnly}`} source={r} readOnly={readOnly} />;
  }
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-6 w-6" />}
        title="Toll Fee not found"
        description="It may belong to a route that was deleted."
        action={
          <Button asChild variant="outline">
            <Link to="/variable-cost" search={{ tab: "toll" }}>
              Back to Toll Fee
            </Link>
          </Button>
        }
      />
    </Panel>
  );
}
