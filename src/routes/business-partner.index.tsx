import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import {
  bpCrud,
  businessPartnerImportConfig,
  normalizeBusinessPartner,
} from "@/services/businessPartnerService";
import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { useT } from "@/lib/i18n";
import { BP_ROLES, type BusinessPartnerRecord } from "@/types";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  INVOICE_LANGUAGES,
  LEGAL_TYPES,
} from "@/mock-data/businessPartners";

export const Route = createFileRoute("/business-partner/")({
  head: () => ({
    meta: [
      { title: "Business Partner — MoveX" },
      { name: "description", content: "Business partner master data: customers and vendors." },
    ],
  }),
  component: BusinessPartnerList,
});

type Row = BusinessPartnerRecord;
type T = (vi: string, en: string) => string;

/**
 * The list mirrors the General Information form field for field, in the same order (BP Code is
 * pinned on the left; Status, shown in the detail header, comes last). Labels match the form.
 */
const columnsFor = (t: T): ListColumn<Row>[] => [
  {
    key: "bpCode",
    width: 150,
    label: "BP Code",
    type: "text",
    pinned: true,
    value: (r) => r.bpCode,
    render: (r) => <span className="font-semibold text-primary">{r.bpCode}</span>,
  },
  {
    key: "legalType",
    width: 120,
    label: "Legal Type",
    type: "enum",
    options: [...LEGAL_TYPES],
    value: (r) => r.legalType,
  },
  {
    key: "taxCode",
    width: 130,
    label: "Tax Code",
    type: "text",
    value: (r) => r.taxCode,
  },
  {
    key: "identityNo",
    width: 150,
    label: "Identity Number",
    type: "text",
    value: (r) => r.identityNo,
  },
  {
    key: "localName",
    width: 240,
    truncate: true,
    label: "Local Name",
    type: "text",
    value: (r) => r.localName,
    className: "font-medium",
  },
  {
    key: "localAddress",
    width: 260,
    truncate: true,
    label: "Local Address",
    type: "text",
    value: (r) => r.localAddress,
  },
  {
    key: "englishName",
    width: 240,
    truncate: true,
    label: "English Name",
    type: "text",
    value: (r) => r.englishName,
  },
  {
    key: "englishAddress",
    width: 260,
    truncate: true,
    label: "English Address",
    type: "text",
    value: (r) => r.englishAddress,
  },
  {
    key: "businessCategory",
    width: 180,
    truncate: true,
    label: "Business Category",
    type: "text",
    value: (r) => r.businessCategory.join(", "),
  },
  {
    key: "invoiceLanguage",
    width: 160,
    label: "Invoicing Language",
    type: "enum",
    options: INVOICE_LANGUAGES,
    value: (r) => r.invoiceLanguage,
  },
  {
    key: "invoiceSerial",
    width: 130,
    label: "Invoice Serial",
    type: "text",
    value: (r) => r.invoiceSerial,
  },
  {
    key: "country",
    width: 120,
    label: "Country",
    type: "enum",
    options: COUNTRIES,
    value: (r) => r.country,
  },
  {
    key: "currency",
    width: 140,
    label: "Currency",
    type: "text",
    // Default currency first, then the others.
    value: (r) =>
      [r.currency, ...r.currencies.filter((c) => c !== r.currency)].filter(Boolean).join(", "),
  },
  {
    key: "roles",
    width: 170,
    label: "Role",
    type: "text",
    value: (r) => r.roles.join(", "),
    render: (r) => (
      <span className="flex flex-nowrap gap-1">
        {r.roles.map((x) => (
          <Tag key={x}>{x}</Tag>
        ))}
      </span>
    ),
  },
  {
    key: "status",
    width: 110,
    label: t("Trạng thái", "Status"),
    type: "enum",
    options: ["Active", "Inactive"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function BusinessPartnerList() {
  const { t, lang } = useT();
  const businessCategories = useCodeOptions(CC.BUSINESS_CATEGORY, BUSINESS_CATEGORIES);
  const legalTypes = useCodeOptions(CC.LEGAL_TYPE, LEGAL_TYPES);
  const navigate = useNavigate();
  const all = useCollection(businessPartnerRepository);
  // Records saved by older versions are normalized (e.g. single Business Category → list).
  const rows = useMemo(() => all.filter((r) => !r.deleted).map(normalizeBusinessPartner), [all]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/business-partner/$id", params: { id: r.id }, search: { mode } });

  return (
    <EntityListPage<Row>
      screen="business-partner"
      entityType="Business Partner"
      entityLabel="Business Partner"
      title="Business Partner"
      rows={rows}
      columns={columns}
      searchPlaceholder={t("Tìm BP Code, tên, mã số thuế...", "Search BP Code, name, tax code...")}
      searchValues={(r) => [r.bpCode, r.localName, r.englishName, r.taxCode, r.identityNo]}
      quickFilters={[
        {
          key: "status",
          allLabel: t("Trạng thái: Tất cả", "Status: All"),
          options: ["Active", "Inactive"].map((s) => ({
            label: s,
            conditions: [{ field: "status", operator: "eq", value: s }],
          })),
        },
        {
          key: "legalType",
          allLabel: t("Loại pháp lý: Tất cả", "Legal Type: All"),
          options: legalTypes.map((lt) => ({
            label: lt,
            conditions: [{ field: "legalType", operator: "eq", value: lt }],
          })),
        },
        {
          key: "role",
          allLabel: t("Vai trò: Tất cả", "Role: All"),
          options: BP_ROLES.map((role) => ({
            label: role,
            conditions: [{ field: "roles", operator: "contains", value: role }],
          })),
        },
        {
          key: "businessCategory",
          allLabel: t("Ngành nghề: Tất cả", "Category: All"),
          options: businessCategories.map((c) => ({
            label: c,
            conditions: [{ field: "businessCategory", operator: "contains", value: c }],
          })),
        },
      ]}
      showRefresh={false}
      crud={bpCrud}
      importConfig={businessPartnerImportConfig}
      addLabel="Add Business Partner"
      onAdd={() =>
        void navigate({ to: "/business-partner/$id", params: { id: "new" }, search: {} })
      }
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
