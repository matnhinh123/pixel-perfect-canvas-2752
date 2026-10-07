import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { History, Info, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { CustomerTab, DocumentsTab, VendorTab } from "@/components/movex/businessPartner/BpTabs";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  BP_CODE_MAX,
  businessPartnerService,
  draftOf,
  newBusinessPartnerDraft,
  nextBpNumber,
  sanitizeBpCode,
  type BusinessPartnerDraft,
} from "@/services/businessPartnerService";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  CURRENCIES,
  FORMS,
  INVOICE_LANGUAGES,
  LEGAL_TYPES,
  PARTNER_SCOPES,
  PROVINCES,
  SERVICE_PROVIDER_TYPES,
} from "@/mock-data/businessPartners";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BP_ROLES, type BpRole } from "@/types";

type Mode = "view" | "edit";
type Tab = "documents" | "customer" | "vendor";

export const Route = createFileRoute("/business-partner/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      {
        title: params.id === "new" ? "Create Business Partner — MoveX" : "Business Partner — MoveX",
      },
    ],
  }),
  component: BusinessPartnerPage,
});

function BusinessPartnerPage() {
  const { t } = useT();
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(businessPartnerRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title={t("Không tìm thấy Business Partner", "Business Partner not found")}
          action={
            <Button asChild size="sm">
              <Link to="/business-partner">{t("Về danh sách", "Back to list")}</Link>
            </Button>
          }
        />
      </Panel>
    );
  // `key` resets the form state when switching between records / modes.
  return (
    <BpForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

/** 12-column form grid: S3 = a quarter of the row (short fields), S6 = half (names, addresses). */
const S3 = "sm:col-span-3 lg:col-span-3";
const S6 = "sm:col-span-6 lg:col-span-6";

function Group({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-3 text-sm font-semibold text-card-title">
        <span>
          {title}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        <span className="h-px flex-1 bg-border" />
      </h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-12">
        {children}
      </div>
    </section>
  );
}

/** Everything inside is natively disabled in view mode and restyled to read like plain text. */
function ReadOnlyScope({
  readOnly,
  className,
  children,
}: {
  readOnly: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={readOnly}
      className={cn(
        "group min-w-0",
        "[&_input:disabled]:bg-muted/40 [&_input:disabled]:text-foreground [&_input:disabled]:opacity-100 [&_input:disabled]:placeholder:text-transparent",
        "[&_textarea:disabled]:bg-muted/40 [&_textarea:disabled]:text-foreground [&_textarea:disabled]:opacity-100 [&_textarea:disabled]:placeholder:text-transparent",
        "[&_select:disabled]:appearance-none [&_select:disabled]:bg-muted/40 [&_select:disabled]:text-foreground [&_select:disabled]:opacity-100",
        className,
      )}
    >
      {children}
    </fieldset>
  );
}

function BpForm({
  source,
  readOnly,
}: {
  source: ReturnType<typeof businessPartnerRepository.get> | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isNew = !source;
  const initial = useMemo<BusinessPartnerDraft>(
    () => (source ? draftOf(source) : newBusinessPartnerDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const clearErr = (keys: string[]) =>
    setErrors((e) => {
      const n = { ...e };
      keys.forEach((k) => delete n[k]);
      return n;
    });
  const patch = (p: Partial<BusinessPartnerDraft>) => {
    setD((x) => ({ ...x, ...p }));
    clearErr(Object.keys(p));
  };
  /** Table tabs report errors per table; editing any table clears that tab's messages. */
  const patchTables = (p: Partial<BusinessPartnerDraft>) => {
    setD((x) => ({ ...x, ...p }));
    const prefix = "customer" in p ? "customer." : "vendor" in p ? "vendor." : "documents";
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(prefix))));
  };
  const text = (k: keyof BusinessPartnerDraft) => ({
    value: String(d[k] ?? ""),
    onChange: (e: { target: { value: string } }) => patch({ [k]: e.target.value }),
    "aria-invalid": !!errors[k] || undefined,
  });
  const select = (
    k: keyof BusinessPartnerDraft,
    options: readonly string[],
    placeholder: string,
  ): Parameters<typeof NativeSelect>[0] => ({
    value: String(d[k] ?? ""),
    onChange: (v) => patch({ [k]: v }),
    options: ["", ...options],
    labels: { "": readOnly ? "—" : placeholder },
    className: "w-full",
    invalid: !!errors[k],
  });

  const hasRole = (r: BpRole) => d.roles.includes(r);
  const toggleRole = (r: BpRole, on: boolean) =>
    patch({ roles: on ? [...d.roles, r] : d.roles.filter((x) => x !== r) });
  const visibleTab: Tab =
    (tab === "customer" && !hasRole("Customer")) || (tab === "vendor" && !hasRole("Vendor"))
      ? "documents"
      : tab;

  const preview = d.roles.length ? nextBpNumber(d.roles) : "";
  const rolesChanged = !!source && source.roles.join() !== BP_ROLES.filter(hasRole).join();

  const back = () =>
    source
      ? void navigate({
          to: "/business-partner/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/business-partner" });

  const save = async () => {
    setFormError(null);
    if (rolesChanged) {
      const r = await confirm({
        title: t("Thay đổi vai trò?", "Change roles?"),
        description: t(
          "Vai trò quyết định hoá đơn đầu ra/đầu vào và công nợ 131/331. Thay đổi chỉ áp dụng cho nghiệp vụ phát sinh sau này; các record/hoá đơn đã xử lý và BP Identity Number không bị ảnh hưởng.",
          "Roles drive outgoing/incoming invoices and the 131/331 ledgers. The change only applies to future transactions; records/invoices already processed and the BP Identity Number are not affected.",
        ),
        confirmLabel: t("Lưu thay đổi", "Save changes"),
      });
      if (r !== "confirm") return;
    }
    try {
      const saved = businessPartnerService.save(d, source?.id);
      guard.allowNext();
      toast.success(
        isNew
          ? t(`Đã tạo ${saved.bpNumber}`, `${saved.bpNumber} created`)
          : t(`Đã lưu ${saved.bpNumber}`, `${saved.bpNumber} saved`),
      );
      void navigate({
        to: "/business-partner/$id",
        params: { id: saved.id },
        search: { mode: "view" },
      });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(t("Chưa thể lưu — vui lòng kiểm tra:", "Cannot save yet — please check:"));
        // Table errors live inside tabs: jump to the first tab that has one.
        const k = Object.keys(err.fieldErrors);
        if (k.some((x) => x.startsWith("customer.")) && hasRole("Customer")) setTab("customer");
        else if (k.some((x) => x.startsWith("vendor.")) && hasRole("Vendor")) setTab("vendor");
        else if (k.includes("documents") && !k.some((x) => !x.includes("."))) setTab("documents");
      }
      toast.error(err instanceof Error ? err.message : t("Lưu thất bại", "Save failed"));
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Business Partners", to: "/business-partner" },
          ...(source ? [{ label: source.bpNumber }] : []),
          {
            label: isNew ? "Add New" : readOnly ? t("Chi tiết", "Detail") : t("Chỉnh sửa", "Edit"),
          },
        ]}
        title={
          isNew
            ? "Create Business Partner"
            : readOnly
              ? source.englishName
              : t(`Chỉnh sửa: ${source.englishName}`, `Edit: ${source.englishName}`)
        }
        subtitle={source ? source.bpNumber : undefined}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/business-partner" }) : back())}
        onCancel={back}
        onSave={() => void save()}
        extra={
          source && (
            <>
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                {t("Lịch sử", "History")}
              </Button>
              {readOnly && (
                <Button asChild size="lg">
                  <Link
                    to="/business-partner/$id"
                    params={{ id: source.id }}
                    search={{ mode: "edit" }}
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

      {/* View mode: everything inside is disabled natively and restyled to read like plain text. */}
      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <Panel title="General Information" bodyClassName="space-y-6">
          <Group title="Role" required>
            <div className="col-span-full flex flex-wrap gap-3">
              {(
                [
                  ["Customer", t("Công nợ phải thu · TK 131", "Receivable · account 131")],
                  ["Vendor", t("Công nợ phải trả · TK 331", "Payable · account 331")],
                  ["Employee", t("Nhân viên nội bộ", "Internal staff")],
                ] as const
              ).map(([r, hint]) => (
                <label
                  key={r}
                  className={cn(
                    "flex min-w-52 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 group-disabled:cursor-default",
                    hasRole(r) ? "border-primary bg-accent" : "bg-card hover:border-primary/50",
                  )}
                >
                  <Checkbox
                    checked={hasRole(r)}
                    onCheckedChange={(on) => toggleRole(r, on === true)}
                  />
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold">{r}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors["roles"] && (
              <p className="mt-1.5 text-xs font-medium text-destructive">{errors["roles"]}</p>
            )}
            {rolesChanged && (
              <p className="mt-1.5 text-xs text-warning">
                {t(
                  "Đổi vai trò chỉ áp dụng cho nghiệp vụ mới, không ảnh hưởng record/hoá đơn cũ.",
                  "A role change only applies to new transactions; existing records/invoices are untouched.",
                )}
              </p>
            )}
          </Group>

          <Group title={t("Định danh", "Identification")}>
            <Field label="BP Identity Number" className={S3}>
              <Input
                readOnly
                disabled
                className="font-semibold"
                value={source?.bpNumber ?? preview}
                placeholder={t("Tự sinh khi lưu", "Generated on save")}
              />
            </Field>
            <Field
              label="BP Code"
              required
              error={errors["bpCode"]}
              hint={readOnly ? undefined : `${d.bpCode.length}/${BP_CODE_MAX}`}
              className={S3}
            >
              <div className="relative">
                <Input
                  value={d.bpCode}
                  maxLength={BP_CODE_MAX}
                  placeholder="Enter BP Code"
                  onChange={(e) => patch({ bpCode: sanitizeBpCode(e.target.value) })}
                  aria-invalid={!!errors["bpCode"] || undefined}
                  className="pr-9"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t(
                      "Duy nhất, tự viết hoa. A–Z, 0–9, . - _ (tối đa 50 ký tự).",
                      "Unique, auto-uppercase. A–Z, 0–9, . - _ (max 50 characters).",
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </Field>
            <Field label="Legal Type" required error={errors["legalType"]} className={S3}>
              <NativeSelect {...select("legalType", LEGAL_TYPES, "Select Legal Type")} />
            </Field>
            <Field label="Status" className={S3}>
              <NativeSelect
                value={d.status}
                onChange={(v) => patch({ status: v as "Active" | "Inactive" })}
                options={["Active", "Inactive"]}
                className="w-full"
              />
            </Field>
            <Field label="Tax Code" required error={errors["taxCode"]} className={S3}>
              <Input placeholder="Enter Tax Code" {...text("taxCode")} />
            </Field>
            <Field label="Form" className={S3}>
              <NativeSelect {...select("form", FORMS, "Select Form")} />
            </Field>
            <Field label="Invoice Serial" className={S3}>
              <Input placeholder="Enter Invoice Serial" {...text("invoiceSerial")} />
            </Field>
            <Field label="In-house Partner" className={S3}>
              <div className="flex h-9 items-center gap-2">
                <Switch checked={d.inHouse} onCheckedChange={(v) => patch({ inHouse: v })} />
                <span className="text-sm">{d.inHouse ? "Yes" : "No"}</span>
              </div>
            </Field>
          </Group>

          <Group title={t("Tên & địa chỉ", "Name & Address")}>
            <Field label="Local Name" required error={errors["localName"]} className={S6}>
              <Textarea rows={2} placeholder="Enter Local Name" {...text("localName")} />
            </Field>
            <Field label="English Name" required error={errors["englishName"]} className={S6}>
              <Textarea rows={2} placeholder="Enter English Name" {...text("englishName")} />
            </Field>
            <Field label="Local Address" required error={errors["localAddress"]} className={S6}>
              <Textarea rows={2} placeholder="Enter Local Address" {...text("localAddress")} />
            </Field>
            <Field label="English Address" className={S6}>
              <Textarea rows={2} placeholder="Enter English Address" {...text("englishAddress")} />
            </Field>
            <Field label="Country" required error={errors["country"]} className={S3}>
              <NativeSelect {...select("country", COUNTRIES, "Select Country")} />
            </Field>
            <Field label="Province" className={S3}>
              <NativeSelect {...select("province", PROVINCES, "Select Province")} />
            </Field>
            <Field label="Postcode" className={S3}>
              <Input placeholder="Enter Postcode" {...text("postcode")} />
            </Field>
            <Field label="Fax" className={S3}>
              <Input placeholder="Enter Fax" {...text("fax")} />
            </Field>
          </Group>

          <Group title={t("Liên hệ & mặc định", "Contact & Defaults")}>
            <Field label="Email" error={errors["email"]} className={S3}>
              <Input placeholder="Enter Email" {...text("email")} />
            </Field>
            <Field label="Phone Number" className={S3}>
              <Input placeholder="Enter Phone Number" {...text("phone")} />
            </Field>
            <Field label="Def Invoicing Language" className={S3}>
              <NativeSelect
                {...select("invoiceLanguage", INVOICE_LANGUAGES, "Select Invoice Language")}
              />
            </Field>
            <Field label="Def Currency" required error={errors["currency"]} className={S3}>
              <NativeSelect {...select("currency", CURRENCIES, "Select Currency")} />
            </Field>
          </Group>

          <Group title={t("Phân loại", "Classification")}>
            <Field
              label="Business Category"
              required
              error={errors["businessCategory"]}
              className={S3}
            >
              <NativeSelect
                {...select("businessCategory", BUSINESS_CATEGORIES, "Select Business Category")}
              />
            </Field>
            <Field label="Partner Scope" required error={errors["partnerScope"]} className={S3}>
              <NativeSelect {...select("partnerScope", PARTNER_SCOPES, "Select Partner Scope")} />
            </Field>
            <Field label="Service Provider Type" className={S3}>
              <NativeSelect
                {...select(
                  "serviceProviderType",
                  SERVICE_PROVIDER_TYPES,
                  "Select Service Provider Type",
                )}
              />
            </Field>
          </Group>
        </Panel>
      </ReadOnlyScope>

      <Tabs value={visibleTab} onValueChange={(v) => setTab(v as Tab)} className="mt-4">
        <TabsList className="h-auto w-full justify-start rounded-t-xl bg-card-header p-0">
          {(
            [
              ["documents", "Documents", true],
              ["customer", "Customer", hasRole("Customer")],
              ["vendor", "Vendor", hasRole("Vendor")],
            ] as const
          )
            .filter(([, , shown]) => shown)
            .map(([k, label]) => (
              <TabsTrigger key={k} value={k} className="rounded-none px-6 py-3 text-sm">
                {label}
              </TabsTrigger>
            ))}
        </TabsList>
        <ReadOnlyScope readOnly={readOnly}>
          <div className="rounded-b-xl border border-t-0 bg-card p-4">
            {visibleTab === "documents" && <DocumentsTab d={d} set={patchTables} errors={errors} />}
            {visibleTab === "customer" && <CustomerTab d={d} set={patchTables} errors={errors} />}
            {visibleTab === "vendor" && <VendorTab d={d} set={patchTables} errors={errors} />}
          </div>
        </ReadOnlyScope>
      </Tabs>

      <Panel title={t("Quy ước (Convention)", "Convention")} className="mt-4">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold">BP Identity Number</div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {t(
                  "Hệ thống tự sinh: BP + [vai trò] + [YY] + [4 số tuần tự], ví dụ BP0260008.",
                  "System-generated: BP + [role] + [YY] + [4-digit sequence], e.g. BP0260008.",
                )}
              </li>
              <li>
                BP0 = {t("nhiều vai trò", "multiple roles")} · BP1 = Vendor · BP2 = Customer · BP3 =
                Employee
              </li>
              <li>
                {t(
                  "Số tuần tự dùng chung toàn hệ thống (không tính Employee); Employee có bộ đếm riêng.",
                  "One shared running sequence for the whole system (Employee excluded); Employee has its own.",
                )}
              </li>
              <li>
                {t(
                  "Mã đã cấp không đổi khi sửa vai trò hay thông tin.",
                  "An issued number never changes when roles or details are edited.",
                )}
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-1 font-semibold">BP Code</div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t("Tự động viết HOA toàn bộ.", "Automatically UPPERCASE.")}</li>
              <li>
                {t(
                  "Chỉ cho phép A→Z, 0→9 và các dấu: chấm (.), gạch ngang (-), gạch dưới (_). Không cho phép ký tự khác.",
                  "Only A→Z, 0→9 and: dot (.), hyphen (-), underscore (_). No other characters.",
                )}
              </li>
              <li>{t("Tối đa 50 ký tự.", "Maximum 50 characters.")}</li>
              <li>
                {t(
                  "Duy nhất, dùng làm từ khoá tìm kiếm và hiển thị.",
                  "Unique; used as the search keyword and display name.",
                )}
              </li>
            </ul>
          </div>
        </div>
      </Panel>

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-7 mt-4 flex items-center justify-end gap-2 border-t bg-card/95 px-7 py-3 backdrop-blur">
          {dirty && (
            <span className="mr-auto text-sm font-medium text-warning">
              {t("Có thay đổi chưa lưu", "You have unsaved changes")}
            </span>
          )}
          <Button variant="outline" onClick={back}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={() => void save()}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      )}

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Business Partner"
          entityId={source.id}
          title={source.bpNumber}
        />
      )}
    </div>
  );
}
