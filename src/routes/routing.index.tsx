import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions } from "@/services/commonCodeService";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import { routeCrud } from "@/services/routeService";
import { routeTotals } from "@/services/cost/costMath";
import { allLocations } from "@/services/routing/locationStore";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import {
  VEHICLE_PROFILES,
  type RoutePoint,
  type RouteRecord,
  type RouteType,
  type Terrain,
} from "@/types";

const ROUTE_TYPES: RouteType[] = ["Single Trip", "Round Trip"];
const TERRAINS: Terrain[] = ["Plain", "Highland"];

export const Route = createFileRoute("/routing/")({
  head: () => ({
    meta: [
      { title: "Routing — MoveX" },
      { name: "description", content: "Manage MoveX routes, distances and toll stations." },
      { property: "og:title", content: "Routing — MoveX" },
      { property: "og:description", content: "Manage MoveX routes, distances and toll stations." },
    ],
  }),
  component: RoutingList,
});

type T = (vi: string, en: string) => string;

const codeOf = (p: RoutePoint) => allLocations().find((l) => l.id === p.locationId)?.code ?? "";

const columnsFor = (t: T): ListColumn<RouteRecord>[] => {
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
      label: t("Mã đi", "Departure code"),
      type: "text",
      value: (r) => codeOf(r.origin),
      render: (r) => <span className="font-medium text-primary">{codeOf(r.origin) || "—"}</span>,
    },
    {
      key: "origin",
      label: t("Điểm đi", "Departure"),
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
      label: t("Số điểm dừng", "Number of stops"),
      type: "number",
      value: (r) => r.waypoints.length,
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
      key: "type",
      label: t("Loại tuyến", "Route Type"),
      type: "enum",
      options: ROUTE_TYPES,
      value: (r) => r.type,
      render: (r) => <Tag>{r.type}</Tag>,
    },
    {
      key: "terrain",
      label: t("Địa hình", "Terrain"),
      type: "enum",
      options: TERRAINS,
      value: (r) => r.terrain ?? "Plain",
    },
    // Vehicle = the Truck / Container switch on the route map (same values as the Vehicle filter).
    // The key stays "vehicleGroup" so users' saved column layouts keep this column in place.
    {
      key: "vehicleGroup",
      label: "Vehicle",
      type: "enum",
      options: VEHICLE_PROFILES,
      value: (r) => r.vehicleProfile,
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
      // Minutes; filtered with the same input as the route detail ("15h 48m", "15:48", hours).
      type: "duration",
      value: (r) => (r.outbound ? routeTotals(r).estimatedTimeMin : null),
      exportValue: (r) => (r.outbound ? formatDuration(routeTotals(r).estimatedTimeMin) : ""),
      render: (r) => (r.outbound ? formatDuration(routeTotals(r).estimatedTimeMin) : "—"),
    },
    {
      key: "description",
      label: t("Ghi chú", "Note"),
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

const quickFiltersFor = (
  t: T,
  routeTypes: readonly string[] = ROUTE_TYPES,
  terrains: readonly string[] = TERRAINS,
): QuickFilter[] => {
  return [
    // Options show the value only; the filter name is on the "All" entry. Vehicle = the
    // Truck / Container switch on the route map.
    {
      key: "vehicle",
      allLabel: t("Vehicle: Tất cả", "Vehicle: All"),
      options: VEHICLE_PROFILES.map((v) => ({
        label: v,
        conditions: [{ field: "vehicleGroup", operator: "eq", value: v }],
      })),
    },
    {
      key: "type",
      allLabel: t("Loại tuyến: Tất cả", "Route Type: All"),
      options: routeTypes.map((v) => ({
        label: v,
        conditions: [{ field: "type", operator: "eq", value: v }],
      })),
    },
    {
      key: "terrain",
      allLabel: t("Địa hình: Tất cả", "Terrain: All"),
      options: terrains.map((v) => ({
        label: v,
        conditions: [{ field: "terrain", operator: "eq", value: v }],
      })),
    },
    {
      key: "status",
      allLabel: t("Trạng thái: Tất cả", "Status: All"),
      options: ["Active", "Inactive"].map((v) => ({
        label: v,
        conditions: [{ field: "status", operator: "eq", value: v }],
      })),
    },
    {
      key: "distance",
      allLabel: t("Khoảng cách: Tất cả", "Distance: All"),
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
};

function RoutingList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(routeRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  const routeTypes = useCodeOptions(CC.ROUTE_TYPE, ROUTE_TYPES);
  const terrains = useCodeOptions(CC.TERRAIN, TERRAINS);
  const quickFilters = useMemo(
    () => quickFiltersFor(t, routeTypes, terrains),
    [t, routeTypes, terrains],
  );
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
        "Search route code, name, departure/destination code or name, notes...",
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
      importExport={false}
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
