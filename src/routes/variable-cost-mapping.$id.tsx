import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { VariableMappingForm } from "@/components/movex/cost/VariableMappingForm";
import { useCollection } from "@/hooks/use-store";
import { variableCostMappingRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/variable-cost-mapping/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      {
        title:
          params.id === "new"
            ? "Add Variable Cost Mapping — MoveX"
            : "Variable Cost Mapping — MoveX",
      },
    ],
  }),
  component: VariableCostMappingPage,
});

function VariableCostMappingPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(variableCostMappingRepository);
  if (id === "new") return <VariableMappingForm key="new" source={null} readOnly={false} />;
  const m = all.find((r) => r.id === id && !r.deleted);
  if (m)
    return (
      <VariableMappingForm
        key={`${m.id}:${mode ?? "view"}`}
        source={m}
        readOnly={mode !== "edit"}
      />
    );
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-8 w-8" />}
        title="Variable Cost Mapping not found"
        action={
          <Button asChild size="sm">
            <Link to="/variable-cost" search={{ tab: "mapping" }}>
              Back to list
            </Link>
          </Button>
        }
      />
    </Panel>
  );
}
