import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Lock, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { useCollection } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  newServiceDraft,
  serviceCatalogService,
  serviceCrud,
  templateOf,
  validateService,
} from "@/services/serviceCatalogService";
import { TEMPLATES, type ServiceRecord, type Status, type TemplateType } from "@/types";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/service/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Add Service — MoveX" : "Service Detail — MoveX" },
      { name: "description", content: "Create and edit services and their template." },
      { property: "og:title", content: "Service Detail — MoveX" },
      { property: "og:description", content: "Create and edit services and their template." },
    ],
  }),
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { id } = Route.useParams();
  const all = useCollection(serviceRepository);
  const source = id === "new" ? null : (all.find((s) => s.id === id && !s.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Không tìm thấy service"
          action={
            <Button asChild size="sm">
              <Link to="/service">Về danh sách Service</Link>
            </Button>
          }
        />
      </Panel>
    );
  return <ServiceEditor key={source?.id ?? "new"} source={source} all={all} />;
}

function ServiceEditor({ source, all }: { source: ServiceRecord | null; all: ServiceRecord[] }) {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const confirm = useConfirm();
  const isNew = !source;
  const readOnly = !isNew && (search.mode ?? "view") === "view";
  const [s, setS] = useState<ServiceRecord>(() => structuredClone(source ?? newServiceDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const actions = useEntityActions(serviceCrud);

  const alive = all.filter((x) => !x.deleted);
  const parent = s.parentId ? alive.find((x) => x.id === s.parentId) : undefined;
  const effectiveTemplate: TemplateType | null = s.parentId
    ? parent
      ? templateOf(parent, all)
      : null
    : s.template;
  const descendants = source ? serviceCatalogService.descendantsOf(source.id) : [];
  const parentOptions = alive.filter((x) => x.id !== s.id && !descendants.includes(x.id));
  const children = source ? alive.filter((x) => x.parentId === source.id) : [];

  const dirty = JSON.stringify(s) !== JSON.stringify(source ?? newServiceDraft());
  const guard = useUnsavedChangesGuard(dirty && !readOnly);

  useEffect(() => {
    if (source) auditService.logView("Service", source.id, source.code);
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (readOnly && source) setS(structuredClone(source));
  }, [source, readOnly]);

  const set = <K extends keyof ServiceRecord>(k: K, v: ServiceRecord[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    if (errors[k as string])
      setErrors((e) => {
        const n = { ...e };
        delete n[k as string];
        return n;
      });
  };

  const save = async () => {
    setFormError(null);
    const e = validateService(s);
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Chưa thể lưu — vui lòng kiểm tra:");
      toast.error("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    if (source && !source.parentId && source.template !== s.template && children.length) {
      const r = await confirm({
        title: "Đổi template?",
        description: `${descendants.length} child service(s) inherit the template of ${source.code} and will switch from ${source.template} to ${s.template}.`,
        confirmLabel: "Đổi template",
        tone: "danger",
      });
      if (r !== "confirm") return;
    }
    try {
      const saved = serviceCatalogService.save(s);
      guard.allowNext();
      toast.success(`Đã lưu service ${saved.code}`);
      void navigate({ to: "/service/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Service", to: "/service" },
          { label: isNew ? "Tạo mới" : readOnly ? s.code : "Chỉnh sửa" },
        ]}
        title={
          isNew ? "Tạo mới Service" : readOnly ? `Service ${source!.code}` : "Chỉnh sửa Service"
        }
        badge={<StatusBadge status={(source ?? s).status} />}
        subtitle={source ? source.name : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => void navigate({ to: "/service" })}
        onCancel={() =>
          isNew
            ? void navigate({ to: "/service" })
            : void navigate({
                to: "/service/$id",
                params: { id: source!.id },
                search: { mode: "view" },
              })
        }
        onSave={() => void save()}
        extra={
          <>
            {source && (
              <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
                <History className="h-4 w-4" />
                Audit History
              </Button>
            )}
            {readOnly &&
              source &&
              (source.status === "Inactive" ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void actions.setStatus([source], "Active")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void actions.setStatus([source], "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              ))}
            {readOnly && (
              <Button
                onClick={() =>
                  void navigate({
                    to: "/service/$id",
                    params: { id: source!.id },
                    search: { mode: "edit" },
                  })
                }
              >
                <Pencil className="h-4 w-4" />
                Chỉnh sửa
              </Button>
            )}
          </>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <fieldset disabled={readOnly} className="min-w-0 max-w-3xl">
        <Panel title="Thông tin chung">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mã dịch vụ" required error={errors["code"]}>
              <Input
                value={s.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                aria-invalid={!!errors["code"] || undefined}
              />
            </Field>
            <Field label="Trạng thái">
              <NativeSelect
                value={s.status}
                onChange={(v) => set("status", v as Status)}
                options={["Draft", "Active", "Inactive"]}
              />
            </Field>
            <Field label="Tên dịch vụ" required error={errors["name"]} className="col-span-2">
              <Input
                value={s.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={!!errors["name"] || undefined}
              />
            </Field>
            <Field label="Cấp dịch vụ" className="col-span-2">
              <div className="flex rounded-md border p-0.5">
                {[
                  ["root", "Cấp 1 · Nhóm dịch vụ"],
                  ["child", "Dịch vụ con"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === "root")
                        setS((p) => ({
                          ...p,
                          parentId: null,
                          template: p.template ?? (parent ? templateOf(parent, all) : null),
                        }));
                      else
                        setS((p) => ({
                          ...p,
                          parentId: p.parentId ?? parentOptions[0]?.id ?? null,
                        }));
                    }}
                    className={cn(
                      "flex-1 rounded px-2 py-1.5 text-xs font-semibold",
                      (k === "root") === !s.parentId
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            {s.parentId ? (
              <>
                <Field
                  label="Dịch vụ cha"
                  required
                  error={errors["parentId"]}
                  className="col-span-2"
                >
                  <NativeSelect
                    value={s.parentId}
                    onChange={(v) => set("parentId", v)}
                    options={parentOptions.map((x) => x.id)}
                    labels={Object.fromEntries(
                      parentOptions.map((x) => [x.id, `${x.code} · ${x.name}`]),
                    )}
                  />
                </Field>
                <Field label="Template" className="col-span-2">
                  <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <Tag tone="tpl">{effectiveTemplate ?? "—"}</Tag>
                    <span className="text-xs text-muted-foreground">
                      Inherited from parent {parent ? `${parent.code}` : ""} — dịch vụ con không
                      được đổi template độc lập
                    </span>
                  </div>
                </Field>
              </>
            ) : (
              <Field
                label="Template"
                required
                error={errors["template"]}
                className="col-span-2"
                hint="Chỉ có 3 template hệ thống."
              >
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("template", t)}
                      className={cn(
                        "rounded-lg border py-2 text-sm font-semibold",
                        s.template === t
                          ? "border-primary bg-accent text-accent-foreground"
                          : "hover:border-primary",
                        errors["template"] && "border-destructive",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Mô tả" className="col-span-2">
              <Textarea
                rows={3}
                value={s.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
          {children.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                DỊCH VỤ CON ({children.length}) — kế thừa {effectiveTemplate}
              </div>
              <div className="flex flex-col gap-1">
                {children.map((c) => (
                  <Link
                    key={c.id}
                    to="/service/$id"
                    params={{ id: c.id }}
                    search={{ mode: "view" }}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span>
                      <span className="font-semibold text-primary">{c.code}</span> · {c.name}
                    </span>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </fieldset>
      {source && (
        <AuditHistoryDrawer
          open={auditOpen}
          onOpenChange={setAuditOpen}
          entityType="Service"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
