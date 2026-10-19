import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FolderTree, Receipt, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/movex/common";
import { CostDetailForm, CostGroupForm, type CostKind } from "@/components/movex/cost/CostForms";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import { cn } from "@/lib/utils";

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

/** Create only: what is being created. */
function TypeSwitch({ value, onChange }: { value: CostKind; onChange: (v: CostKind) => void }) {
  const options: { v: CostKind; label: string; hint: string; icon: typeof Receipt }[] = [
    { v: "group", label: "Cost Group", hint: "A group that holds Cost Details", icon: FolderTree },
    { v: "detail", label: "Cost Detail", hint: "A cost that belongs to a group", icon: Receipt },
  ];
  return (
    <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold">
        Type<span className="ml-0.5 text-destructive">*</span>
      </div>
      <div role="radiogroup" aria-label="Type" className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              value === o.v
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-primary/40",
            )}
          >
            <o.icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                value === o.v ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
