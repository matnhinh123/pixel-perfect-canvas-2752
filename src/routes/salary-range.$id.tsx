import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { SalaryRangeForm } from "@/components/movex/cost/SalaryRangeForm";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";
import { atVersion, versionOf } from "@/services/cost/versions";
import { useDisplayCurrency } from "@/lib/displayCurrency";

type Mode = "view" | "edit";

export const Route = createFileRoute("/salary-range/$id")({
  // `version`: an earlier version to look at (read-only).
  validateSearch: (s: Record<string, unknown>): { mode?: Mode; version?: number } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(Number(s["version"]) > 0 ? { version: Number(s["version"]) } : {}),
  }),
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Add Salary Range — MoveX" : "Salary Range — MoveX" }],
  }),
  component: SalaryRangePage,
});

function SalaryRangePage() {
  const { id } = Route.useParams();
  const { mode, version } = Route.useSearch();
  const all = useCollection(salaryRangeRepository);
  // USD picked (next to History): amounts converted, view only.
  const { usd } = useDisplayCurrency();
  if (id === "new") return <SalaryRangeForm key="new" source={null} readOnly={false} />;
  const r = all.find((x) => x.id === id && !x.deleted);
  if (r) {
    // An earlier version: shown as it was, read-only.
    const old =
      version && version !== versionOf(r) && r.history?.some((h) => h.version === version)
        ? version
        : undefined;
    return (
      <SalaryRangeForm
        key={`${r.id}:${mode ?? "view"}:${old ?? "current"}`}
        source={old ? atVersion(r, old) : r}
        live={r}
        readOnly={mode !== "edit" || !!old}
      />
    );
  }
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
