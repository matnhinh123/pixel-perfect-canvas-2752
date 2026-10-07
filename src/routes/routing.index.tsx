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
import { allLocations } from "@/services/routing/locationStore";
import { formatDateTime, formatDuration, formatVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { VEHICLE_PROFILES, type RoutePoint, type RouteRecord, type VehicleProfile } from "@/types";

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

type T = (vi: string, en: string) => string;

const profileLabels = (t: T): Record<VehicleProfile, string> => ({
  Truck: t("Xe tải", "Truck"),
  Container: t("Xe container", "Container truck"),
  Car: t("Ô tô", "Car"),
  Motorcycle: t("Xe máy", "Motorcycle"),
});
const codeOf = (p: RoutePoint) => allLocations().find((l) => l.id === p.locationId)?.code ?? "";

const columnsFor = (t: T): ListColumn<RouteRecord>[] => {
  const PROFILE_LABEL = profileLabels(t);
  return [
    {
      key: "code",
      label: t("Mã route", "Route code"),
      type: "text",
      pinned: true,
      value: (r) => r.code,
      render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
    },
    {
      key: "name",
      label: t("Tên route", "Route name"),
      type: "text",
      value: (r) => r.name,
      className: "font-medium",
    },
    {
      key: "originCode",
      label: t("Mã đi", "Origin code"),
      type: "text",
      value: (r) => codeOf(r.origin),
      render: (r) => <span className="font-medium text-primary">{codeOf(r.origin) || "—"}</span>,
    },
    {
      key: "origin",
      label: t("Điểm đi", "Origin"),
      type: "text",
      value: (r) => r.origin.name,
      className: "max-w-40 truncate text-muted-foreground",
    },
    {
      key: "destinationCode",
      label: t("Mã đến", "Dest. code"),
      type: "text",
      value: (r) => codeOf(r.destination),
      render: (r) => (
        <span className="font-medium text-primary">{codeOf(r.destination) || "—"}</span>
      ),
    },
    {
      key: "destination",
      label: t("Điểm đến", "Destination"),
      type: "text",
      value: (r) => r.destination.name,
      className: "max-w-40 truncate text-muted-foreground",
    },
    {
      key: "waypoints",
      label: t("Điểm dừng", "Waypoints"),
      type: "text",
      value: (r) => r.waypoints.map((w) => w.name).join(" → "),
      render: (r) =>
        r.waypoints.length ? (
          <span title={r.waypoints.map((w) => w.name).join(" → ")}>
            {t(
              `${r.waypoints.length} điểm`,
              `${r.waypoints.length} ${r.waypoints.length === 1 ? "stop" : "stops"}`,
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "vehicleProfile",
      label: t("Phương tiện", "Vehicle"),
      type: "enum",
      options: VEHICLE_PROFILES,
      value: (r) => r.vehicleProfile,
      render: (r) => <Tag>{PROFILE_LABEL[r.vehicleProfile]}</Tag>,
    },
    {
      key: "distance",
      label: t("Khoảng cách (km)", "Distance (km)"),
      type: "number",
      value: (r) => (r.outbound ? routeTotals(r).distanceKm : null),
      render: (r) =>
        r.outbound ? (
          `${routeTotals(r).distanceKm} km`
        ) : (
          <span className="text-muted-foreground">{t("Chưa tính", "Not calculated")}</span>
        ),
    },
    {
      key: "time",
      label: t("Thời gian", "Est. time"),
      type: "number",
      value: (r) => (r.outbound ? routeTotals(r).estimatedTimeMin : null),
      render: (r) => (r.outbound ? formatDuration(routeTotals(r).estimatedTimeMin) : "—"),
    },
    {
      key: "toll",
      label: t("Phí cầu đường (₫)", "Toll fees (₫)"),
      type: "number",
      value: (r) => routeTotals(r).totalRouteCost,
      render: (r) => (
        <span className="font-medium">{formatVnd(routeTotals(r).totalRouteCost)}</span>
      ),
    },
    {
      key: "description",
      label: t("Ghi chú", "Notes"),
      type: "text",
      value: (r) => r.description ?? "",
      className: "max-w-56 truncate text-muted-foreground",
    },
    {
      key: "status",
      label: t("Trạng thái", "Status"),
      type: "enum",
      options: ["Active", "Inactive"],
      value: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "updatedAt",
      label: t("Cập nhật", "Updated"),
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
};

const quickFiltersFor = (t: T): QuickFilter[] => {
  const PROFILE_LABEL = profileLabels(t);
  return [
    {
      key: "vehicle",
      allLabel: t("Phương tiện: Tất cả", "Vehicle: All"),
      options: VEHICLE_PROFILES.map((v) => ({
        label: `${t("Phương tiện", "Vehicle")}: ${PROFILE_LABEL[v]}`,
        conditions: [{ field: "vehicleProfile", operator: "eq", value: v }],
      })),
    },
    {
      key: "status",
      allLabel: t("Trạng thái: Tất cả", "Status: All"),
      options: ["Active", "Inactive"].map((v) => ({
        label: `${t("Trạng thái", "Status")}: ${v}`,
        conditions: [{ field: "status", operator: "eq", value: v }],
      })),
    },
    {
      key: "distance",
      allLabel: t("Khoảng cách: Tất cả", "Distance: All"),
      options: [
        {
          label: `${t("Khoảng cách", "Distance")}: < 50 km`,
          conditions: [{ field: "distance", operator: "between", value: "", value2: "49.99" }],
        },
        {
          label: `${t("Khoảng cách", "Distance")}: 50 – 100 km`,
          conditions: [{ field: "distance", operator: "between", value: "50", value2: "100" }],
        },
        {
          label: `${t("Khoảng cách", "Distance")}: > 100 km`,
          conditions: [{ field: "distance", operator: "between", value: "100.01", value2: "" }],
        },
      ],
    },
  ];
};

function RoutingList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(routeRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quickFilters = useMemo(() => quickFiltersFor(t), [lang]);
  return (
    <EntityListPage<RouteRecord>
      screen="routing"
      entityType="Route"
      entityLabel="Route"
      title="Routing"
      rows={rows}
      columns={columns}
      searchPlaceholder={t(
        "Tìm route code, tên, mã/điểm đi/đến, ghi chú...",
        "Search route code, name, origin/destination code or name, notes...",
      )}
      searchValues={(r) => [
        r.code,
        r.name,
        r.origin.name,
        r.destination.name,
        codeOf(r.origin),
        codeOf(r.destination),
        r.description ?? "",
      ]}
      quickFilters={quickFilters}
      showRefresh={false}
      crud={routeCrud}
      addLabel="Add Route"
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
          label: t("Chi phí của route", "Route costs"),
          icon: <Receipt className="h-4 w-4" />,
          onClick: (r) => void navigate({ to: "/cost", search: { route: r.code } }),
        },
      ]}
    />
  );
}
