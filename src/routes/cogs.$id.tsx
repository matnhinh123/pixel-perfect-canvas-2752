import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { CogsForm } from "@/components/movex/cost/CogsForm";
import { useCollection } from "@/hooks/use-store";
import { cogsRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cogs/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create COGS — MoveX" : "COGS — MoveX" }],
  }),
  component: CogsPage,
});

function CogsPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(cogsRepository);
  if (id === "new") return <CogsForm key="new" source={null} readOnly={false} />;
  const c = all.find((r) => r.id === id && !r.deleted);
  if (c)
    return <CogsForm key={`${c.id}:${mode ?? "view"}`} source={c} readOnly={mode !== "edit"} />;
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-8 w-8" />}
        title="COGS not found"
        action={
          <Button asChild size="sm">
            <Link to="/cogs">Back to list</Link>
          </Button>
        }
      />
    </Panel>
  );
}
