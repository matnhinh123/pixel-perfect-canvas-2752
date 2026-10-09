import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { listLocations, locationCrud, locationImportConfig } from "@/services/locationService";
import {
  LOCATION_COUNTRIES,
  LOCATION_TYPES,
  PORT_SUB_TYPES,
  VN_PROVINCES,
} from "@/mock-data/locationCatalog";
import { locationOrigin, type LocationMasterRecord } from "@/mock-data/locations";
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

const ORIGINS = ["Standard", "Internal"] as const;

const columnsFor = (t: T, provinces: string[]): ListColumn<Row>[] => [
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
    options: [...LOCATION_TYPES],
    width: 140,
    value: (r) => r.locationType ?? "",
    render: (r) => (r.locationType ? <Tag>{r.locationType}</Tag> : "—"),
  },
  {
    key: "locationSubType",
    defaultHidden: true,
    label: t("Loại cảng", "Port Sub Type"),
    type: "enum",
    options: [...PORT_SUB_TYPES],
    width: 130,
    value: (r) => r.locationSubType ?? "",
  },
  {
    key: "origin",
    label: t("Nguồn", "Standard / Internal"),
    type: "enum",
    options: [...ORIGINS],
    width: 150,
    value: (r) => locationOrigin(r),
    render: (r) => {
      const o = locationOrigin(r);
      return <Tag tone={o === "Standard" ? "Auto" : o}>{o}</Tag>;
    },
  },
  {
    key: "unLocode",
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
    value: (r) => r.iataCode ?? "",
  },
  {
    key: "country",
    label: t("Quốc gia", "Country"),
    type: "enum",
    options: LOCATION_COUNTRIES,
    width: 110,
    value: (r) => r.country ?? "",
  },
  {
    key: "province",
    label: t("Tỉnh/Thành phố", "Province/City"),
    type: "enum",
    options: provinces,
    width: 160,
    truncate: true,
    value: (r) => r.province ?? "",
  },
  {
    key: "address",
    label: t("Địa chỉ", "Address"),
    type: "text",
    width: 230,
    truncate: true,
    defaultHidden: true,
    value: (r) => r.address,
    className: "text-muted-foreground",
  },
  {
    key: "coords",
    label: t("Vĩ độ, Kinh độ", "Latitude, Longitude"),
    type: "text",
    width: 170,
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
  const rows = useMemo(() => listLocations(all), [all]);
  const provinces = useMemo(
    () =>
      [...new Set([...VN_PROVINCES, ...rows.map((r) => r.province ?? "")])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, provinces), [lang, provinces]);
  const usedProvinces = useMemo(
    () =>
      [...new Set(rows.map((r) => r.province ?? "").filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [rows],
  );
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
        "Tìm mã, tên, địa chỉ, tỉnh, UN/LOCODE, IATA...",
        "Search code, name, address, province, UN/LOCODE, IATA...",
      )}
      searchValues={(r) => [
        r.id,
        r.code ?? "",
        r.name,
        r.address,
        r.province ?? "",
        r.country ?? "",
        r.unLocode ?? "",
        r.iataCode ?? "",
      ]}
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
          key: "type",
          allLabel: t("Loại: Tất cả", "Type: All"),
          options: LOCATION_TYPES.map((x) => ({
            label: x,
            conditions: [{ field: "locationType", operator: "eq", value: x }],
          })),
        },
        {
          key: "origin",
          allLabel: t("Nguồn: Tất cả", "Standard / Internal: All"),
          options: ORIGINS.map((x) => ({
            label: x,
            conditions: [{ field: "origin", operator: "eq", value: x }],
          })),
        },
        {
          key: "province",
          allLabel: t("Tỉnh/TP: Tất cả", "Province/City: All"),
          options: usedProvinces.map((x) => ({
            label: x,
            conditions: [{ field: "province", operator: "eq", value: x }],
          })),
        },
      ]}
      showRefresh={false}
      crud={locationCrud}
      importConfig={locationImportConfig}
      addLabel="Add Location"
      onAdd={() => void navigate({ to: "/location/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
