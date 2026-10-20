import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { CostDetailForm } from "@/components/movex/cost/CostForms";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Fare Detail — MoveX" : "Fare Detail — MoveX" }],
  }),
  component: CostPage,
});

function CostPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const items = useCollection(costItemRepository);
  if (id === "new") return <CostDetailForm key="new" source={null} readOnly={false} />;
  const c = items.find((r) => r.id === id && !r.deleted);
  // `key` resets the form state when switching between records / modes.
  if (c)
    return (
      <CostDetailForm key={`${c.id}:${mode ?? "view"}`} source={c} readOnly={mode !== "edit"} />
    );
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-8 w-8" />}
        title="Fare Detail not found"
        action={
          <Button asChild size="sm">
            <Link to="/cost">Back to list</Link>
          </Button>
        }
      />
    </Panel>
  );
}
