import { useState, type ReactNode } from "react";
import { CheckCircle2, Pencil, Save, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, NativeSelect, StatusBadge } from "@/components/movex/common";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { BusinessRuleError } from "@/services/crudService";
import {
  costGroupCrud,
  costGroupService,
  groupName,
  newCostGroupDraft,
  parentOptions,
  validateCostGroup,
  type CostGroupDraft,
} from "@/services/costMasterService";
import type { CostGroupRecord, Status } from "@/types";

export type CostGroupDrawerState =
  { mode: "view"; id: string } | { mode: "edit"; id: string } | { mode: "create" };

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

/** Cost Group detail (read-only) and Create / Edit (one shared form) in a right-side drawer. */
export function CostGroupDrawer({
  state,
  groups,
  onChange,
}: {
  state: CostGroupDrawerState | null;
  groups: CostGroupRecord[];
  onChange: (s: CostGroupDrawerState | null) => void;
}) {
  const group =
    state && state.mode !== "create" ? groups.find((g) => g.id === state.id) : undefined;
  const close = () => onChange(null);
  return (
    <Sheet open={!!state} onOpenChange={(o) => !o && close()}>
      <SheetContent className="flex w-[480px] flex-col overflow-y-auto sm:max-w-[480px]">
        {state?.mode === "view" && group && (
          <GroupView
            group={group}
            groups={groups}
            onClose={close}
            onEdit={() => onChange({ mode: "edit", id: group.id })}
          />
        )}
        {state && state.mode !== "view" && (
          <GroupForm
            key={state.mode === "edit" ? state.id : "new"}
            group={group}
            onCancel={() => (group ? onChange({ mode: "view", id: group.id }) : close())}
            onSaved={(g) => onChange({ mode: "view", id: g.id })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupView({
  group,
  groups,
  onClose,
  onEdit,
}: {
  group: CostGroupRecord;
  groups: CostGroupRecord[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const actions = useEntityActions(costGroupCrud, "en");
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {group.name}
          <StatusBadge status={group.status} />
        </SheetTitle>
        <SheetDescription>{group.code}</SheetDescription>
      </SheetHeader>
      <dl className="grid flex-1 grid-cols-2 content-start gap-x-6 gap-y-4 px-4">
        <InfoRow label="Group Code">
          <span className="font-semibold">{group.code}</span>
        </InfoRow>
        <InfoRow label="Group Name">{group.name}</InfoRow>
        <InfoRow label="Parent Group">{groupName(group.parentId, groups)}</InfoRow>
        <InfoRow label="Status">
          <StatusBadge status={group.status} />
        </InfoRow>
        <div className="col-span-2">
          <InfoRow label="Remark">{group.remark}</InfoRow>
        </div>
      </dl>
      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {group.status === "Inactive" ? (
          <Button variant="outline" onClick={() => void actions.setStatus([group], "Active")}>
            <CheckCircle2 className="h-4 w-4" />
            Activate
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void actions.setStatus([group], "Inactive")}>
            <XCircle className="h-4 w-4" />
            Deactivate
          </Button>
        )}
        <Button onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </SheetFooter>
    </>
  );
}

function GroupForm({
  group,
  onCancel,
  onSaved,
}: {
  group: CostGroupRecord | undefined;
  onCancel: () => void;
  onSaved: (g: CostGroupRecord) => void;
}) {
  const [d, setD] = useState<CostGroupDraft>(() =>
    group
      ? {
          code: group.code,
          name: group.name,
          parentId: group.parentId,
          status: group.status === "Active" ? "Active" : "Inactive",
          remark: group.remark,
        }
      : newCostGroupDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const parents = parentOptions(group?.id);
  const set = <K extends keyof CostGroupDraft>(k: K, v: CostGroupDraft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  const save = () => {
    const e = validateCostGroup(d, group?.id);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    try {
      const saved = costGroupService.save(d, group?.id);
      toast.success(group ? `Cost Group ${saved.code} saved` : `Cost Group ${saved.code} created`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      else toast.error("Save failed");
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{group ? "Edit Cost Group" : "Add Cost Group"}</SheetTitle>
        <SheetDescription>{group ? group.code : "New cost group"}</SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 grid-cols-2 content-start gap-4 px-4">
        <Field label="Group Code" required error={errors["code"]}>
          <Input
            value={d.code}
            placeholder="e.g. ROAD"
            aria-invalid={!!errors["code"] || undefined}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Group Name" required error={errors["name"]}>
          <Input
            value={d.name}
            placeholder="e.g. Road Cost"
            aria-invalid={!!errors["name"] || undefined}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Parent Group" error={errors["parentId"]}>
          <NativeSelect
            value={d.parentId ?? ""}
            invalid={!!errors["parentId"]}
            onChange={(v) => set("parentId", v || null)}
            options={["", ...parents.map((g) => g.id)]}
            labels={{ "": "— None", ...Object.fromEntries(parents.map((g) => [g.id, g.name])) }}
          />
        </Field>
        <Field label="Status" required>
          <NativeSelect
            value={d.status}
            onChange={(v) => set("status", v as Status)}
            options={["Active", "Inactive"]}
          />
        </Field>
        <Field label="Remark" className="col-span-2">
          <Textarea rows={3} value={d.remark} onChange={(e) => set("remark", e.target.value)} />
        </Field>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button onClick={save}>
          <Save className="h-4 w-4" />
          Save
        </Button>
      </SheetFooter>
    </>
  );
}
