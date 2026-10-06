import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { asReadOnlyRecord } from "@/components/movex/OutOfScope";
import { FEE_TYPE_LABEL } from "@/components/movex/routing/RouteSections";
import { MOCK_TOLL_GATES } from "@/mock-data/tollCatalog";
import { formatVnd } from "@/lib/format";

export const Route = createFileRoute("/toll-station")({
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s["q"] === "string" ? { q: s["q"] } : {},
  head: () => ({
    meta: [
      { title: "Toll Station — MoveX" },
      { name: "description", content: "Toll station master data and prices by vehicle class." },
    ],
  }),
  component: TollStationList,
});

type Row = ReturnType<typeof asReadOnlyRecord<(typeof MOCK_TOLL_GATES)[number]>>;
const PROVINCES = [...new Set(MOCK_TOLL_GATES.map((g) => g.province))];

const columns: ListColumn<Row>[] = [
  {
    key: "code",
    label: "Mã trạm",
    type: "text",
    pinned: true,
    value: (r) => r.code,
    render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
  },
  { key: "name", label: "Tên trạm", type: "text", value: (r) => r.name, className: "font-medium" },
  { key: "road", label: "Tuyến đường", type: "text", value: (r) => r.road },
  {
    key: "province",
    label: "Tỉnh / Thành phố",
    type: "enum",
    options: PROVINCES,
    value: (r) => r.province,
  },
  {
    key: "feeType",
    label: "Loại phí",
    type: "enum",
    options: ["Cầu đường", "Phà"],
    value: (r) => FEE_TYPE_LABEL[r.feeType],
  },
  ...[0, 1, 2, 3, 4].map((i): ListColumn<Row> => ({
    key: `p${i + 1}`,
    label: `Nhóm ${i + 1} (₫)`,
    type: "number",
    value: (r) => r.prices[i]!,
    render: (r) => formatVnd(r.prices[i]!),
    defaultHidden: i === 1 || i === 2,
  })),
  {
    key: "status",
    label: "Trạng thái",
    type: "enum",
    options: ["Active"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function TollStationList() {
  const { q } = Route.useSearch();
  const rows = useMemo(() => MOCK_TOLL_GATES.map(asReadOnlyRecord), []);
  return (
    <EntityListPage<Row>
      key={q ?? ""}
      screen="toll-station"
      entityType="Toll Station"
      entityLabel="Toll Station"
      title="Toll Station"
      subtitle="Danh mục trạm thu phí và giá vé theo nhóm xe (MD-06) — dữ liệu tham khảo cho Routing"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm mã trạm, tên trạm, tuyến..."
      searchValues={(r) => [r.code, r.name, r.road, r.province]}
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
      readOnlyReason="Danh mục Toll Station ở chế độ chỉ đọc trong bản demo."
      {...(q ? { initialSearch: q } : {})}
    />
  );
}
