import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Lock, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useCollection, useTemplateConfig } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import { TEMPLATE_FIELDS } from "@/mock-data/templates";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  newServiceDraft,
  serviceCatalogService,
  serviceCrud,
  templateOf,
  validateService,
} from "@/services/serviceCatalogService";
import {
  TEMPLATES,
  type ServiceRecord,
  type Status,
  type TemplateType,
  type TenantFieldSetting,
} from "@/types";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/service/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Add Service — MoveX" : "Service Detail — MoveX" },
      { name: "description", content: "Edit service and per-tenant field configuration." },
      { property: "og:title", content: "Service Detail — MoveX" },
      { property: "og:description", content: "Edit service and per-tenant field configuration." },
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
  const savedCfg = useTemplateConfig();
  const [cfg, setCfg] = useState(() => structuredClone(savedCfg));
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
  const usingTemplate = effectiveTemplate
    ? alive.filter((x) => templateOf(x, all) === effectiveTemplate).length
    : 0;

  const dirtyForm = JSON.stringify(s) !== JSON.stringify(source ?? newServiceDraft());
  const dirtyCfg = effectiveTemplate
    ? JSON.stringify(cfg[effectiveTemplate]) !== JSON.stringify(savedCfg[effectiveTemplate])
    : false;
  const dirty = dirtyForm || dirtyCfg;
  const guard = useUnsavedChangesGuard(dirty && !readOnly);

  useEffect(() => {
    if (source) auditService.logView("Service", source.id, source.code);
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (readOnly && source) {
      setS(structuredClone(source));
      setCfg(structuredClone(savedCfg));
    }
  }, [source, savedCfg, readOnly]);

  const set = <K extends keyof ServiceRecord>(k: K, v: ServiceRecord[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    if (errors[k as string])
      setErrors((e) => {
        const n = { ...e };
        delete n[k as string];
        return n;
      });
  };

  const toggle = (key: string, prop: keyof TenantFieldSetting) => {
    if (!effectiveTemplate) return;
    setCfg((c) => {
      const cur = c[effectiveTemplate][key] ?? { visible: true, required: false };
      const next = { ...cur, [prop]: !cur[prop] };
      if (prop === "visible" && !next.visible) next.required = false;
      if (prop === "required" && next.required) next.visible = true;
      return { ...c, [effectiveTemplate]: { ...c[effectiveTemplate], [key]: next } };
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
      const changes =
        effectiveTemplate && dirtyCfg
          ? serviceCatalogService.saveTemplateConfig(effectiveTemplate, cfg[effectiveTemplate], {
              id: saved.id,
              label: saved.code,
            })
          : 0;
      guard.allowNext();
      toast.success(
        `Đã lưu service ${saved.code}${changes ? ` · ${changes} field setting change(s)` : ""}`,
      );
      void navigate({ to: "/service/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    }
  };

  const fields = effectiveTemplate ? TEMPLATE_FIELDS[effectiveTemplate] : [];

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

      <fieldset disabled={readOnly} className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel title="Thông tin chung" className="xl:col-span-2">
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
                hint="Chỉ có 3 template hệ thống. Tenant không được tạo template thứ 4."
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

        <Panel
          title="Cấu hình trường theo Tenant"
          className="xl:col-span-3"
          actions={effectiveTemplate && <Tag tone="tpl">{effectiveTemplate} template</Tag>}
        >
          {!effectiveTemplate ? (
            <EmptyState
              title="Chọn template"
              description="Chọn Trucking, Customs hoặc Freight để cấu hình các trường."
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Tenant <b>MoveX Việt Nam</b> · áp dụng cho {usingTemplate} dịch vụ dùng template{" "}
                {effectiveTemplate}. Cấu trúc trường do hệ thống cố định — chỉ được bật/tắt Visible
                / Required.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[1fr_100px_100px] bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Trường của {effectiveTemplate}</span>
                  <span className="text-center">Visible</span>
                  <span className="text-center">Required</span>
                </div>
                {fields.map((f) => {
                  const st = cfg[effectiveTemplate][f.key] ?? {
                    visible: f.defaultVisible,
                    required: f.defaultRequired,
                  };
                  const lockMsg =
                    "Trường core bắt buộc — luôn hiển thị và bắt buộc, không thể tắt hoặc xoá.";
                  return (
                    <div
                      key={f.key}
                      className="grid grid-cols-[1fr_100px_100px] items-center border-t px-4 py-3 text-sm"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {f.label}
                        {f.coreMandatory ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                <Lock className="h-3 w-3" />
                                Core · Mandatory
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{lockMsg}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                <ShieldCheck className="h-3 w-3" />
                                Core
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Trường core của template — không thể xoá, nhưng có thể cấu hình
                              Visible / Required theo tenant.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                      <div className="flex justify-center">
                        {f.coreMandatory ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Switch checked disabled />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{lockMsg}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Switch
                            checked={st.visible}
                            onCheckedChange={() => toggle(f.key, "visible")}
                            aria-label={`${f.label} visible`}
                          />
                        )}
                      </div>
                      <div className="flex justify-center">
                        {f.coreMandatory ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Switch checked disabled />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{lockMsg}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Switch
                            checked={st.required}
                            onCheckedChange={() => toggle(f.key, "required")}
                            aria-label={`${f.label} required`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {dirtyCfg && !readOnly && (
                <p className="mt-2 text-xs font-medium text-warning">
                  Cấu hình trường đã thay đổi — bấm Save để áp dụng.
                </p>
              )}
              <div className="mt-5 rounded-lg border border-dashed p-4">
                <div className="mb-3 text-xs font-semibold text-muted-foreground">
                  XEM TRƯỚC — form đơn hàng cho “{s.name || "dịch vụ này"}”
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {fields
                    .filter(
                      (f) =>
                        (cfg[effectiveTemplate][f.key]?.visible ?? f.defaultVisible) ||
                        f.coreMandatory,
                    )
                    .map((f) => (
                      <Field
                        key={f.key}
                        label={f.label}
                        required={f.coreMandatory || !!cfg[effectiveTemplate][f.key]?.required}
                      >
                        <Input placeholder={f.label} tabIndex={-1} readOnly />
                      </Field>
                    ))}
                </div>
              </div>
            </>
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
