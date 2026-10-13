import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, NativeSelect } from "@/components/movex/common";
import { BusinessRuleError } from "@/services/crudService";
import {
  costGroupService,
  newCostGroupDraft,
  type CostGroupDraft,
} from "@/services/costMasterService";
import type { CostGroupRecord } from "@/types";

/** What the drawer edits: a new group (optionally under a parent) or an existing one. */
export type CostGroupTarget =
  { mode: "new"; parentId: string | null } | { mode: "edit"; group: CostGroupRecord };

/**
 * Create / edit a Cost Group without leaving the Cost page. A Cost Group gathers Cost Codes;
 * its optional Parent Cost Group (shown only here) gathers related groups — two levels at most.
 */
export function CostGroupDrawer({
  target,
  groups,
  onClose,
  onSaved,
  onEditGroup,
}: {
  target: CostGroupTarget | null;
  groups: CostGroupRecord[];
  onClose: () => void;
  onSaved: (g: CostGroupRecord) => void;
  /** Open another group in the drawer (the parent, or one of the groups under this one). */
  onEditGroup: (g: CostGroupRecord) => void;
}) {
  const editing = target?.mode === "edit" ? target.group : null;
  const [d, setD] = useState<CostGroupDraft>(newCostGroupDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!target) return;
    setErrors({});
    setD(
      target.mode === "edit"
        ? {
            code: target.group.code,
            name: target.group.name,
            parentId: target.group.parentId,
            status: target.group.status === "Active" ? "Active" : "Inactive",
            remark: target.group.remark ?? "",
          }
        : { ...newCostGroupDraft(), parentId: target.parentId },
    );
  }, [target]);

  const hasSubs = !!editing && groups.some((g) => g.parentId === editing.id);
  const parents = groups.filter((g) => !g.parentId && g.id !== editing?.id);
  const patch = (p: Partial<CostGroupDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      Object.keys(p).forEach((k) => delete n[k]);
      return n;
    });
  };

  const save = () => {
    try {
      const saved = costGroupService.save(d, editing?.id);
      toast.success(
        editing ? `Cost Group ${saved.code} saved` : `Cost Group ${saved.code} created`,
      );
      onSaved(saved);
    } catch (e) {
      if (e instanceof BusinessRuleError) setErrors(e.fieldErrors);
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const title = editing ? "Edit Cost Group" : "Add Cost Group";
  const savedParent = editing?.parentId ? groups.find((g) => g.id === editing.parentId) : undefined;
  const children = editing ? groups.filter((g) => g.parentId === editing.id) : [];

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs">
            Each Cost Group is a tab on the Cost page. The Parent Cost Group only gathers related
            groups.
          </SheetDescription>
        </SheetHeader>

        <div className="grid flex-1 content-start gap-y-4 overflow-y-auto p-5">
          <Field label="Cost Group Code" required error={errors["code"]}>
            <Input
              value={d.code}
              maxLength={30}
              placeholder="e.g. OCEAN"
              onChange={(e) => patch({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
              aria-invalid={!!errors["code"] || undefined}
            />
          </Field>
          <Field label="Cost Group Name" required error={errors["name"]}>
            <Input
              value={d.name}
              placeholder="e.g. Ocean Freight Cost"
              onChange={(e) => patch({ name: e.target.value })}
              aria-invalid={!!errors["name"] || undefined}
            />
          </Field>
          {/* Two linked pickers on the same parent: choosing a code fills the name and vice versa. */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Parent Cost Group Code"
              error={errors["parentId"]}
              info={
                hasSubs
                  ? "Other Cost Groups sit under this one, so it cannot have a parent itself."
                  : "Optional: the Parent Cost Group that gathers related Cost Groups."
              }
            >
              <NativeSelect
                value={d.parentId ?? ""}
                onChange={(v) => patch({ parentId: v || null })}
                options={["", ...parents.map((g) => g.id)]}
                labels={{
                  "": "— None —",
                  ...Object.fromEntries(parents.map((g) => [g.id, g.code])),
                }}
                disabled={hasSubs}
                invalid={!!errors["parentId"]}
                className="w-full"
              />
            </Field>
            <Field label="Parent Cost Group Name">
              <NativeSelect
                value={d.parentId ?? ""}
                onChange={(v) => patch({ parentId: v || null })}
                options={[
                  "",
                  ...[...parents].sort((a, b) => a.name.localeCompare(b.name)).map((g) => g.id),
                ]}
                labels={{
                  "": "— None —",
                  ...Object.fromEntries(parents.map((g) => [g.id, g.name])),
                }}
                disabled={hasSubs}
                invalid={!!errors["parentId"]}
                className="w-full"
              />
            </Field>
          </div>
          {(savedParent || children.length > 0) && (
            <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {savedParent && (
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => onEditGroup(savedParent)}
                >
                  Edit parent group ({savedParent.code})
                </button>
              )}
              {children.length > 0 && (
                <>
                  <span className="text-muted-foreground">Groups under it:</span>
                  {children.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => onEditGroup(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
          <Field label="Status">
            <label className="flex h-9 items-center gap-2 text-sm">
              <Switch
                checked={d.status === "Active"}
                onCheckedChange={(v) => patch({ status: v ? "Active" : "Inactive" })}
              />
              {d.status}
            </label>
          </Field>
          <Field label="Remark">
            <Textarea
              rows={3}
              value={d.remark}
              onChange={(e) => patch({ remark: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
