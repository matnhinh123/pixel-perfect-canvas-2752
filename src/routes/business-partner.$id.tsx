import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { History, Info, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, Field, NativeSelect, Panel } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { ReadOnlyScope } from "@/components/movex/general/FormParts";

/** A third of the 12-column row (3 fields per row on wide screens, 2 on medium). */
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { CustomerTab, DocumentsTab, VendorTab } from "@/components/movex/businessPartner/BpTabs";
import { MultiSelect } from "@/components/movex/businessPartner/MultiSelect";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  BP_CODE_MAX,
  businessPartnerService,
  draftOf,
  newBusinessPartnerDraft,
  normalizeBusinessPartner,
  sanitizeBpCode,
  lookupTaxPayer,
  sanitizePhone,
  sanitizePostcode,
  taxCodeKey,
  taxIdLabel,
  taxIdRequired,
  toEnglishAddress,
  type BusinessPartnerDraft,
} from "@/services/businessPartnerService";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  CURRENCIES,
  INVOICE_LANGUAGES,
  LEGAL_TYPES,
  PARTNER_GROUPS,
  provincesOf,
  SERVICE_PROVIDER_TYPES,
  TAX_OPTIONS,
} from "@/mock-data/businessPartners";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BP_ROLES, type BpRole, type BusinessPartnerRecord } from "@/types";

type Mode = "view" | "edit";
type Tab = "documents" | "customer" | "vendor";

/** Error key of a profile/role table → the tab that shows it. */
const TAB_OF_ERROR: [string, Tab][] = [
  ["documents", "documents"],
  ["licenseAdjustments", "documents"],
  ["customer.", "customer"],
  ["vendor.", "vendor"],
];

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
  const all = useCollection(businessPartnerRepository);
  const raw = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  // Records saved by older versions are brought to the current shape before the form reads them.
  const source = useMemo(() => (raw ? normalizeBusinessPartner(raw) : null), [raw]);
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
  // The detail is always an editable form; `key` resets it when switching records or after a save.
  return (
    <BpForm
      key={source ? `${source.id}:${JSON.stringify(source)}` : "new"}
      source={source}
      readOnly={false}
    />
  );
}

function BpForm({ source, readOnly }: { source: BusinessPartnerRecord | null; readOnly: boolean }) {
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
  /** Table tabs report errors per table; editing a table clears that table's messages. */
  const patchTables = (p: Partial<BusinessPartnerDraft>) => {
    setD((x) => ({ ...x, ...p }));
    const keys = Object.keys(p);
    setErrors((e) =>
      Object.fromEntries(
        Object.entries(e).filter(([k]) => !keys.some((t) => k === t || k.startsWith(t + "."))),
      ),
    );
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
  /** Default currency always belongs to the partner's currencies: picking it adds it there. */
  const setDefaultCurrency = (currency: string) => {
    patch({
      currency,
      ...(currency && !d.currencies.includes(currency)
        ? { currencies: CURRENCIES.filter((c) => c === currency || d.currencies.includes(c)) }
        : {}),
      ...(!d.creditLimitCurrency ? { creditLimitCurrency: currency } : {}),
    });
    clearErr(["currencies"]);
  };

  const rolesChanged = !!source && source.roles.join() !== BP_ROLES.filter(hasRole).join();

  const taxLabel = taxIdLabel(d.legalType);
  /** English Address follows the Local Address (transliterated) until the user edits it. */
  const setLocalAddress = (v: string) => {
    setD((x) => ({
      ...x,
      localAddress: v,
      englishAddress:
        !x.englishAddress || x.englishAddress === toEnglishAddress(x.localAddress)
          ? toEnglishAddress(v)
          : x.englishAddress,
    }));
    clearErr(["localAddress", "englishAddress"]);
  };
  /** Company "Get Info": tax-authority lookup by MST (mock registry in the demo) fills name and address. */
  const getTaxInfo = () => {
    const res = lookupTaxPayer(d.taxCode);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    const key = taxCodeKey(d.taxCode);
    const dup = businessPartnerRepository
      .all()
      .find(
        (b) => !b.deleted && b.id !== source?.id && taxCodeKey(String(b.taxCode ?? "")) === key,
      );
    if (dup) {
      toast.error(
        t(`MST đã được dùng cho ${dup.bpCode}.`, `Tax Code is already used by ${dup.bpCode}.`),
      );
      return;
    }
    const { localName, englishName, localAddress } = res.info;
    patch({ localName, englishName, localAddress, englishAddress: toEnglishAddress(localAddress) });
    toast.success(t("Đã lấy thông tin doanh nghiệp.", "Company information retrieved."));
  };

  const back = () => void navigate({ to: "/business-partner" });

  const save = async () => {
    setFormError(null);
    if (rolesChanged) {
      const r = await confirm({
        title: t("Thay đổi vai trò?", "Change roles?"),
        description: t(
          "Vai trò quyết định hoá đơn đầu ra/đầu vào và công nợ 131/331. Thay đổi chỉ áp dụng cho nghiệp vụ phát sinh sau này; các record/hoá đơn đã xử lý không bị ảnh hưởng.",
          "Roles drive outgoing/incoming invoices and the 131/331 ledgers. The change only applies to future transactions; records/invoices already processed are not affected.",
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
          ? t(`Đã tạo ${saved.bpCode}`, `${saved.bpCode} created`)
          : t(`Đã lưu ${saved.bpCode}`, `${saved.bpCode} saved`),
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
        const hit = TAB_OF_ERROR.find(([prefix]) =>
          k.some((x) => x === prefix || (prefix.endsWith(".") && x.startsWith(prefix))),
        );
        if (hit) setTab(hit[1]);
      }
      toast.error(err instanceof Error ? err.message : t("Lưu thất bại", "Save failed"));
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Business Partners", to: "/business-partner" },
          ...(source ? [{ label: source.bpCode }] : []),
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
        subtitle={source ? source.bpCode : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/business-partner" }) : back())}
        onCancel={back}
        onSave={() => void save()}
        extra={
          source && (
            <>
              <div className="relative">
                <span
                  className={cn(
                    "absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full",
                    d.status === "Active" ? "bg-success" : "bg-muted-foreground",
                  )}
                />
                <select
                  aria-label="Status"
                  value={d.status}
                  onChange={(e) => patch({ status: e.target.value as "Active" | "Inactive" })}
                  className="h-11 appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ▾
                </span>
              </div>
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                {t("Lịch sử", "History")}
              </Button>
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      {/* View mode: everything inside is disabled natively and restyled to read like plain text. */}
      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <Panel title="General Information">
          {/* Role first, then one 6-column grid: short values take one column, names/addresses take half. */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
            {/* Not a <Field>: that renders a <label>, and a click anywhere on this full-width row would
                tick the first checkbox. Each checkbox has its own label instead. */}
            <div
              role="group"
              aria-label="Role"
              className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6"
            >
              <span className="text-sm font-semibold text-foreground">
                Role<span className="ml-0.5 text-destructive">*</span>
              </span>
              <div className="flex h-9 items-center gap-6">
                {(["Customer", "Vendor"] as const).map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasRole(r)}
                      onCheckedChange={(on) => toggleRole(r, on === true)}
                    />
                    {r}
                  </label>
                ))}
              </div>
              {rolesChanged && (
                <p className="mt-1 text-xs text-warning">
                  {t(
                    "Đổi vai trò chỉ áp dụng cho nghiệp vụ mới, không ảnh hưởng record/hoá đơn cũ.",
                    "A role change only applies to new transactions; existing records/invoices are untouched.",
                  )}
                </p>
              )}
              {errors["roles"] && (
                <span className="text-xs font-medium text-destructive">{errors["roles"]}</span>
              )}
            </div>

            <Field label="Legal Type" required error={errors["legalType"]}>
              <NativeSelect
                {...select("legalType", LEGAL_TYPES, "Select Legal Type")}
                onChange={(v) => {
                  // The ID field's meaning (and whether it is required) follows the Legal Type.
                  patch({ legalType: v as BusinessPartnerDraft["legalType"] });
                  clearErr(["taxCode"]);
                }}
              />
            </Field>
            <Field
              label="BP Code"
              required
              error={errors["bpCode"]}
              hint={readOnly ? undefined : `${d.bpCode.length}/${BP_CODE_MAX}`}
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
            <Field
              label={taxLabel}
              required={taxIdRequired(d.legalType)}
              error={errors["taxCode"]}
              className="sm:col-span-2"
            >
              <div className="flex gap-2">
                <Input placeholder={`Enter ${taxLabel}`} {...text("taxCode")} />
                {d.legalType === "Company" && !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 px-2.5"
                    onClick={getTaxInfo}
                  >
                    Get Info
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Partner Group" required error={errors["partnerGroup"]}>
              <NativeSelect {...select("partnerGroup", PARTNER_GROUPS, "Select Partner Group")} />
            </Field>
            <Field label="Service Provider Type">
              <NativeSelect
                {...select("serviceProviderType", SERVICE_PROVIDER_TYPES, "Select Type")}
              />
            </Field>

            <Field
              label="Business Category"
              required
              error={errors["businessCategory"]}
              className="sm:col-span-2 lg:col-span-3"
            >
              <MultiSelect
                value={d.businessCategory}
                onChange={(businessCategory) => patch({ businessCategory })}
                options={BUSINESS_CATEGORIES}
                placeholder="Select Business Category"
                invalid={!!errors["businessCategory"]}
              />
            </Field>
            <Field label="Tax">
              <NativeSelect {...select("tax", TAX_OPTIONS, "Select Tax")} />
            </Field>
            <Field
              label="Currency"
              required
              error={errors["currency"]}
              info={t("Mặc định theo tiền tệ của tenant.", "Defaults to the tenant currency.")}
            >
              <NativeSelect
                {...select("currency", CURRENCIES, "Select Currency")}
                onChange={setDefaultCurrency}
              />
            </Field>
            <Field label="Invoicing Language">
              <NativeSelect {...select("invoiceLanguage", INVOICE_LANGUAGES, "Select Language")} />
            </Field>

            <Field
              label="Local Name"
              required
              error={errors["localName"]}
              className="sm:col-span-2 lg:col-span-3"
            >
              <Input placeholder="Enter Local Name" {...text("localName")} />
            </Field>
            <Field
              label="English Name"
              required
              error={errors["englishName"]}
              className="sm:col-span-2 lg:col-span-3"
            >
              <Input placeholder="Enter English Name" {...text("englishName")} />
            </Field>

            <Field
              label="Local Address"
              required
              error={errors["localAddress"]}
              className="sm:col-span-2 lg:col-span-3"
            >
              <Textarea
                rows={2}
                placeholder="Enter Local Address"
                value={d.localAddress}
                onChange={(e) => setLocalAddress(e.target.value)}
                aria-invalid={!!errors["localAddress"] || undefined}
              />
            </Field>
            <Field
              label="English Address"
              required
              error={errors["englishAddress"]}
              info={t(
                "Tự điền từ Local Address (bỏ dấu) — vui lòng kiểm tra lại.",
                "Filled in from Local Address — please review.",
              )}
              className="sm:col-span-2 lg:col-span-3"
            >
              <Textarea rows={2} placeholder="Enter English Address" {...text("englishAddress")} />
            </Field>

            <Field label="Country" required error={errors["country"]}>
              <NativeSelect
                {...select("country", COUNTRIES, "Select Country")}
                onChange={(country) => {
                  // A Province of another Country no longer applies.
                  patch({
                    country,
                    ...(provincesOf(country).includes(d.province) ? {} : { province: "" }),
                  });
                  clearErr(["province"]);
                }}
              />
            </Field>
            <Field label="Province" error={errors["province"]}>
              <NativeSelect
                {...select(
                  "province",
                  provincesOf(d.country),
                  d.country ? "Select Province" : "Select Country first",
                )}
                disabled={!d.country}
              />
            </Field>
            <Field label="Post Code" error={errors["postcode"]}>
              <Input
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter Post Code"
                value={d.postcode}
                onChange={(e) => patch({ postcode: sanitizePostcode(e.target.value) })}
                aria-invalid={!!errors["postcode"] || undefined}
              />
            </Field>
            <Field label="Email" error={errors["email"]} className="sm:col-span-2">
              <Input placeholder="Enter Email" {...text("email")} />
            </Field>
            <Field label="Phone" error={errors["phone"]}>
              <Input
                inputMode="tel"
                placeholder="Enter Phone"
                value={d.phone}
                onChange={(e) => patch({ phone: sanitizePhone(e.target.value) })}
                aria-invalid={!!errors["phone"] || undefined}
              />
            </Field>
          </div>
        </Panel>
      </ReadOnlyScope>

      <Tabs value={visibleTab} onValueChange={(v) => setTab(v as Tab)} className="mt-4">
        <TabsList className="h-auto w-full justify-start rounded-t-xl bg-card-header p-0">
          {(
            [
              ["documents", "Documents & License", true],
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
          title={source.bpCode}
        />
      )}
    </div>
  );
}
