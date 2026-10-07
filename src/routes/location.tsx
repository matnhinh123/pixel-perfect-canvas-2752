import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { LocationDrawer } from "@/components/movex/LocationDrawer";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { locationCrud } from "@/services/locationService";
import type { LocationMasterRecord } from "@/mock-data/locations";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/location")({
  head: () => ({
    meta: [
      { title: "Location — MoveX" },
      { name: "description", content: "Location master data used by Routing." },
    ],
  }),
  component: LocationList,
});

type Row = LocationMasterRecord;

const columnsFor = (
  t: (vi: string, en: string) => string,
  provinces: string[],
): ListColumn<Row>[] => [
  {
    key: "id",
    label: t("Mã địa điểm", "Location code"),
    type: "text",
    pinned: true,
    value: (r) => r.code ?? r.id,
    render: (r) => <span className="font-semibold text-primary">{r.code ?? r.id}</span>,
  },
  {
    key: "name",
    label: t("Tên địa điểm", "Location name"),
    type: "text",
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "address",
    label: t("Địa chỉ", "Address"),
    type: "text",
    value: (r) => r.address,
    className: "text-muted-foreground",
  },
  {
    key: "province",
    label: t("Tỉnh / Thành phố", "Province / City"),
    type: "enum",
    options: provinces,
    value: (r) => r.province,
  },
  { key: "lat", label: t("Vĩ độ", "Latitude"), type: "number", value: (r) => r.lat },
  { key: "lng", label: t("Kinh độ", "Longitude"), type: "number", value: (r) => r.lng },
  {
    key: "status",
    label: t("Trạng thái", "Status"),
    type: "enum",
    options: ["Active", "Inactive"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function LocationList() {
  const { t, lang } = useT();
  const all = useCollection(locationRepository);
  const rows = useMemo(() => all.filter((l) => !l.deleted), [all]);
  const provinces = useMemo(() => [...new Set(rows.map((l) => l.province))], [rows]);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, provinces), [lang, provinces]);
  return (
    <>
      <EntityListPage<Row>
        screen="location"
        entityType="Location"
        entityLabel="Location"
        title="Location"
        subtitle={t(
          "Danh mục địa điểm dùng cho Routing (điểm đi, điểm dừng, điểm đến)",
          "Location master data used by Routing (origin, waypoints, destination)",
        )}
        rows={rows}
        columns={columns}
        searchPlaceholder={t("Tìm mã, tên, địa chỉ...", "Search code, name, address...")}
        searchValues={(r) => [r.id, r.code ?? "", r.name, r.address, r.province]}
        quickFilters={[
          {
            key: "province",
            allLabel: t("Tất cả tỉnh/TP", "All provinces/cities"),
            options: provinces.map((p) => ({
              label: p,
              conditions: [{ field: "province", operator: "eq", value: p }],
            })),
          },
        ]}
        crud={locationCrud}
        addLabel={t("Thêm địa điểm", "Add Location")}
        onAdd={() => setEditing("new")}
        onView={setEditing}
        onEdit={setEditing}
      />
      <LocationDrawer
        open={!!editing}
        location={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
