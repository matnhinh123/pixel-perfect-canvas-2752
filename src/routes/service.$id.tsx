import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, History, Lock, Pencil, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { ServiceTreePicker } from "@/components/movex/service/ServiceTreePicker";
import { ServiceFormConfig } from "@/components/movex/service/ServiceFormConfig";
import { ServiceAssignments } from "@/components/movex/service/ServiceAssignments";
import { useCollection } from "@/hooks/use-store";
import { serviceAssignmentRepository, serviceRepository } from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  newServiceDraft,
  rootOf,
  serviceCatalogService,
  serviceCrud,
  templateOf,
  validateService,
} from "@/services/serviceCatalogService";
import { formName } from "@/mock-data/templates";
import { formatDateTime } from "@/lib/format";
import { TEMPLATES, type ServiceRecord, type Status, type TemplateType } from "@/types";

type Mode = "view" | "edit";
type Tab = "info" | "form" | "assign";
const TABS: Tab[] = ["info", "form", "assign"];

export const Route = createFileRoute("/service/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode; tab?: Tab; parent?: string } => ({
    ...(s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {}),
    ...(TABS.includes(s["tab"] as Tab) ? { tab: s["tab"] as Tab } : {}),
    ...(typeof s["parent"] === "string" ? { parent: s["parent"] } : {}),
  }),
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Add Service — MoveX" : "Service Detail — MoveX" },
      { name: "description", content: "Thông tin dịch vụ, cấu hình form và phân công." },
      { property: "og:title", content: "Service Detail — MoveX" },
      { property: "og:description", content: "Thông tin dịch vụ, cấu hình form và phân công." },
    ],
  }),
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const all = useCollection(serviceRepository);
  const alive = useMemo(() => all.filter((s) => !s.deleted), [all]);
  const source = id === "new" ? null : (alive.find((s) => s.id === id) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Không tìm thấy dịch vụ"
          action={
            <Button asChild size="sm">
              <Link to="/service">Về danh sách Service</Link>
            </Button>
          }
        />
      </Panel>
    );
  if (!source || search.mode === "edit")
    return <ServiceEditor key={source?.id ?? "new"} source={source} services={alive} />;
  return <ServiceView key={source.id} source={source} services={alive} />;
}

// ---------------------------------------------------------------- View (3 tabs)

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ServiceView({ source, services }: { source: ServiceRecord; services: ServiceRecord[] }) {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const actions = useEntityActions(serviceCrud);
  const [auditOpen, setAuditOpen] = useState(false);
  const assignments = useCollection(serviceAssignmentRepository).filter(
    (a) => a.serviceId === source.id && !a.deleted,
  );
  const parent = source.parentId ? services.find((s) => s.id === source.parentId) : undefined;
  const root = rootOf(source, services);
  const form = templateOf(source, services);
  const children = services.filter((s) => s.parentId === source.id);
  const tab = search.tab ?? "info";

  useEffect(() => {
    auditService.logView("Service", source.id, source.code);
  }, [source.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id: string, extra: { mode?: Mode; tab?: Tab; parent?: string } = {}) =>
    void navigate({ to: "/service/$id", params: { id }, search: { mode: "view", ...extra } });

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Service", to: "/service" }, { label: source.code }]}
        title={source.name}
        badge={<StatusBadge status={source.status} />}
        subtitle={
          <>
            Mã dịch vụ: <span className="font-semibold text-foreground">{source.code}</span>
          </>
        }
        readOnly
        onBack={() => void navigate({ to: "/service" })}
        extra={
          <>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              Lịch sử thay đổi
            </Button>
            {source.status === "Inactive" ? (
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
            )}
            <Button size="lg" onClick={() => go(source.id, { mode: "edit" })}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(t) =>
          void navigate({
            to: "/service/$id",
            params: { id: source.id },
            search: { mode: "view", tab: t as Tab },
            replace: true,
          })
        }
      >
        <TabsList className="mb-4">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="form">Cấu hình form</TabsTrigger>
          <TabsTrigger value="assign">
            Phân công
            {assignments.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
                {assignments.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="flex max-w-4xl flex-col gap-5">
          <Panel title="Thông tin">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <InfoRow label="Mã dịch vụ">
                <span className="font-semibold">{source.code}</span>
              </InfoRow>
              <InfoRow label="Tên dịch vụ">{source.name}</InfoRow>
              <InfoRow label="Dịch vụ cha">
                {parent ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => go(parent.id)}
                  >
                    {parent.name}
                  </button>
                ) : (
                  <span className="text-muted-foreground">— (dịch vụ gốc)</span>
                )}
              </InfoRow>
              <InfoRow label="Nhóm dịch vụ">{root.name}</InfoRow>
              <InfoRow label="Form">
                <span className="inline-flex items-center gap-2">
                  <Tag tone="tpl">{formName(form)}</Tag>
                  {source.parentId && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Kế thừa từ {root.name}
                    </span>
                  )}
                </span>
              </InfoRow>
              <InfoRow label="Trạng thái">
                <StatusBadge status={source.status} />
              </InfoRow>
              <div className="sm:col-span-2">
                <InfoRow label="Ghi chú">
                  {source.description || <span className="text-muted-foreground">—</span>}
                </InfoRow>
              </div>
              <InfoRow label="Cập nhật lúc">
                <span className="text-muted-foreground">
                  {formatDateTime(source.updatedAt)} · {source.updatedBy}
                </span>
              </InfoRow>
            </dl>
          </Panel>

          <Panel
            title={`Dịch vụ con (${children.length})`}
            bodyClassName="p-0"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={() =>
                  void navigate({
                    to: "/service/$id",
                    params: { id: "new" },
                    search: { parent: source.id },
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Thêm dịch vụ con
              </Button>
            }
          >
            {children.length === 0 ? (
              <EmptyState title="Chưa có dịch vụ con" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {["Mã dịch vụ", "Tên dịch vụ", "Form", "Trạng thái"].map((h) => (
                      <TableHead key={h} className={thClass}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {children.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => go(c.id)}>
                      <TableCell className="py-2.5 font-semibold text-primary">{c.code}</TableCell>
                      <TableCell className="py-2.5">{c.name}</TableCell>
                      <TableCell className="py-2.5">
                        <Tag tone="tpl">{formName(form)}</Tag>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <StatusBadge status={c.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="form" className="max-w-4xl">
          <ServiceFormConfig service={source} services={services} />
        </TabsContent>

        <TabsContent value="assign" className="max-w-5xl">
          <ServiceAssignments service={source} services={services} />
        </TabsContent>
      </Tabs>

      <AuditHistoryDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Service"
        entityId={source.id}
        title={source.code}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Create / Edit (one form)

function ReadOnlyBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm">
      {children}
    </div>
  );
}

function ServiceEditor({
  source,
  services,
}: {
  source: ServiceRecord | null;
  services: ServiceRecord[];
}) {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const confirm = useConfirm();
  const isNew = !source;
  const initial = useMemo<ServiceRecord>(() => {
    if (source) return structuredClone(source);
    const parentId =
      search.parent && services.some((x) => x.id === search.parent) ? search.parent : null;
    return { ...newServiceDraft(), parentId };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [s, setS] = useState<ServiceRecord>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const parent = s.parentId ? services.find((x) => x.id === s.parentId) : undefined;
  const root = parent ? rootOf(parent, services) : undefined;
  const form: TemplateType | null = parent ? templateOf(parent, services) : s.template;
  const descendants = source ? serviceCatalogService.descendantsOf(source.id) : [];
  const excludeIds = useMemo(
    () => new Set(source ? [source.id, ...descendants] : []),
    [source?.id, descendants.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const set = <K extends keyof ServiceRecord>(k: K, v: ServiceRecord[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    if (errors[k as string])
      setErrors((e) => {
        const n = { ...e };
        delete n[k as string];
        return n;
      });
  };

  const setParent = (id: string | null) => {
    setS((p) => ({
      ...p,
      parentId: id,
      // Becoming a root again: keep the form it inherited so far.
      template: id ? p.template : (p.template ?? form),
    }));
    setErrors((e) => {
      const n = { ...e };
      delete n["parentId"];
      delete n["template"];
      return n;
    });
  };

  const back = () =>
    source
      ? void navigate({ to: "/service/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: "/service" });

  const save = async () => {
    setFormError(null);
    const e = validateService(s);
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Chưa thể lưu — vui lòng kiểm tra:");
      toast.error("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    const oldForm = source ? templateOf(source, services) : null;
    if (source && oldForm && oldForm !== form && descendants.length) {
      const r = await confirm({
        title: "Đổi Form?",
        description: `${descendants.length} dịch vụ con sẽ chuyển từ ${formName(oldForm)} sang ${formName(form)}. Phân công dùng form cũ cũng được cập nhật theo.`,
        confirmLabel: "Đổi Form",
        tone: "danger",
      });
      if (r !== "confirm") return;
    }
    try {
      const saved = serviceCatalogService.save(s);
      guard.allowNext();
      toast.success(isNew ? `Đã tạo dịch vụ ${saved.code}` : `Đã lưu dịch vụ ${saved.code}`);
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
          ...(source ? [{ label: source.code, to: `/service/${source.id}` }] : []),
          { label: isNew ? "Tạo mới" : "Chỉnh sửa" },
        ]}
        title={isNew ? "Add Service" : `Chỉnh sửa: ${source.name}`}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        onBack={back}
        onCancel={back}
        onSave={() => void save()}
      />
      <FormErrorBanner message={formError} errors={errors} />

      <Panel title="Thông tin dịch vụ" className="max-w-3xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mã dịch vụ" required error={errors["code"]}>
            <Input
              value={s.code}
              placeholder="VD: TRK-IN-CT"
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              aria-invalid={!!errors["code"] || undefined}
            />
          </Field>
          <Field label="Tên dịch vụ" required error={errors["name"]}>
            <Input
              value={s.name}
              placeholder="VD: Container Trucking"
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors["name"] || undefined}
            />
          </Field>
          <Field
            label="Dịch vụ cha"
            error={errors["parentId"]}
            className="sm:col-span-2"
            hint="Bỏ trống nếu đây là dịch vụ gốc (nhóm dịch vụ)."
          >
            <ServiceTreePicker
              services={services}
              value={s.parentId}
              onChange={setParent}
              excludeIds={excludeIds}
              invalid={!!errors["parentId"]}
            />
          </Field>
          <Field label="Nhóm dịch vụ">
            <ReadOnlyBox>
              {root ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  {root.name}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {s.name.trim() || "Chính dịch vụ này"} (dịch vụ gốc)
                </span>
              )}
            </ReadOnlyBox>
          </Field>
          {root ? (
            <Field label="Form" hint={`Kế thừa từ ${root.name}`}>
              <ReadOnlyBox>
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <Tag tone="tpl">{formName(form)}</Tag>
              </ReadOnlyBox>
            </Field>
          ) : (
            <Field label="Form" required error={errors["template"]}>
              <NativeSelect
                value={s.template ?? ""}
                invalid={!!errors["template"]}
                onChange={(v) => set("template", (v || null) as TemplateType | null)}
                options={["", ...TEMPLATES]}
                labels={{
                  "": "Chọn form…",
                  ...Object.fromEntries(TEMPLATES.map((t) => [t, formName(t)])),
                }}
              />
            </Field>
          )}
          <Field label="Trạng thái">
            <NativeSelect
              value={s.status}
              onChange={(v) => set("status", v as Status)}
              options={
                s.status === "Draft" ? ["Draft", "Active", "Inactive"] : ["Active", "Inactive"]
              }
            />
          </Field>
          <Field label="Ghi chú" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={s.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        </div>
        {parent && (
          <p className="mt-4 text-xs text-muted-foreground">
            Dịch vụ con dùng chung Nhóm dịch vụ và Form với dịch vụ gốc {root?.name}.
          </p>
        )}
      </Panel>
    </div>
  );
}
