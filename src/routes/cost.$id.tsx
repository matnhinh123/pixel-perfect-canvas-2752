import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { CostDetailForm, CostGroupForm } from "@/components/movex/cost/CostForms";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode; group?: string } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(typeof s["group"] === "string" ? { group: s["group"] } : {}),
  }),
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Cost Detail — MoveX" : "Cost — MoveX" }],
  }),
  component: CostPage,
});

function CostPage() {
  const { id } = Route.useParams();
  const { mode, group } = Route.useSearch();
  const groups = useCollection(costGroupRepository);
  const items = useCollection(costItemRepository);

  // Add Cost creates a Cost Detail (the group can be picked in advance: "Add Cost Detail" on a group).
  if (id === "new")
    return (
      <CostDetailForm
        key="new"
        source={null}
        readOnly={false}
        {...(group ? { initialGroupId: group } : {})}
      />
    );

  // `key` resets the form state when switching between records / modes.
  const g = groups.find((r) => r.id === id && !r.deleted);
  if (g)
    return (
      <CostGroupForm key={`${g.id}:${mode ?? "view"}`} source={g} readOnly={mode !== "edit"} />
    );
  const c = items.find((r) => r.id === id && !r.deleted);
  if (c)
    return (
      <CostDetailForm key={`${c.id}:${mode ?? "view"}`} source={c} readOnly={mode !== "edit"} />
    );
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-8 w-8" />}
        title="Cost not found"
        action={
          <Button asChild size="sm">
            <Link to="/cost">Back to list</Link>
          </Button>
        }
      />
    </Panel>
  );
}
