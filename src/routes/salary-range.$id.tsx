import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { SalaryRangeForm } from "@/components/movex/cost/SalaryRangeForm";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/salary-range/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Add Salary Range — MoveX" : "Salary Range — MoveX" }],
  }),
  component: SalaryRangePage,
});

function SalaryRangePage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(salaryRangeRepository);
  if (id === "new") return <SalaryRangeForm key="new" source={null} readOnly={false} />;
  const r = all.find((x) => x.id === id && !x.deleted);
  if (r)
    return (
      <SalaryRangeForm key={`${r.id}:${mode ?? "view"}`} source={r} readOnly={mode !== "edit"} />
    );
  return (
    <Panel>
      <EmptyState
        icon={<XCircle className="h-8 w-8" />}
        title="Salary Range not found"
        action={
          <Button asChild size="sm">
            <Link to="/variable-cost" search={{ tab: "salary" }}>
              Back to list
            </Link>
          </Button>
        }
      />
    </Panel>
  );
}
