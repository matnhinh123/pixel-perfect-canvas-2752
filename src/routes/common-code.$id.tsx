import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, Lock, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, NativeSelect, Panel, Tag } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  commonCodeService,
  nextOptionCode,
  type CommonCodeDraft,
} from "@/services/commonCodeService";
import type { CommonCodeRecord } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/common-code/$id")({
  head: () => ({ meta: [{ title: "Common Code — MoveX" }] }),
  component: CommonCodePage,
});

const th = "px-3 py-2 text-left text-xs font-semibold text-foreground";
const td = "px-3 py-2 text-sm";

function CommonCodePage() {
  const { id } = Route.useParams();
  const all = useCollection(commonCodeRepository);
  const rec = all.find((r) => r.id === id);
  if (!rec)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Common code not found"
          action={
            <Button asChild size="sm">
              <Link to="/common-code">Back to list</Link>
            </Button>
          }
        />
      </Panel>
    );
  return <CommonCodeForm key={`${rec.id}:${rec.updatedAt}`} rec={rec} />;
}

function CommonCodeForm({ rec }: { rec: CommonCodeRecord }) {
  const navigate = useNavigate();
  const initial = useMemo<CommonCodeDraft>(
    () => ({ remark: rec.remark, options: rec.options.map((o) => ({ ...o })) }),
    [rec],
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const fixed = rec.kind === "Fixed";

  const setOption = (code: string, p: Partial<CommonCodeDraft["options"][number]>) => {
    setD((x) => ({ ...x, options: x.options.map((o) => (o.code === code ? { ...o, ...p } : o)) }));
    setErrors({});
  };
  const addOption = () =>
    setD((x) => ({
      ...x,
      options: [
        ...x.options,
        {
          code: nextOptionCode(rec.code, x.options),
          name: "",
          attribute: rec.attributes[0]?.code ?? "DEFAULT",
          remark: "",
          active: true,
        },
      ],
    }));
  const removeOption = (code: string) =>
    setD((x) => ({ ...x, options: x.options.filter((o) => o.code !== code) }));

  const back = () => void navigate({ to: "/common-code" });
  const save = () => {
    setFormError(null);
    try {
      commonCodeService.save(rec.id, d);
      guard.allowNext();
      toast.success(`Common code ${rec.code} saved`);
      back();
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
        crumbs={[{ label: "Common Codes", to: "/common-code" }, { label: "Detail" }]}
        title={`Common Codes #${rec.code}`}
        badge={<Tag>{rec.kind}</Tag>}
        dirty={dirty}
        onBack={back}
        onCancel={back}
        onSave={save}
        extra={
          <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            History
          </Button>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="flex flex-col gap-4">
        <Panel title="General Information" bodyClassName="space-y-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div className="flex items-center gap-6">
              <dt className="w-24 shrink-0 text-sm text-muted-foreground">Type Code</dt>
              <dd className="text-sm font-semibold">{rec.code}</dd>
            </div>
            <div className="flex items-center gap-6">
              <dt className="w-24 shrink-0 text-sm text-muted-foreground">Type Name</dt>
              <dd className="text-sm font-semibold">{rec.name}</dd>
            </div>
            <div className="flex items-center gap-6">
              <dt className="w-24 shrink-0 text-sm text-muted-foreground">Remark</dt>
              <dd className="min-w-0 flex-1">
                <Input
                  className="h-8"
                  placeholder="-"
                  value={d.remark}
                  onChange={(e) => setD((x) => ({ ...x, remark: e.target.value }))}
                />
              </dd>
            </div>
          </dl>
          {fixed && (
            <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Fixed by system rules: options cannot be added, renamed or removed — only activated or
              deactivated.
            </p>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Usage</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse">
                <thead className="bg-muted/60">
                  <tr>
                    <th className={th}>Module</th>
                    <th className={th}>Screen</th>
                    <th className={th}>Field</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.usage.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        No data
                      </td>
                    </tr>
                  ) : (
                    rec.usage.map((u, i) => (
                      <tr key={i} className="border-t">
                        <td className={td}>{u.module}</td>
                        <td className={td}>{u.screen}</td>
                        <td className={td}>{u.field}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel title="Attribute">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <th className={cn(th, "w-48")}>Attribute Code</th>
                  <th className={cn(th, "w-56")}>Attribute Name</th>
                  <th className={th}>Remark</th>
                </tr>
              </thead>
              <tbody>
                {rec.attributes.map((a) => (
                  <tr key={a.code} className="border-t">
                    <td className={td}>{a.code}</td>
                    <td className={td}>{a.name}</td>
                    <td className={cn(td, "text-muted-foreground")}>-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Options List"
          actions={
            !fixed && (
              <Button size="sm" variant="outline" onClick={addOption}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )
          }
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <th className={cn(th, "w-36")}>Code</th>
                  <th className={cn(th, "w-72")}>Name</th>
                  <th className={cn(th, "w-40")}>Attribute</th>
                  <th className={th}>Remark</th>
                  <th className={cn(th, "w-24 text-center")}>Active</th>
                  {!fixed && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {d.options.map((o) => (
                  <tr key={o.code} className={cn("border-t", !o.active && "bg-muted/30")}>
                    <td className="px-3 py-1.5">
                      <Input disabled value={o.code} className="h-8 bg-muted/60" />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        className="h-8"
                        value={o.name}
                        disabled={fixed}
                        placeholder="Enter Name"
                        onChange={(e) => setOption(o.code, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <NativeSelect
                        value={o.attribute}
                        onChange={(v) => setOption(o.code, { attribute: v })}
                        options={rec.attributes.map((a) => a.code)}
                        className="h-8 w-full"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        className="h-8"
                        value={o.remark}
                        onChange={(e) => setOption(o.code, { remark: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Switch
                        checked={o.active}
                        aria-label={`${o.name || o.code} active`}
                        onCheckedChange={(v) => setOption(o.code, { active: v })}
                      />
                    </td>
                    {!fixed && (
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          aria-label="Remove option"
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          onClick={() => removeOption(o.code)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors["options"] && (
            <p className="mt-2 text-xs font-medium text-destructive">{errors["options"]}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Inactive options are no longer offered in dropdowns; records that already use them keep
            their value.
          </p>
        </Panel>
      </div>

      <AuditHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entityType="Common Code"
        entityId={rec.id}
        title={rec.code}
      />
    </div>
  );
}
