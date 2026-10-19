import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Panel, StatusBadge, Tag } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { CollapsiblePanel, ReadOnlyScope, S3, S12 } from "@/components/movex/general/FormParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  costGroupService,
  newCostGroupDraft,
  type CostGroupDraft,
} from "@/services/costMasterService";
import type { CostGroupRecord } from "@/types";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost-group/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Create Cost Group — MoveX" : "Cost Group Detail — MoveX" },
    ],
  }),
  component: CostGroupPage,
});

const draftOf = (g: CostGroupRecord): CostGroupDraft => ({
  code: g.code,
  name: g.name,
  status: g.status === "Active" ? "Active" : "Inactive",
  remark: g.remark,
});

function CostGroupPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(costGroupRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Cost Group not found"
          action={
            <Button asChild size="sm">
              <Link to="/cost-group">Back to list</Link>
            </Button>
          }
        />
      </Panel>
    );
  // `key` resets the form state when switching between records / modes.
  return (
    <CostGroupForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

function CostGroupForm({
  source,
  readOnly,
}: {
  source: CostGroupRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const itemsAll = useCollection(costItemRepository);

  const initial = useMemo<CostGroupDraft>(
    () => (source ? draftOf(source) : newCostGroupDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<CostGroupDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };

  const costs = source ? itemsAll.filter((c) => !c.deleted && c.groupId === source.id) : [];

  const back = () =>
    source
      ? void navigate({
          to: "/cost-group/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/cost-group" });

  const save = () => {
    setFormError(null);
    try {
      const saved = costGroupService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Cost Group ${saved.code} created` : `Cost Group ${saved.code} saved`);
      void navigate({ to: "/cost-group/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Cost Group", to: "/cost-group" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Create Cost Group"
            : readOnly
              ? `Cost Group Detail #${source.code}`
              : `Edit Cost Group #${source.code}`
        }
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/cost-group" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
              {readOnly && (
                <Button asChild size="lg">
                  <Link to="/cost-group/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <CollapsiblePanel title="Cost Group">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="Group Code" required error={errors["code"]} className={S3}>
              <Input
                placeholder="e.g. ROAD"
                maxLength={30}
                value={d.code}
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Group Name" required error={errors["name"]} className={S3}>
              <Input
                placeholder="e.g. Road Cost"
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Status" required className={S3}>
              <label className="flex h-10 cursor-pointer items-center gap-3">
                <Switch
                  checked={d.status === "Active"}
                  onCheckedChange={(c) => patch({ status: c ? "Active" : "Inactive" })}
                />
                <span className="text-sm">{d.status}</span>
              </label>
            </Field>
          </div>
        </CollapsiblePanel>

        {source && (
          <CollapsiblePanel title="Related">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
              <Field label={`Costs in this group (${costs.length})`} className={S12}>
                <TagList items={costs.map((c) => `${c.code} - ${c.name}`)} />
              </Field>
            </div>
          </CollapsiblePanel>
        )}

        <CollapsiblePanel title="Remark">
          <Field label="Remark" className={S12}>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="Enter Remark"
              value={d.remark}
              onChange={(e) => patch({ remark: e.target.value })}
            />
          </Field>
        </CollapsiblePanel>
      </ReadOnlyScope>

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-8 mt-6 flex items-center justify-end gap-2 border-t bg-card/95 px-8 py-3 backdrop-blur">
          <Button variant="outline" size="lg" onClick={back}>
            Cancel
          </Button>
          <Button size="lg" onClick={save}>
            Save
          </Button>
        </div>
      )}

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Cost Group"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}

/** Read-only chips ("—" when empty); the owner edits the related records on their own screens. */
function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span className="flex h-10 items-center text-muted-foreground">—</span>;
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 py-1">
      {items.map((t) => (
        <Tag key={t}>{t}</Tag>
      ))}
    </div>
  );
}
