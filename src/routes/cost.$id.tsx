import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { ServiceMultiTree } from "@/components/movex/cost/ServiceMultiTree";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { CollapsiblePanel, ReadOnlyScope, S4, S12 } from "@/components/movex/general/FormParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository, serviceRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  costItemService,
  draftOfCostItem,
  newCostItemDraft,
  type CostItemDraft,
} from "@/services/costMasterService";
import {
  COST_CURRENCIES,
  COST_TAX_EVIDENCES,
  COST_TAX_TARIFFS,
  COST_UOM_CATALOG,
} from "@/mock-data/costMaster";
import type { CostItemRecord } from "@/types";

type Mode = "view" | "edit";

export const Route = createFileRoute("/cost/$id")({
  // `group`: Cost Group id pre-filled on a new Cost (from the group tab it was added in).
  // `from=cost-2`: opened from the "Cost 2" page, so Back / breadcrumb return there.
  validateSearch: (
    s: Record<string, unknown>,
  ): { mode?: Mode; group?: string; from?: "cost-2" } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(typeof s["group"] === "string" && s["group"] ? { group: s["group"] } : {}),
    ...(s["from"] === "cost-2" ? { from: "cost-2" as const } : {}),
  }),
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Cost — MoveX" : "Cost Detail — MoveX" }],
  }),
  component: CostPage,
});

function CostPage() {
  const { id } = Route.useParams();
  const { mode, from } = Route.useSearch();
  const listPath = from === "cost-2" ? "/cost-2" : "/cost";
  const all = useCollection(costItemRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Cost not found"
          action={
            <Button asChild size="sm">
              <Link to={listPath}>Back to list</Link>
            </Button>
          }
        />
      </Panel>
    );
  // `key` resets the form state when switching between records / modes.
  return (
    <CostForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

function CostForm({ source, readOnly }: { source: CostItemRecord | null; readOnly: boolean }) {
  const { group: presetGroup, from } = Route.useSearch();
  const listPath = from === "cost-2" ? "/cost-2" : "/cost";
  const keepFrom = from ? { from } : {};
  const navigate = useNavigate();
  const isNew = !source;
  const groupsAll = useCollection(costGroupRepository);
  const servicesAll = useCollection(serviceRepository);
  const groups = useMemo(() => groupsAll.filter((g) => !g.deleted), [groupsAll]);
  const services = useMemo(() => servicesAll.filter((s) => !s.deleted), [servicesAll]);

  const initial = useMemo<CostItemDraft>(
    () =>
      source
        ? draftOfCostItem(source)
        : {
            ...newCostItemDraft(),
            groupId: groups.some((g) => g.id === presetGroup) ? presetGroup! : "",
          },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<CostItemDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const text = (k: "code" | "name" | "localName") => ({
    value: d[k],
    onChange: (e: { target: { value: string } }) =>
      patch({ [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value }),
    "aria-invalid": !!errors[k] || undefined,
  });
  const select = (
    k: keyof CostItemDraft,
    options: readonly string[],
    placeholder: string,
    labels: Record<string, string> = {},
  ): Parameters<typeof NativeSelect>[0] => ({
    value: String(d[k] ?? ""),
    onChange: (v) => patch({ [k]: v }),
    options: ["", ...options],
    labels: { "": readOnly ? "—" : placeholder, ...labels },
    className: "w-full",
    invalid: !!errors[k],
  });

  const groupIds = groups.map((g) => g.id);
  // Keep a stored group selectable even if it was deactivated / removed from the list.
  const uoms = COST_UOM_CATALOG[d.uomCategory] ?? [];

  const back = () =>
    source
      ? void navigate({
          to: "/cost/$id",
          params: { id: source.id },
          search: { mode: "view", ...keepFrom },
        })
      : void navigate({ to: listPath });

  const save = () => {
    setFormError(null);
    try {
      const saved = costItemService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Cost ${saved.code} added` : `Cost ${saved.code} saved`);
      void navigate({
        to: "/cost/$id",
        params: { id: saved.id },
        search: { mode: "view", ...keepFrom },
      });
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
          { label: "Cost", to: listPath },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Create Cost"
            : readOnly
              ? `Cost Detail #${source.code}`
              : `Edit Cost #${source.code}`
        }
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: listPath }) : back())}
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
                  <Link
                    to="/cost/$id"
                    params={{ id: source.id }}
                    search={{ mode: "edit", ...keepFrom }}
                  >
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
        <CollapsiblePanel title="Cost">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              label="Cost Code"
              required
              error={errors["code"]}
              className={S4}
              info="Unique, upper-case. 2–30 characters: letters, digits, - or _."
            >
              <Input placeholder="Enter Cost Code" maxLength={30} {...text("code")} />
            </Field>
            <Field label="Cost Name" required error={errors["name"]} className={S4}>
              <Input placeholder="Enter Cost Name" {...text("name")} />
            </Field>
            <Field label="Local Name" required error={errors["localName"]} className={S4}>
              <Input placeholder="Enter Local Name" {...text("localName")} />
            </Field>
            <Field label="Cost Group Code" className={S4}>
              <NativeSelect
                {...select(
                  "groupId",
                  groupIds,
                  "Select Cost Group Code",
                  Object.fromEntries(groups.map((g) => [g.id, `${g.code} - ${g.name}`])),
                )}
              />
            </Field>
            <Field label="Cost Group Name" className={S4}>
              <NativeSelect
                {...select(
                  "groupId",
                  groupIds,
                  "Select Cost Group Name",
                  Object.fromEntries(groups.map((g) => [g.id, `${g.name} (${g.code})`])),
                )}
              />
            </Field>
            <Field label="Status" required className={S4}>
              <label className="flex h-10 cursor-pointer items-center gap-3 group-disabled:cursor-default">
                <Switch
                  checked={d.status === "Active"}
                  onCheckedChange={(c) => patch({ status: c ? "Active" : "Inactive" })}
                />
                <span className="text-sm">{d.status}</span>
              </label>
            </Field>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Service">
          <Field label="Services" className={S12}>
            <ServiceMultiTree
              services={services}
              value={d.serviceIds}
              onChange={(ids) => patch({ serviceIds: ids })}
              disabled={readOnly}
            />
          </Field>
        </CollapsiblePanel>

        <CollapsiblePanel title="Other Information">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="Tax Evidence" className={S4}>
              <NativeSelect {...select("taxEvidence", COST_TAX_EVIDENCES, "Select Tax Evidence")} />
            </Field>
            <Field label="Def Currency" className={S4}>
              <NativeSelect {...select("currency", COST_CURRENCIES, "Select currency")} />
            </Field>
            <Field label="Default Tax Tariff" className={S4}>
              <NativeSelect
                {...select("taxTariff", COST_TAX_TARIFFS, "Select Default Tax Tariff")}
              />
            </Field>
            <Field label="Category UoM" error={errors["uomCategory"]} className={S4}>
              <NativeSelect
                {...{
                  ...select("uomCategory", Object.keys(COST_UOM_CATALOG), "Select Category UoM"),
                  onChange: (v) => patch({ uomCategory: v, uom: "" }),
                }}
              />
            </Field>
            <Field label="Def UoM" className={S4}>
              <NativeSelect
                {...{
                  ...select("uom", uoms, "Select UoM"),
                  disabled: readOnly || !d.uomCategory,
                }}
              />
            </Field>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Remark">
          <Field label="Remark">
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
          entityType="Cost"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
