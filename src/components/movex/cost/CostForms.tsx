// Create / view / edit forms of the Cost screen: a Cost Group or a Cost Detail, both under /cost.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, StatusBadge, Tag } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { ServiceMultiTree } from "@/components/movex/cost/ServiceMultiTree";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import {
  CollapsiblePanel,
  ReadOnlyScope,
  S2,
  S3,
  S4,
  S12,
} from "@/components/movex/general/FormParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository, serviceRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  costGroupService,
  costItemService,
  draftOfCostItem,
  newCostGroupDraft,
  newCostItemDraft,
  parentOptions,
  type CostGroupDraft,
  type CostItemDraft,
} from "@/services/costMasterService";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { COST_CURRENCIES, COST_TAX_EVIDENCES, COST_TAX_TARIFFS } from "@/mock-data/costMaster";
import type { CostGroupRecord, CostItemRecord } from "@/types";

export type CostKind = "group" | "detail";

const BASE = "/cost";

/** Header crumbs + title shared by both forms. */
function useHeader(kind: CostKind, code: string | undefined, isNew: boolean, readOnly: boolean) {
  const label = kind === "group" ? "Cost Group" : "Cost Detail";
  return {
    crumbs: [
      { label: "Cost", to: BASE },
      ...(code ? [{ label: code }] : []),
      { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
    ],
    title: isNew ? "Create Cost" : readOnly ? `${label} Detail #${code}` : `Edit ${label} #${code}`,
  };
}

function FormFooter({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-8 mt-6 flex items-center justify-end gap-2 border-t bg-card/95 px-8 py-3 backdrop-blur">
      <Button variant="outline" size="lg" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="lg" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

function HeaderExtra({
  id,
  readOnly,
  onHistory,
}: {
  id: string;
  readOnly: boolean;
  onHistory: () => void;
}) {
  return (
    <>
      <Button variant="outline" size="lg" onClick={onHistory}>
        <History className="h-4 w-4" />
        History
      </Button>
      {readOnly && (
        <Button asChild size="lg">
          <Link to="/cost/$id" params={{ id }} search={{ mode: "edit" }}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Cost Group

const draftOfGroup = (g: CostGroupRecord): CostGroupDraft => ({
  code: g.code,
  name: g.name,
  parentId: g.parentId,
  status: g.status === "Active" ? "Active" : "Inactive",
  remark: g.remark,
});

export function CostGroupForm({
  source,
  readOnly,
  typeSwitch,
}: {
  source: CostGroupRecord | null;
  readOnly: boolean;
  /** Create only: the Cost Group / Cost Detail choice. */
  typeSwitch?: ReactNode;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const groupsAll = useCollection(costGroupRepository);
  const itemsAll = useCollection(costItemRepository);
  const groups = useMemo(() => groupsAll.filter((g) => !g.deleted), [groupsAll]);
  const parents = useMemo(
    () => parentOptions(source?.id).filter((g) => groups.some((x) => x.id === g.id)),
    [groups, source?.id],
  );
  const initial = useMemo<CostGroupDraft>(
    () => (source ? draftOfGroup(source) : newCostGroupDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const header = useHeader("group", source?.code, isNew, readOnly);

  const patch = (p: Partial<CostGroupDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const childGroups = source ? groups.filter((g) => g.parentId === source.id) : [];
  const costs = source ? itemsAll.filter((c) => !c.deleted && c.groupId === source.id) : [];

  const back = () =>
    source
      ? void navigate({ to: "/cost/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: BASE });
  const save = () => {
    setFormError(null);
    try {
      const saved = costGroupService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Cost Group ${saved.code} created` : `Cost Group ${saved.code} saved`);
      void navigate({ to: "/cost/$id", params: { id: saved.id }, search: { mode: "view" } });
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
        crumbs={header.crumbs}
        title={header.title}
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: BASE }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <HeaderExtra
              id={source.id}
              readOnly={readOnly}
              onHistory={() => setHistoryOpen(true)}
            />
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />
      {typeSwitch}

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <CollapsiblePanel title="Cost Group">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="Group Code" required error={errors["code"]} className={S2}>
              <Input
                placeholder="e.g. ROAD"
                maxLength={30}
                value={d.code}
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Group Name" required error={errors["name"]} className={S4}>
              <Input
                placeholder="e.g. Road Cost"
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Parent Group" error={errors["parentId"]} className={S4}>
              <NativeSelect
                className="w-full"
                value={d.parentId ?? ""}
                invalid={!!errors["parentId"]}
                onChange={(v) => patch({ parentId: v || null })}
                options={["", ...parents.map((g) => g.id)]}
                labels={{
                  "": readOnly ? "—" : "— None (top-level group)",
                  ...Object.fromEntries(parents.map((g) => [g.id, `${g.code} - ${g.name}`])),
                }}
              />
            </Field>
            <Field label="Status" required className={S2}>
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
              <Field label={`Child groups (${childGroups.length})`} className={S4}>
                <TagList items={childGroups.map((g) => `${g.code} - ${g.name}`)} />
              </Field>
              <Field
                label={`Cost Details in this group (${costs.length})`}
                className="lg:col-span-8"
              >
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

      {!readOnly && <FormFooter onCancel={back} onSave={save} />}
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

/** Read-only chips ("—" when empty); the related records are edited on their own form. */
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

// ---------------------------------------------------------------- Cost Detail

export function CostDetailForm({
  source,
  readOnly,
  typeSwitch,
  initialGroupId,
}: {
  source: CostItemRecord | null;
  readOnly: boolean;
  typeSwitch?: ReactNode;
  /** Create only: group picked in advance (e.g. "Add Cost Detail" from a group). */
  initialGroupId?: string;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const groupsAll = useCollection(costGroupRepository);
  const servicesAll = useCollection(serviceRepository);
  const groups = useMemo(() => groupsAll.filter((g) => !g.deleted), [groupsAll]);
  const services = useMemo(() => servicesAll.filter((s) => !s.deleted), [servicesAll]);
  const initial = useMemo<CostItemDraft>(
    () =>
      source ? draftOfCostItem(source) : { ...newCostItemDraft(), groupId: initialGroupId ?? "" },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const header = useHeader("detail", source?.code, isNew, readOnly);
  const taxEvidences = useCodeOptions(CC.TAX_EVIDENCE, COST_TAX_EVIDENCES);
  const taxTariffs = useCodeOptions(CC.TAX_TARIFF, COST_TAX_TARIFFS);

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

  const back = () =>
    source
      ? void navigate({ to: "/cost/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: BASE });
  const save = () => {
    setFormError(null);
    try {
      const saved = costItemService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Cost Detail ${saved.code} added` : `Cost Detail ${saved.code} saved`);
      void navigate({ to: "/cost/$id", params: { id: saved.id }, search: { mode: "view" } });
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
        crumbs={header.crumbs}
        title={header.title}
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: BASE }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <HeaderExtra
              id={source.id}
              readOnly={readOnly}
              onHistory={() => setHistoryOpen(true)}
            />
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />
      {typeSwitch}

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <CollapsiblePanel title="Cost Detail">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              label="Cost Code"
              required
              error={errors["code"]}
              className={S2}
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
            <Field label="Status" required className={S2}>
              <label className="flex h-10 cursor-pointer items-center gap-3 group-disabled:cursor-default">
                <Switch
                  checked={d.status === "Active"}
                  onCheckedChange={(c) => patch({ status: c ? "Active" : "Inactive" })}
                />
                <span className="text-sm">{d.status}</span>
              </label>
            </Field>
            <Field
              label="Cost Group"
              error={errors["groupId"]}
              className={S4}
              info="The group this Cost Detail belongs to."
            >
              <NativeSelect
                {...select(
                  "groupId",
                  withCurrent(
                    groups.map((g) => g.id),
                    d.groupId,
                  ),
                  "Select Cost Group",
                  Object.fromEntries(groups.map((g) => [g.id, `${g.code} - ${g.name}`])),
                )}
              />
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
            <Field label="Tax Evidence" className={S3}>
              <NativeSelect
                {...select(
                  "taxEvidence",
                  withCurrent(taxEvidences, d.taxEvidence),
                  "Select Tax Evidence",
                )}
              />
            </Field>
            <Field label="Def Currency" className={S2}>
              <NativeSelect {...select("currency", COST_CURRENCIES, "Select currency")} />
            </Field>
            <Field label="Default Tax Tariff" className={S2}>
              <NativeSelect
                {...select(
                  "taxTariff",
                  withCurrent(taxTariffs, d.taxTariff),
                  "Select Default Tax Tariff",
                )}
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

      {!readOnly && <FormFooter onCancel={back} onSave={save} />}
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
