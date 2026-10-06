import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import { routeCrud, routeImportConfig } from "@/services/routeService";
import { routeTotals } from "@/services/cost/costMath";
import { findVehicle, vehicleLabel } from "@/mock-data/vehicles";
import { formatDateTime, formatDuration, formatVnd } from "@/lib/format";
import { VEHICLE_GROUPS, VEHICLE_PROFILES, type RouteRecord } from "@/types";

export const Route = createFileRoute("/routing/")({
  head: () => ({
    meta: [
      { title: "Routing — MoveX" },
      { name: "description", content: "Manage MoveX routes, distances and toll costs." },
      { property: "og:title", content: "Routing — MoveX" },
      { property: "og:description", content: "Manage MoveX routes, distances and toll costs." },
    ],
  }),
  component: RoutingList,
});

const columns: ListColumn<RouteRecord>[] = [
  {
    key: "code",
    label: "Mã route",
    type: "text",
    pinned: true,
    value: (r) => r.code,
    render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
  },
  {
    key: "name",
    label: "Tên route",
    type: "text",
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "origin",
    label: "Điểm đi",
    type: "text",
    value: (r) => r.origin.name,
    className: "max-w-40 truncate text-muted-foreground",
  },
  {
    key: "destination",
    label: "Điểm đến",
    type: "text",
    value: (r) => r.destination.name,
    className: "max-w-40 truncate text-muted-foreground",
  },
  {
    key: "type",
    label: "Loại route",
    type: "enum",
    options: ["Single Trip", "Round Trip"],
    value: (r) => r.type,
    render: (r) => <Tag>{r.type}</Tag>,
  },
  {
    key: "vehicle",
    label: "Loại xe",
    type: "text",
    value: (r) => {
      const v = findVehicle(r.vehicleId);
      return v ? vehicleLabel(v) : "";
    },
    className: "whitespace-nowrap",
  },
  {
    key: "vehicleProfile",
    label: "Phương tiện",
    type: "enum",
    options: VEHICLE_PROFILES,
    value: (r) => r.vehicleProfile,
  },
  {
    key: "vehicleGroup",
    label: "Vehicle Group",
    type: "enum",
    options: VEHICLE_GROUPS,
    value: (r) => r.vehicleGroup,
    defaultHidden: true,
  },
  {
    key: "distance",
    label: "Khoảng cách (km)",
    type: "number",
    value: (r) => (r.outbound ? routeTotals(r).distanceKm : null),
    render: (r) =>
      r.outbound ? (
        `${routeTotals(r).distanceKm} km`
      ) : (
        <span className="text-muted-foreground">Chưa tính</span>
      ),
  },
  {
    key: "time",
    label: "Thời gian ước tính",
    type: "number",
    value: (r) => (r.outbound ? routeTotals(r).estimatedTimeMin : null),
    render: (r) => (r.outbound ? formatDuration(routeTotals(r).estimatedTimeMin) : "—"),
  },
  {
    key: "toll",
    label: "Phí cầu đường (₫)",
    type: "number",
    value: (r) => routeTotals(r).totalRouteCost,
    render: (r) => <span className="font-medium">{formatVnd(routeTotals(r).totalRouteCost)}</span>,
  },
  {
    key: "status",
    label: "Trạng thái",
    type: "enum",
    options: ["Active", "Draft", "Inactive"],
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "updatedAt",
    label: "Cập nhật lúc",
    type: "date",
    value: (r) => r.updatedAt,
    render: (r) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(r.updatedAt)}
      </span>
    ),
    defaultHidden: true,
  },
];

const quickFilters: QuickFilter[] = [
  {
    key: "type",
    allLabel: "Tất cả loại route",
    options: ["Single Trip", "Round Trip"].map((v) => ({
      label: v,
      conditions: [{ field: "type", operator: "eq", value: v }],
    })),
  },
  {
    key: "vehicle",
    allLabel: "Tất cả phương tiện",
    options: VEHICLE_PROFILES.map((v) => ({
      label: v,
      conditions: [{ field: "vehicleProfile", operator: "eq", value: v }],
    })),
  },
  {
    key: "status",
    allLabel: "Tất cả trạng thái",
    options: ["Active", "Draft", "Inactive"].map((v) => ({
      label: v,
      conditions: [{ field: "status", operator: "eq", value: v }],
    })),
  },
  {
    key: "distance",
    allLabel: "Mọi khoảng cách",
    options: [
      {
        label: "< 50 km",
        conditions: [{ field: "distance", operator: "between", value: "", value2: "49.99" }],
      },
      {
        label: "50 – 100 km",
        conditions: [{ field: "distance", operator: "between", value: "50", value2: "100" }],
      },
      {
        label: "> 100 km",
        conditions: [{ field: "distance", operator: "between", value: "100.01", value2: "" }],
      },
    ],
  },
];

function RoutingList() {
  const navigate = useNavigate();
  const all = useCollection(routeRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
  return (
    <EntityListPage<RouteRecord>
      screen="routing"
      entityType="Route"
      entityLabel="Route"
      title="Routing"
      subtitle="Quản lý tuyến đường, khoảng cách và phí cầu đường"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm route code, tên, điểm đi/đến..."
      searchValues={(r) => [r.code, r.name, r.origin.name, r.destination.name]}
      quickFilters={quickFilters}
      crud={routeCrud}
      addLabel="Thêm mới Route"
      onAdd={() => void navigate({ to: "/routing/$id", params: { id: "new" } })}
      onView={(r) =>
        void navigate({ to: "/routing/$id", params: { id: r.id }, search: { mode: "view" } })
      }
      onEdit={(r) =>
        void navigate({ to: "/routing/$id", params: { id: r.id }, search: { mode: "edit" } })
      }
      importConfig={routeImportConfig}
      extraRowActions={[
        {
          label: "Chi phí của route",
          icon: <Receipt className="h-4 w-4" />,
          onClick: (r) => void navigate({ to: "/cost", search: { route: r.code } }),
        },
      ]}
    />
  );
}
