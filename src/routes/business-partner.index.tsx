import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import { bpCrud } from "@/services/businessPartnerService";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { BP_ROLES, type BusinessPartnerRecord } from "@/types";
import { LEGAL_TYPES } from "@/mock-data/businessPartners";

export const Route = createFileRoute("/business-partner/")({
  head: () => ({
    meta: [
      { title: "Business Partner — MoveX" },
      { name: "description", content: "Customers, vendors and employees master data." },
    ],
  }),
  component: BusinessPartnerList,
});

type Row = BusinessPartnerRecord;
type T = (vi: string, en: string) => string;

const allColumns = (t: T): ListColumn<Row>[] => [
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
    width: 105,
    label: "Legal Type",
    type: "enum",
    options: [...LEGAL_TYPES],
    value: (r) => r.legalType,
  },
  { key: "taxCode", width: 120, label: "Tax ID", type: "text", value: (r) => r.taxCode },
  {
    key: "invoiceSerial",
    width: 115,
    label: "Invoice Serial",
    type: "text",
    value: (r) => r.invoiceSerial,
  },
  {
    key: "localName",
    width: 230,
    truncate: true,
    label: "Local Name",
    type: "text",
    value: (r) => r.localName,
    className: "font-medium",
  },
  {
    key: "englishName",
    width: 230,
    truncate: true,
    label: "English Name",
    type: "text",
    value: (r) => r.englishName,
  },
  { key: "email", width: 190, truncate: true, label: "Email", type: "text", value: (r) => r.email },
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
    key: "phone",
    width: 130,
    defaultHidden: true,
    label: "Phone",
    type: "text",
    value: (r) => r.phone,
  },
  {
    key: "form",
    width: 90,
    label: "Form",
    type: "text",
    value: (r) => r.form,
    defaultHidden: true,
  },
  {
    key: "localAddress",
    width: 260,
    truncate: true,
    label: "Local Address",
    type: "text",
    value: (r) => r.localAddress,
    defaultHidden: true,
  },
  {
    key: "englishAddress",
    width: 260,
    truncate: true,
    label: "English Address",
    type: "text",
    value: (r) => r.englishAddress,
    defaultHidden: true,
  },
  {
    key: "country",
    width: 110,
    label: "Country",
    type: "text",
    value: (r) => r.country,
    defaultHidden: true,
  },
  {
    key: "province",
    width: 140,
    truncate: true,
    label: "Province",
    type: "text",
    value: (r) => r.province,
    defaultHidden: true,
  },
  {
    key: "postcode",
    width: 100,
    label: "Postcode",
    type: "text",
    value: (r) => r.postcode,
    defaultHidden: true,
  },
  { key: "fax", width: 120, label: "Fax", type: "text", value: (r) => r.fax, defaultHidden: true },
  {
    key: "invoiceLanguage",
    width: 150,
    label: "Invoice Lang.",
    type: "text",
    value: (r) => r.invoiceLanguage,
    defaultHidden: true,
  },
  {
    key: "currency",
    width: 110,
    label: "Currency",
    type: "text",
    value: (r) => r.currency,
    defaultHidden: true,
  },
  {
    key: "businessCategory",
    width: 160,
    truncate: true,
    label: "Category",
    type: "text",
    value: (r) => r.businessCategory,
    defaultHidden: true,
  },
  {
    key: "partnerScope",
    width: 130,
    label: "Scope",
    type: "text",
    value: (r) => r.partnerScope,
    defaultHidden: true,
  },
  {
    key: "serviceProviderType",
    width: 170,
    truncate: true,
    label: "Provider Type",
    type: "text",
    value: (r) => r.serviceProviderType,
    defaultHidden: true,
  },
  {
    key: "inHouse",
    width: 120,
    label: "In-house",
    type: "enum",
    options: ["Yes", "No"],
    value: (r) => (r.inHouse ? "Yes" : "No"),
    defaultHidden: true,
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
  {
    key: "createdAt",
    width: 150,
    label: t("Ngày tạo", "Created At"),
    type: "date",
    value: (r) => r.createdAt.slice(0, 10),
    render: (r) => formatDateTime(r.createdAt),
    defaultHidden: true,
  },
  {
    key: "createdBy",
    width: 130,
    truncate: true,
    label: t("Người tạo", "Created By"),
    type: "text",
    value: (r) => r.createdBy,
    defaultHidden: true,
  },
];

/** Default left-to-right order: identity, names, role and status first so they stay on screen. */
const COLUMN_ORDER = [
  "bpCode",
  "localName",
  "englishName",
  "roles",
  "status",
  "legalType",
  "taxCode",
];
const columnsFor = (t: T): ListColumn<Row>[] => {
  const cols = allColumns(t);
  const rank = (k: string) => {
    const i = COLUMN_ORDER.indexOf(k);
    return i < 0 ? COLUMN_ORDER.length : i;
  };
  return cols
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c.key) - rank(y.c.key) || x.i - y.i)
    .map((x) => x.c);
};

function BusinessPartnerList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(businessPartnerRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
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
      searchValues={(r) => [r.bpCode, r.localName, r.englishName, r.taxCode, r.email]}
      quickFilters={[
        {
          key: "status",
          allLabel: t("Trạng thái: Tất cả", "Status: All"),
          options: ["Active", "Inactive"].map((s) => ({
            label: `${t("Trạng thái", "Status")}: ${s}`,
            conditions: [{ field: "status", operator: "eq", value: s }],
          })),
        },
        {
          key: "role",
          allLabel: t("Vai trò: Tất cả", "Role: All"),
          options: BP_ROLES.map((role) => ({
            label: `${t("Vai trò", "Role")}: ${role}`,
            conditions: [{ field: "roles", operator: "contains", value: role }],
          })),
        },
      ]}
      showRefresh={false}
      crud={bpCrud}
      addLabel="Add Business Partner"
      onAdd={() =>
        void navigate({ to: "/business-partner/$id", params: { id: "new" }, search: {} })
      }
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
