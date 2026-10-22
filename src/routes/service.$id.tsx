import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CheckCircle2, History, Lock, Pencil, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import {
  ServiceFormConfig,
  type FieldSettings,
} from "@/components/movex/service/ServiceFormConfig";
import {
  ServiceAssignments,
  type AssignmentRow,
} from "@/components/movex/service/ServiceAssignments";
import { useCollection, useTemplateConfig } from "@/hooks/use-store";
import { serviceAssignmentRepository, serviceRepository } from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import { serviceAssignmentService } from "@/services/serviceAssignmentService";
import {
  newServiceDraft,
  rootOf,
  serviceCatalogService,
  serviceCrud,
  templateOf,
  validateService,
} from "@/services/serviceCatalogService";
import { formName } from "@/mock-data/templates";
import { tr, useT } from "@/lib/i18n";
import {
  TEMPLATES,
  type ServiceAssignment,
  type ServiceRecord,
  type Status,
  type TemplateType,
} from "@/types";

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
      {
        name: "description",
        content: tr(
          "Thông tin dịch vụ, cấu hình Default Template và phân công.",
          "Service information, Default Template settings and assignment.",
        ),
      },
      { property: "og:title", content: "Service Detail — MoveX" },
      {
        property: "og:description",
        content: tr(
          "Thông tin dịch vụ, cấu hình Default Template và phân công.",
          "Service information, Default Template settings and assignment.",
        ),
      },
    ],
  }),
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { t } = useT();
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
          title={t("Không tìm thấy dịch vụ", "Service not found")}
          action={
            <Button asChild size="sm">
              <Link to="/service">{t("Về danh sách Service", "Back to Service list")}</Link>
            </Button>
          }
        />
      </Panel>
    );
  if (!source || search.mode === "edit")
    return <ServiceEditor key={source?.id ?? "new"} source={source} services={alive} />;
  return <ServiceView key={source.id} source={source} services={alive} />;
}

// ---------------------------------------------------------------- Shared layout

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Information tab grid: the same 2-column layout in view and edit. */
const INFO_GRID = "grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2";

function ServiceTabsList({ assignments }: { assignments: number }) {
  const { t } = useT();
  return (
    <TabsList className="mb-4">
      <TabsTrigger value="info">{t("Thông tin", "Information")}</TabsTrigger>
      <TabsTrigger value="form">
        {t("Cấu hình Default Template", "Default Template Settings")}
      </TabsTrigger>
      <TabsTrigger value="assign">
        {t("Phân công", "Assignment")}
        {assignments > 0 && (
          <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
            {assignments}
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  );
}

/** A child service being typed in the Child Services table (not saved yet). */
interface ChildDraft {
  key: string;
  code: string;
  name: string;
  errors: Record<string, string>;
}
let childSeq = 0;

function ChildServicesPanel({
  items,
  form,
  onOpen,
  parentId,
}: {
  items: ServiceRecord[];
  form: TemplateType | null;
  onOpen?: (id: string) => void;
  /** Set: "Add Child Service" adds a row typed in place (the template is inherited). */
  parentId?: string;
}) {
  const { t } = useT();
  const [drafts, setDrafts] = useState<ChildDraft[]>([]);
  const add = () =>
    setDrafts((d) => [
      ...d,
      { key: `c${Date.now()}${++childSeq}`, code: "", name: "", errors: {} },
    ]);
  const edit = (key: string, p: Partial<ChildDraft>) =>
    setDrafts((d) =>
      d.map((x) =>
        x.key === key
          ? {
              ...x,
              ...p,
              errors: Object.fromEntries(Object.entries(x.errors).filter(([k]) => !(k in p))),
            }
          : x,
      ),
    );
  const drop = (key: string) => setDrafts((d) => d.filter((x) => x.key !== key));
  const save = (row: ChildDraft) => {
    if (!parentId) return;
    try {
      const rec = serviceCatalogService.save({
        ...newServiceDraft(),
        parentId,
        code: row.code,
        name: row.name,
      });
      drop(row.key);
      toast.success(t(`Đã thêm ${rec.code}`, `${rec.code} added`));
    } catch (err) {
      if (err instanceof BusinessRuleError)
        setDrafts((d) => d.map((x) => (x.key === row.key ? { ...x, errors: err.fieldErrors } : x)));
      else toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };
  const keys = (row: ChildDraft) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save(row);
    } else if (e.key === "Escape") drop(row.key);
  };
  const editable = !!parentId;

  return (
    <Panel
      title={t(`Dịch vụ con (${items.length})`, `Child Services (${items.length})`)}
      bodyClassName="p-0"
      actions={
        editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-primary/40 text-primary"
            onClick={add}
          >
            <Plus className="h-4 w-4" />
            {t("Thêm dịch vụ con", "Add Child Service")}
          </Button>
        )
      }
    >
      {items.length === 0 && drafts.length === 0 ? (
        <EmptyState title={t("Chưa có dịch vụ con", "No child services yet")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                t("Mã dịch vụ", "Service Code"),
                t("Tên dịch vụ", "Service Name"),
                "Default Template",
                t("Trạng thái", "Status"),
              ].map((h) => (
                <TableHead key={h} className={thClass}>
                  {h}
                </TableHead>
              ))}
              {editable && <TableHead className={cn(thClass, "w-24")} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow
                key={c.id}
                className={onOpen ? "cursor-pointer" : undefined}
                onClick={onOpen ? () => onOpen(c.id) : undefined}
              >
                <TableCell className="py-2.5 font-semibold text-primary">{c.code}</TableCell>
                <TableCell className="py-2.5">{c.name}</TableCell>
                <TableCell className="py-2.5">
                  <Tag tone="tpl">{formName(form)}</Tag>
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge status={c.status} />
                </TableCell>
                {editable && <TableCell />}
              </TableRow>
            ))}
            {drafts.map((row) => (
              <TableRow key={row.key} className="bg-primary/5 hover:bg-primary/5">
                <TableCell className="py-2 align-top">
                  <Input
                    autoFocus
                    value={row.code}
                    maxLength={30}
                    placeholder={t("Nhập mã", "Enter code")}
                    aria-invalid={!!row.errors["code"] || undefined}
                    onChange={(e) => edit(row.key, { code: e.target.value.toUpperCase() })}
                    onKeyDown={keys(row)}
                    className="h-9"
                  />
                  {row.errors["code"] && (
                    <p className="mt-1 text-xs text-destructive">{row.errors["code"]}</p>
                  )}
                </TableCell>
                <TableCell className="py-2 align-top">
                  <Input
                    value={row.name}
                    placeholder={t("Nhập tên dịch vụ", "Enter service name")}
                    aria-invalid={!!row.errors["name"] || undefined}
                    onChange={(e) => edit(row.key, { name: e.target.value })}
                    onKeyDown={keys(row)}
                    className="h-9"
                  />
                  {row.errors["name"] && (
                    <p className="mt-1 text-xs text-destructive">{row.errors["name"]}</p>
                  )}
                </TableCell>
                <TableCell className="py-2.5 align-top">
                  <Tag tone="tpl">{formName(form)}</Tag>
                </TableCell>
                <TableCell className="py-2.5 align-top">
                  <StatusBadge status="Active" />
                </TableCell>
                <TableCell className="py-2 align-top">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title={t("Lưu (Enter)", "Save (Enter)")}
                      aria-label={t("Lưu dịch vụ con", "Save child service")}
                      className="rounded p-1.5 text-success hover:bg-success/10"
                      onClick={() => save(row)}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t("Huỷ (Esc)", "Cancel (Esc)")}
                      aria-label={t("Huỷ dòng", "Cancel row")}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => drop(row.key)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

/** Stored assignments of a service as editable rows. */
const rowsOf = (serviceId: string, all: ServiceAssignment[]): AssignmentRow[] =>
  serviceAssignmentService.forService(serviceId, all).map((a) => ({
    key: a.id,
    id: a.id,
    departmentId: a.departmentId,
    employeeId: a.employeeId,
    form: a.form,
    note: a.note,
    status: a.status,
  }));

// ---------------------------------------------------------------- View (3 tabs, read-only)

function ServiceView({ source, services }: { source: ServiceRecord; services: ServiceRecord[] }) {
  const { t } = useT();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const actions = useEntityActions(serviceCrud);
  const [auditOpen, setAuditOpen] = useState(false);
  const cfg = useTemplateConfig();
  const allAssignments = useCollection(serviceAssignmentRepository);
  const rows = useMemo(() => rowsOf(source.id, allAssignments), [source.id, allAssignments]);
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
            {t("Mã dịch vụ", "Service Code")}:{" "}
            <span className="font-semibold text-foreground">{source.code}</span>
          </>
        }
        readOnly
        onBack={() => void navigate({ to: "/service" })}
        extra={
          <>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              {t("Lịch sử thay đổi", "Change History")}
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
            <Button size="lg" onClick={() => go(source.id, { mode: "edit", tab })}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({
            to: "/service/$id",
            params: { id: source.id },
            search: { mode: "view", tab: v as Tab },
            replace: true,
          })
        }
      >
        <ServiceTabsList assignments={rows.length} />

        <TabsContent value="info" className="flex max-w-4xl flex-col gap-5">
          <Panel title={t("Thông tin", "Information")}>
            <dl className={INFO_GRID}>
              <InfoRow label={t("Mã dịch vụ", "Service Code")}>
                <span className="font-semibold">{source.code}</span>
              </InfoRow>
              <InfoRow label={t("Tên dịch vụ", "Service Name")}>{source.name}</InfoRow>
              <InfoRow label={t("Dịch vụ cha", "Parent Service")}>
                {parent ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => go(parent.id)}
                  >
                    {parent.name}
                  </button>
                ) : (
                  <span className="text-muted-foreground">
                    {t("— (dịch vụ gốc)", "— (root service)")}
                  </span>
                )}
              </InfoRow>
              <InfoRow label={t("Nhóm dịch vụ", "Service Group")}>{root.name}</InfoRow>
              <InfoRow label="Default Template">
                <span className="inline-flex items-center gap-2">
                  <Tag tone="tpl">{formName(form)}</Tag>
                  {source.parentId && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {t(`Kế thừa từ ${root.name}`, `Inherited from ${root.name}`)}
                    </span>
                  )}
                </span>
              </InfoRow>
              <InfoRow label={t("Trạng thái", "Status")}>
                <StatusBadge status={source.status} />
              </InfoRow>
              <div className="sm:col-span-2">
                <InfoRow label={t("Ghi chú", "Remark")}>
                  {source.description || <span className="text-muted-foreground">—</span>}
                </InfoRow>
              </div>
            </dl>
          </Panel>

          <ChildServicesPanel
            items={children}
            form={form}
            onOpen={(id) => go(id)}
            parentId={source.id}
          />
        </TabsContent>

        <TabsContent value="form" className="max-w-4xl">
          <ServiceFormConfig
            form={form}
            root={root}
            inherited={!!source.parentId}
            value={form ? serviceCatalogService.fieldSettings(form, cfg) : {}}
          />
        </TabsContent>

        <TabsContent value="assign" className="max-w-5xl">
          <ServiceAssignments rows={rows} form={form} service={source} />
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

// ---------------------------------------------------------------- Create / Edit (same 3 tabs, editable)

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
  const { t } = useT();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const confirm = useConfirm();
  const isNew = !source;
  const cfg = useTemplateConfig();
  const initial = useMemo<ServiceRecord>(() => {
    if (source) return structuredClone(source);
    const parentId =
      search.parent && services.some((x) => x.id === search.parent) ? search.parent : null;
    return { ...newServiceDraft(), parentId };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialRows = useMemo(
    () => (source ? rowsOf(source.id, serviceAssignmentRepository.all()) : []),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [s, setS] = useState<ServiceRecord>(initial);
  const [rows, setRows] = useState<AssignmentRow[]>(initialRows);
  /** Settings edited per template (the template can change while editing a root service). */
  const [settingsDraft, setSettingsDraft] = useState<Partial<Record<TemplateType, FieldSettings>>>(
    {},
  );
  const [tab, setTab] = useState<Tab>(search.tab ?? "info");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const parent = s.parentId ? services.find((x) => x.id === s.parentId) : undefined;
  const root = parent ? rootOf(parent, services) : undefined;
  const form: TemplateType | null = parent ? templateOf(parent, services) : s.template;
  const children = source ? services.filter((x) => x.parentId === source.id) : [];
  const descendants = source ? serviceCatalogService.descendantsOf(source.id) : [];
  const excludeIds = useMemo(
    () => new Set(source ? [source.id, ...descendants] : []),
    [source?.id, descendants.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const savedSettings = form ? serviceCatalogService.fieldSettings(form, cfg) : {};
  const settings = (form && settingsDraft[form]) || savedSettings;
  const settingsDirty =
    !parent && !!form && JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const dirty =
    JSON.stringify(s) !== JSON.stringify(initial) ||
    JSON.stringify(rows) !== JSON.stringify(initialRows) ||
    settingsDirty;
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
      // Becoming a root again: keep the template it inherited so far.
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
      ? void navigate({
          to: "/service/$id",
          params: { id: source.id },
          search: { mode: "view", tab },
        })
      : void navigate({ to: "/service" });

  const save = async () => {
    setFormError(null);
    const e = validateService(s);
    if (Object.keys(e).length) {
      setErrors(e);
      setTab("info");
      setFormError(t("Chưa thể lưu — vui lòng kiểm tra:", "Cannot save yet — please check:"));
      toast.error(
        t("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
      );
      return;
    }
    const oldForm = source ? templateOf(source, services) : null;
    if (source && oldForm && oldForm !== form && descendants.length) {
      const r = await confirm({
        title: t("Đổi Default Template?", "Change Default Template?"),
        description: t(
          `${descendants.length} dịch vụ con sẽ chuyển từ ${formName(oldForm)} sang ${formName(form)}. Phân công dùng Default Template cũ cũng được cập nhật theo.`,
          `${descendants.length} child service(s) will move from ${formName(oldForm)} to ${formName(form)}. Assignments using the old Default Template are updated too.`,
        ),
        confirmLabel: t("Đổi Default Template", "Change Default Template"),
        tone: "danger",
      });
      if (r !== "confirm") return;
    }
    try {
      const saved = serviceCatalogService.save(s);
      // Default Template Settings belong to the template of a root service.
      if (settingsDirty && form)
        serviceCatalogService.saveTemplateConfig(form, settings, {
          id: saved.id,
          label: saved.code,
        });
      // Assignments: store added / changed rows and remove deleted ones; a row that carries a
      // template follows the service's current one.
      const newForm = templateOf(saved);
      const before = new Map(initialRows.map((r) => [r.id, r]));
      const strip = ({ key: _k, id: _i, ...draft }: AssignmentRow) => draft;
      for (const r of rows) {
        const row = { ...strip(r), form: r.form ? newForm : null };
        const old = r.id ? before.get(r.id) : undefined;
        if (!old) serviceAssignmentService.save(saved, row);
        else if (JSON.stringify(strip(old)) !== JSON.stringify(row))
          serviceAssignmentService.save(saved, row, r.id);
      }
      const kept = new Set(rows.map((r) => r.id));
      for (const r of initialRows)
        if (r.id && !kept.has(r.id)) serviceAssignmentService.remove(saved, r.id);

      guard.allowNext();
      toast.success(
        isNew
          ? t(`Đã tạo dịch vụ ${saved.code}`, `Service ${saved.code} created`)
          : t(`Đã lưu dịch vụ ${saved.code}`, `Service ${saved.code} saved`),
      );
      void navigate({
        to: "/service/$id",
        params: { id: saved.id },
        search: { mode: "view", tab },
      });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
        setTab("info");
      }
      toast.error(err instanceof Error ? err.message : t("Lưu thất bại", "Save failed"));
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Service", to: "/service" },
          ...(source ? [{ label: source.code, to: `/service/${source.id}` }] : []),
          { label: isNew ? t("Tạo mới", "New") : t("Chỉnh sửa", "Edit") },
        ]}
        title={isNew ? "Add Service" : t(`Chỉnh sửa: ${source.name}`, `Edit: ${source.name}`)}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        subtitle={
          source ? (
            <>
              {t("Mã dịch vụ", "Service Code")}:{" "}
              <span className="font-semibold text-foreground">{source.code}</span>
            </>
          ) : undefined
        }
        dirty={dirty}
        onBack={back}
        onCancel={back}
        onSave={() => void save()}
        extra={
          source && (
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              {t("Lịch sử thay đổi", "Change History")}
            </Button>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <ServiceTabsList assignments={rows.length} />

        <TabsContent value="info" className="flex max-w-4xl flex-col gap-5">
          <Panel title={t("Thông tin", "Information")}>
            <div className={INFO_GRID}>
              <Field label={t("Mã dịch vụ", "Service Code")} required error={errors["code"]}>
                <Input
                  value={s.code}
                  placeholder={t("VD: TRK-IN-CT", "E.g. TRK-IN-CT")}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  aria-invalid={!!errors["code"] || undefined}
                />
              </Field>
              <Field label={t("Tên dịch vụ", "Service Name")} required error={errors["name"]}>
                <Input
                  value={s.name}
                  placeholder={t("VD: Container Trucking", "E.g. Container Trucking")}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={!!errors["name"] || undefined}
                />
              </Field>
              <Field
                label={t("Dịch vụ cha", "Parent Service")}
                error={errors["parentId"]}
                hint={t(
                  "Bỏ trống nếu đây là dịch vụ gốc (nhóm dịch vụ).",
                  "Leave empty if this is a root service (service group).",
                )}
              >
                <ServiceTreePicker
                  services={services}
                  value={s.parentId}
                  onChange={setParent}
                  excludeIds={excludeIds}
                  invalid={!!errors["parentId"]}
                />
              </Field>
              <Field label={t("Nhóm dịch vụ", "Service Group")}>
                <ReadOnlyBox>
                  {root ? (
                    <>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      {root.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {s.name.trim() || t("Chính dịch vụ này", "This service")}{" "}
                      {t("(dịch vụ gốc)", "(root service)")}
                    </span>
                  )}
                </ReadOnlyBox>
              </Field>
              {root ? (
                <Field
                  label="Default Template"
                  hint={t(`Kế thừa từ ${root.name}`, `Inherited from ${root.name}`)}
                >
                  <ReadOnlyBox>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <Tag tone="tpl">{formName(form)}</Tag>
                  </ReadOnlyBox>
                </Field>
              ) : (
                <Field label="Default Template" required error={errors["template"]}>
                  <NativeSelect
                    value={s.template ?? ""}
                    invalid={!!errors["template"]}
                    onChange={(v) => set("template", (v || null) as TemplateType | null)}
                    options={["", ...TEMPLATES]}
                    labels={{
                      "": t("Chọn Default Template…", "Select Default Template…"),
                      ...Object.fromEntries(TEMPLATES.map((x) => [x, formName(x)])),
                    }}
                  />
                </Field>
              )}
              <Field label={t("Trạng thái", "Status")}>
                <NativeSelect
                  value={s.status}
                  onChange={(v) => set("status", v as Status)}
                  options={
                    s.status === "Draft" ? ["Draft", "Active", "Inactive"] : ["Active", "Inactive"]
                  }
                />
              </Field>
              <Field label={t("Ghi chú", "Remark")} className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={s.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
            </div>
          </Panel>

          {source && <ChildServicesPanel items={children} form={form} />}
        </TabsContent>

        <TabsContent value="form" className="max-w-4xl">
          <ServiceFormConfig
            form={form}
            root={root ?? { name: s.name.trim() || t("Dịch vụ này", "This service") }}
            inherited={!!parent}
            value={settings}
            onChange={(v) => {
              if (form) setSettingsDraft((d) => ({ ...d, [form]: v }));
            }}
          />
        </TabsContent>

        <TabsContent value="assign" className="max-w-5xl">
          <ServiceAssignments rows={rows} form={form} service={s} onChange={setRows} />
        </TabsContent>
      </Tabs>

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
