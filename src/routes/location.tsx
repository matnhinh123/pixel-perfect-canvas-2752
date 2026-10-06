import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { asReadOnlyRecord } from "@/components/movex/OutOfScope";
import { LOCATIONS } from "@/mock-data/locations";

export const Route = createFileRoute("/location")({
  head: () => ({
    meta: [
      { title: "Location — MoveX" },
      { name: "description", content: "Location master data used by Routing." },
    ],
  }),
  component: LocationList,
});

type Row = ReturnType<typeof asReadOnlyRecord<(typeof LOCATIONS)[number]>>;

const PROVINCES = [...new Set(LOCATIONS.map((l) => l.province))];
const columns: ListColumn<Row>[] = [
  {
    key: "id",
    label: "Mã địa điểm",
    type: "text",
    pinned: true,
    value: (r) => r.code ?? r.id,
    render: (r) => <span className="font-semibold text-primary">{r.code ?? r.id}</span>,
  },
  {
    key: "name",
    label: "Tên địa điểm",
    type: "text",
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "address",
    label: "Địa chỉ",
    type: "text",
    value: (r) => r.address,
    className: "text-muted-foreground",
  },
  {
    key: "province",
    label: "Tỉnh / Thành phố",
    type: "enum",
    options: PROVINCES,
    value: (r) => r.province,
  },
  { key: "lat", label: "Vĩ độ", type: "number", value: (r) => r.lat },
  { key: "lng", label: "Kinh độ", type: "number", value: (r) => r.lng },
  {
    key: "status",
    label: "Trạng thái",
    type: "enum",
    options: ["Active"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function LocationList() {
  const rows = useMemo(() => LOCATIONS.map(asReadOnlyRecord), []);
  return (
    <EntityListPage<Row>
      screen="location"
      entityType="Location"
      entityLabel="Location"
      title="Location"
      subtitle="Danh mục địa điểm dùng cho Routing (điểm đi, điểm dừng, điểm đến)"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm mã, tên, địa chỉ..."
      searchValues={(r) => [r.id, r.code ?? "", r.name, r.address, r.province]}
      quickFilters={[
        {
          key: "province",
          allLabel: "Tất cả tỉnh/TP",
          options: PROVINCES.map((p) => ({
            label: p,
            conditions: [{ field: "province", operator: "eq", value: p }],
          })),
        },
      ]}
      readOnlyReason="Danh mục Location ở chế độ chỉ đọc trong bản demo."
    />
  );
}
