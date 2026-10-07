import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { asReadOnlyRecord } from "@/components/movex/OutOfScope";
import { RATE_TABLE } from "@/mock-data/rates";
import { formatVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { VEHICLE_GROUPS, VEHICLE_PROFILES, type VehicleGroup, type VehicleProfile } from "@/types";

export const Route = createFileRoute("/vehicle")({
  head: () => ({
    meta: [
      { title: "Vehicle — MoveX" },
      { name: "description", content: "MoveX vehicle groups and their routing profile mapping." },
    ],
  }),
  component: VehicleList,
});

type T = (vi: string, en: string) => string;

/** MoveX business Vehicle Group ↔ default routing Vehicle Profile (kept separate on purpose). */
const metaFor = (
  t: T,
): Record<
  VehicleGroup,
  { code: string; profile: VehicleProfile; capacity: string; tollClass: string }
> => ({
  "Van / Pickup": {
    code: "VG-VAN",
    profile: "Truck",
    capacity: t("< 2 tấn", "< 2 t"),
    tollClass: t("Nhóm 1", "Class 1"),
  },
  "Light Truck": {
    code: "VG-LT",
    profile: "Truck",
    capacity: t("2 – 4 tấn", "2 – 4 t"),
    tollClass: t("Nhóm 2", "Class 2"),
  },
  "Medium Truck": {
    code: "VG-MT",
    profile: "Truck",
    capacity: t("4 – 10 tấn", "4 – 10 t"),
    tollClass: t("Nhóm 3", "Class 3"),
  },
  "Heavy Truck": {
    code: "VG-HT",
    profile: "Truck",
    capacity: t("10 – 18 tấn", "10 – 18 t"),
    tollClass: t("Nhóm 4", "Class 4"),
  },
  "Tractor / Container Truck": {
    code: "VG-TRC",
    profile: "Container",
    capacity: "Container 20'/40'",
    tollClass: t("Nhóm 4–5", "Class 4–5"),
  },
});

const rowsOf = (t: T) => {
  const META = metaFor(t);
  return VEHICLE_GROUPS.map((g) =>
    asReadOnlyRecord({ id: META[g].code, group: g, ...META[g], ...RATE_TABLE[g] }),
  );
};
type Row = ReturnType<typeof rowsOf>[number];

const columnsFor = (t: T): ListColumn<Row>[] => [
  {
    key: "code",
    label: t("Mã nhóm xe", "Vehicle group code"),
    type: "text",
    pinned: true,
    value: (r) => r.code,
    render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
  },
  {
    key: "group",
    label: "Vehicle Group (MoveX)",
    type: "enum",
    options: VEHICLE_GROUPS,
    value: (r) => r.group,
    className: "font-medium",
  },
  {
    key: "profile",
    label: "Vehicle Profile (routing)",
    type: "enum",
    options: VEHICLE_PROFILES,
    value: (r) => r.profile,
    render: (r) => <Tag tone="Auto">{r.profile}</Tag>,
  },
  { key: "capacity", label: t("Tải trọng", "Capacity"), type: "text", value: (r) => r.capacity },
  {
    key: "tollClass",
    label: t("Nhóm phí", "Toll class"),
    type: "text",
    value: (r) => r.tollClass,
  },
  {
    key: "fuel",
    label: t("Nhiên liệu (₫/km)", "Fuel (₫/km)"),
    type: "number",
    value: (r) => r.fuelPerKm,
    render: (r) => formatVnd(r.fuelPerKm),
  },
  {
    key: "driver",
    label: t("Tài xế (₫/giờ)", "Driver (₫/hour)"),
    type: "number",
    value: (r) => r.driverPerHour,
    render: (r) => formatVnd(r.driverPerHour),
  },
  {
    key: "status",
    label: t("Trạng thái", "Status"),
    type: "enum",
    options: ["Active"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function VehicleList() {
  const { t, lang } = useT();
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rowsOf(t), [lang]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  return (
    <EntityListPage<Row>
      screen="vehicle"
      entityType="Vehicle"
      entityLabel="Vehicle"
      title="Vehicle"
      subtitle={t(
        "Vehicle Group dùng cho nghiệp vụ MoveX, tách biệt với Vehicle Profile dùng cho routing API",
        "Vehicle Group is used for MoveX business, separate from the Vehicle Profile used by the routing API",
      )}
      rows={rows}
      columns={columns}
      searchPlaceholder={t("Tìm mã, nhóm xe...", "Search code, vehicle group...")}
      searchValues={(r) => [r.code, r.group, r.profile]}
      readOnlyReason={t(
        "Danh mục Vehicle ở chế độ chỉ đọc trong bản demo.",
        "The Vehicle list is read-only in this demo.",
      )}
    />
  );
}
