import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { TollStationDrawer } from "@/components/movex/TollStationDrawer";
import { useCollection } from "@/hooks/use-store";
import { tollStationRepository } from "@/repositories";
import { feeTypeLabels, tollStationCrud } from "@/services/tollStationService";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import { formatVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";

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

type Row = TollGateRecord;
type T = (vi: string, en: string) => string;

const columnsFor = (t: T, provinces: string[]): ListColumn<Row>[] => {
  const FEE = feeTypeLabels(t);
  return [
    {
      key: "code",
      label: t("Mã trạm", "Station code"),
      type: "text",
      pinned: true,
      value: (r) => r.code,
      render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
    },
    {
      key: "name",
      label: t("Tên trạm", "Station name"),
      type: "text",
      value: (r) => r.name,
      className: "font-medium",
    },
    { key: "road", label: t("Tuyến đường", "Road"), type: "text", value: (r) => r.road },
    {
      key: "province",
      label: t("Tỉnh / Thành phố", "Province / City"),
      type: "enum",
      options: provinces,
      value: (r) => r.province,
    },
    {
      key: "feeType",
      label: t("Loại phí", "Fee type"),
      type: "enum",
      // Filter options and the displayed value come from the same (translated) labels.
      options: [FEE.Toll, FEE.Bridge, FEE.Ferry],
      value: (r) => FEE[r.feeType],
    },
    ...[0, 1, 2, 3, 4].map((i): ListColumn<Row> => ({
      key: `p${i + 1}`,
      label: t(`Nhóm ${i + 1} (₫)`, `Class ${i + 1} (₫)`),
      type: "number",
      value: (r) => r.prices[i]!,
      render: (r) => formatVnd(r.prices[i]!),
      defaultHidden: i === 1 || i === 2,
    })),
    {
      key: "status",
      label: t("Trạng thái", "Status"),
      type: "enum",
      options: ["Active", "Inactive"],
      value: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];
};

function TollStationList() {
  const { t, lang } = useT();
  const { q } = Route.useSearch();
  const all = useCollection(tollStationRepository);
  const rows = useMemo(() => all.filter((g) => !g.deleted), [all]);
  const provinces = useMemo(() => [...new Set(rows.map((g) => g.province))], [rows]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, provinces), [lang, provinces]);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  return (
    <>
      <EntityListPage<Row>
        key={q ?? ""}
        screen="toll-station"
        entityType="Toll Station"
        entityLabel="Toll Station"
        title="Toll Station"
        subtitle={t(
          "Danh mục trạm thu phí và giá vé theo nhóm xe (MD-06) — dữ liệu tham khảo cho Routing",
          "Toll stations and prices by vehicle class (MD-06) — reference data for Routing",
        )}
        rows={rows}
        columns={columns}
        searchPlaceholder={t(
          "Tìm mã trạm, tên trạm, tuyến...",
          "Search station code, station name, road...",
        )}
        searchValues={(r) => [r.code, r.name, r.road, r.province]}
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
        crud={tollStationCrud}
        addLabel={t("Thêm trạm", "Add station")}
        onAdd={() => setEditing("new")}
        onView={setEditing}
        onEdit={setEditing}
        {...(q ? { initialSearch: q } : {})}
      />
      <TollStationDrawer
        open={!!editing}
        station={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
