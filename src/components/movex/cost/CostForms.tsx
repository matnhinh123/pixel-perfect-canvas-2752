// Create / view / edit form of a Cost Detail (the Cost screen, /cost).
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, StatusBadge } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { ServiceMultiTree } from "@/components/movex/cost/ServiceMultiTree";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { CollapsiblePanel, ReadOnlyScope, S2, S3, S12 } from "@/components/movex/general/FormParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository, serviceRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  costItemService,
  draftOfCostItem,
  newCostItemDraft,
  type CostItemDraft,
  usedGroups,
  usedSubGroups,
} from "@/services/costMasterService";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { cn } from "@/lib/utils";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { COST_CURRENCIES, COST_TAX_EVIDENCES, COST_TAX_TARIFFS } from "@/mock-data/costMaster";
import type { CostItemRecord } from "@/types";

const BASE = "/cost";
/** Five of the 12 columns: Cost Name and Local Name side by side, same width. */
const S5 = "sm:col-span-3 lg:col-span-5";

/** Header crumbs + title. */
function useHeader(code: string | undefined, isNew: boolean, readOnly: boolean) {
  const label = "Cost Detail";
  return {
    crumbs: [
      { label: "Cost", to: BASE },
      ...(code ? [{ label: code }] : []),
      { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
    ],
    title: isNew
      ? `Create ${label}`
      : readOnly
        ? `${label} Detail #${code}`
        : `Edit ${label} #${code}`,
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

/** Status select in the header while editing (a new record starts Active). */
function StatusSelect({
  value,
  onChange,
}: {
  value: "Active" | "Inactive";
  onChange: (v: "Active" | "Inactive") => void;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full",
          value === "Active" ? "bg-success" : "bg-muted-foreground",
        )}
      />
      <select
        aria-label="Status"
        value={value}
        onChange={(e) => onChange(e.target.value as "Active" | "Inactive")}
        className="h-11 appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

function HeaderExtra({
  id,
  readOnly,
  onHistory,
  status,
}: {
  id: string;
  readOnly: boolean;
  onHistory: () => void;
  status?: ReactNode;
}) {
  return (
    <>
      {!readOnly && status}
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

// ---------------------------------------------------------------- Cost Detail

export function CostDetailForm({
  source,
  readOnly,
}: {
  source: CostItemRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const groupsAll = useCollection(costGroupRepository);
  const servicesAll = useCollection(serviceRepository);
  const services = useMemo(() => servicesAll.filter((s) => !s.deleted), [servicesAll]);
  const initial = useMemo<CostItemDraft>(
    () => (source ? draftOfCostItem(source) : newCostItemDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const header = useHeader(source?.code, isNew, readOnly);
  const taxEvidences = useCodeOptions(CC.TAX_EVIDENCE, COST_TAX_EVIDENCES);
  const taxTariffs = useCodeOptions(CC.TAX_TARIFF, COST_TAX_TARIFFS);
  const itemsAll = useCollection(costItemRepository);
  const live = useMemo(() => itemsAll.filter((c) => !c.deleted), [itemsAll]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupNames = useMemo(() => usedGroups(live), [live, groupsAll]);
  const subGroups = useMemo(() => usedSubGroups(live), [live]);

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
              status={
                <StatusSelect
                  value={d.status === "Active" ? "Active" : "Inactive"}
                  onChange={(status) => patch({ status })}
                />
              }
            />
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

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
            <Field label="Cost Name" required error={errors["name"]} className={S5}>
              <Input placeholder="Enter Cost Name" {...text("name")} />
            </Field>
            <Field label="Local Name" error={errors["localName"]} className={S5}>
              <Input placeholder="Enter Local Name" {...text("localName")} />
            </Field>
            <Field
              label="Group Name"
              error={errors["group"]}
              className={S3}
              info="Pick a group from the list, or type a new one: it is saved with this Cost Detail."
            >
              <SuggestInput
                value={d.group}
                onChange={(v) => patch({ group: v })}
                suggestions={groupNames}
                placeholder="Enter Group Name"
              />
            </Field>
            <Field
              label="Sub Group Name"
              error={errors["subGroup"]}
              className={S3}
              info="Pick a sub group already used, or type a new one: it is saved with this Cost Detail."
            >
              <SuggestInput
                value={d.subGroup}
                onChange={(v) => patch({ subGroup: v })}
                suggestions={subGroups}
                placeholder="Enter Sub Group Name"
              />
            </Field>
            <Field label="Tax Evidence" className={S2}>
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
            <Field label="Remark" className={S12}>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Enter Remark"
                value={d.remark}
                onChange={(e) => patch({ remark: e.target.value })}
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
