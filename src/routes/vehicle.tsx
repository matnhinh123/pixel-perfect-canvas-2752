import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { asReadOnlyRecord } from "@/components/movex/OutOfScope";
import { RATE_TABLE } from "@/mock-data/rates";
import { formatVnd } from "@/lib/format";
import { VEHICLE_GROUPS, type VehicleGroup, type VehicleProfile } from "@/types";

export const Route = createFileRoute("/vehicle")({
  head: () => ({
    meta: [
      { title: "Vehicle — MoveX" },
      { name: "description", content: "MoveX vehicle groups and their routing profile mapping." },
    ],
  }),
  component: VehicleList,
});

/** MoveX business Vehicle Group ↔ default routing Vehicle Profile (kept separate on purpose). */
const META: Record<
  VehicleGroup,
  { code: string; profile: VehicleProfile; capacity: string; tollClass: string }
> = {
  "Van / Pickup": { code: "VG-VAN", profile: "Car", capacity: "< 2 tấn", tollClass: "Nhóm 1" },
  "Light Truck": { code: "VG-LT", profile: "Truck", capacity: "2 – 4 tấn", tollClass: "Nhóm 2" },
  "Medium Truck": { code: "VG-MT", profile: "Truck", capacity: "4 – 10 tấn", tollClass: "Nhóm 3" },
  "Heavy Truck": { code: "VG-HT", profile: "Truck", capacity: "10 – 18 tấn", tollClass: "Nhóm 4" },
  "Tractor / Container Truck": {
    code: "VG-TRC",
    profile: "Container",
    capacity: "Container 20'/40'",
    tollClass: "Nhóm 4–5",
  },
};

const rowsOf = () =>
  VEHICLE_GROUPS.map((g) =>
    asReadOnlyRecord({ id: META[g].code, group: g, ...META[g], ...RATE_TABLE[g] }),
  );
type Row = ReturnType<typeof rowsOf>[number];

const columns: ListColumn<Row>[] = [
  {
    key: "code",
    label: "Mã nhóm xe",
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
    options: ["Car", "Motorcycle", "Truck", "Container"],
    value: (r) => r.profile,
    render: (r) => <Tag tone="Auto">{r.profile}</Tag>,
  },
  { key: "capacity", label: "Tải trọng", type: "text", value: (r) => r.capacity },
  { key: "tollClass", label: "Nhóm phí", type: "text", value: (r) => r.tollClass },
  {
    key: "fuel",
    label: "Nhiên liệu (₫/km)",
    type: "number",
    value: (r) => r.fuelPerKm,
    render: (r) => formatVnd(r.fuelPerKm),
  },
  {
    key: "driver",
    label: "Tài xế (₫/giờ)",
    type: "number",
    value: (r) => r.driverPerHour,
    render: (r) => formatVnd(r.driverPerHour),
  },
  {
    key: "status",
    label: "Trạng thái",
    type: "enum",
    options: ["Active"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
];

function VehicleList() {
  const rows = useMemo(rowsOf, []);
  return (
    <EntityListPage<Row>
      screen="vehicle"
      entityType="Vehicle"
      entityLabel="Vehicle"
      title="Vehicle"
      subtitle="Vehicle Group dùng cho nghiệp vụ MoveX, tách biệt với Vehicle Profile dùng cho routing API"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm mã, nhóm xe..."
      searchValues={(r) => [r.code, r.group, r.profile]}
      readOnlyReason="Danh mục Vehicle ở chế độ chỉ đọc trong bản demo."
    />
  );
}
