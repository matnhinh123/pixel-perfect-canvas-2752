import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, NativeSelect, Panel } from "@/components/movex/common";
import { CostDetailForm, CostGroupForm, type CostKind } from "@/components/movex/cost/CostForms";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost/$id")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { mode?: Mode; type?: CostKind; group?: string } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(s["type"] === "group" || s["type"] === "detail" ? { type: s["type"] } : {}),
    ...(typeof s["group"] === "string" ? { group: s["group"] } : {}),
  }),
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Cost — MoveX" : "Cost — MoveX" }],
  }),
  component: CostPage,
});

function CostPage() {
  const { id } = Route.useParams();
  const { mode, type, group } = Route.useSearch();
  const navigate = useNavigate();
  const groups = useCollection(costGroupRepository);
  const items = useCollection(costItemRepository);

  if (id === "new") {
    const kind: CostKind = type ?? "detail";
    const typeSwitch = (
      <TypeSwitch
        value={kind}
        onChange={(t) =>
          void navigate({
            to: "/cost/$id",
            params: { id: "new" },
            search: { type: t, ...(group ? { group } : {}) },
            replace: true,
          })
        }
      />
    );
    return kind === "group" ? (
      <CostGroupForm key="new-group" source={null} readOnly={false} typeSwitch={typeSwitch} />
    ) : (
      <CostDetailForm
        key="new-detail"
        source={null}
        readOnly={false}
        typeSwitch={typeSwitch}
        {...(group ? { initialGroupId: group } : {})}
      />
    );
  }

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

/** Create only: what is being created (a small select at the start of the form). */
function TypeSwitch({ value, onChange }: { value: CostKind; onChange: (v: CostKind) => void }) {
  return (
    <NativeSelect
      value={value}
      onChange={(v) => onChange(v as CostKind)}
      options={["group", "detail"]}
      labels={{ group: "Cost Group", detail: "Cost Detail" }}
      className="w-full"
    />
  );
}
