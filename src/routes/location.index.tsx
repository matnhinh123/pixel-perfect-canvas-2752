import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { locationCrud } from "@/services/locationService";
import { LOCATION_COUNTRIES, LOCATION_TYPES, SERVICE_MODES } from "@/mock-data/locationCatalog";
import type { LocationMasterRecord } from "@/mock-data/locations";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/location/")({
  head: () => ({
    meta: [
      { title: "Location — MoveX" },
      { name: "description", content: "Location (source) master data used by Routing." },
    ],
  }),
  component: LocationList,
});

type Row = LocationMasterRecord;
type T = (vi: string, en: string) => string;

const yesNo = (v: boolean | undefined) => (v ? "Yes" : "No");

const columnsFor = (t: T): ListColumn<Row>[] => [
  {
    key: "id",
    label: t("Mã", "Code"),
    type: "text",
    pinned: true,
    width: 130,
    value: (r) => r.code ?? r.id,
    render: (r) => <span className="font-semibold text-primary">{r.code ?? r.id}</span>,
  },
  {
    key: "name",
    label: t("Tên", "Name"),
    type: "text",
    width: 200,
    truncate: true,
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "locationType",
    label: t("Loại", "Type"),
    type: "enum",
    options: Object.keys(LOCATION_TYPES),
    width: 140,
    value: (r) => r.locationType ?? "",
    render: (r) => (r.locationType ? <Tag>{r.locationType}</Tag> : "—"),
  },
  {
    key: "locationSubType",
    defaultHidden: true,
    label: t("Loại phụ", "Sub Type"),
    type: "text",
    width: 170,
    truncate: true,
    value: (r) => r.locationSubType ?? "",
  },
  {
    key: "serviceMode",
    label: t("Phương thức", "Mode"),
    type: "enum",
    options: SERVICE_MODES,
    width: 120,
    value: (r) => r.serviceMode ?? "",
  },
  {
    key: "country",
    defaultHidden: true,
    label: t("Quốc gia", "Country"),
    type: "enum",
    options: LOCATION_COUNTRIES,
    width: 110,
    value: (r) => r.country ?? "",
  },
  {
    key: "address",
    label: t("Địa chỉ", "Address"),
    type: "text",
    width: 230,
    truncate: true,
    value: (r) => r.address,
    className: "text-muted-foreground",
  },
  {
    key: "unLocode",
    defaultHidden: true,
    label: "UN/LOCODE",
    type: "text",
    width: 110,
    value: (r) => r.unLocode ?? "",
  },
  {
    key: "iataCode",
    label: "IATA Code",
    type: "text",
    width: 100,
    defaultHidden: true,
    value: (r) => r.iataCode ?? "",
  },
  {
    key: "externalCode",
    label: "Ext. Code",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.externalCode ?? "",
  },
  {
    key: "operatorName",
    label: t("Đơn vị vận hành", "Operator"),
    type: "text",
    width: 160,
    truncate: true,
    defaultHidden: true,
    value: (r) => r.operatorName ?? "",
  },
  {
    key: "customsControlled",
    label: t("Hải quan", "Customs"),
    type: "enum",
    options: ["Yes", "No"],
    width: 150,
    defaultHidden: true,
    value: (r) => yesNo(r.customsControlled),
  },
  {
    key: "bonded",
    label: t("Ngoại quan", "Bonded"),
    type: "enum",
    options: ["Yes", "No"],
    width: 100,
    defaultHidden: true,
    value: (r) => yesNo(r.bonded),
  },
  {
    key: "coords",
    label: t("Toạ độ", "Coordinates"),
    type: "text",
    width: 160,
    defaultHidden: true,
    value: (r) => (Number.isFinite(r.lat) && Number.isFinite(r.lng) ? `${r.lat}, ${r.lng}` : ""),
  },
  {
    key: "status",
    label: t("Trạng thái", "Status"),
    type: "enum",
    options: ["Active", "Inactive"],
    width: 110,
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "updatedAt",
    label: t("Cập nhật", "Updated At"),
    type: "date",
    width: 150,
    defaultHidden: true,
    value: (r) => r.updatedAt.slice(0, 10),
    render: (r) => formatDateTime(r.updatedAt),
  },
];

function LocationList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(locationRepository);
  const rows = useMemo(() => all.filter((l) => !l.deleted), [all]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/location/$id", params: { id: r.id }, search: { mode } });

  return (
    <EntityListPage<Row>
      screen="location"
      entityType="Location"
      entityLabel="Location"
      title="Location"
      rows={rows}
      columns={columns}
      searchPlaceholder={t(
        "Tìm mã, tên, địa chỉ, UN/LOCODE...",
        "Search code, name, address, UN/LOCODE...",
      )}
      searchValues={(r) => [
        r.id,
        r.code ?? "",
        r.name,
        r.address,
        r.unLocode ?? "",
        r.iataCode ?? "",
        r.externalCode ?? "",
      ]}
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
          key: "type",
          allLabel: t("Loại: Tất cả", "Type: All"),
          options: Object.keys(LOCATION_TYPES).map((x) => ({
            label: `${t("Loại", "Type")}: ${x}`,
            conditions: [{ field: "locationType", operator: "eq", value: x }],
          })),
        },
      ]}
      showRefresh={false}
      crud={locationCrud}
      addLabel="Add Location"
      onAdd={() => void navigate({ to: "/location/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
