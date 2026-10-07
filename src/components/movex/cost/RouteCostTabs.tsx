// Legacy route-cost screen, moved out of src/routes/cost.index.tsx.
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { costRepository, routeRepository } from "@/repositories";
import { costCrud, costImportConfig, displayVersion } from "@/services/costService";
import { routeTotals } from "@/services/cost/costMath";
import { operatingRateRows, type OperatingRateRow } from "@/mock-data/rates";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";
import { VEHICLE_GROUPS, type CostRecord, type RouteRecord } from "@/types";
import { cn } from "@/lib/utils";

type Tab = "route-cost" | "toll" | "rates";
const TABS: { key: Tab; label: string }[] = [
  { key: "route-cost", label: "Chi phí tuyến" },
  { key: "toll", label: "Phí cầu đường (từ Routing)" },
  { key: "rates", label: "Đơn giá vận hành" },
];

const statusFilter: QuickFilter = {
  key: "status",
  allLabel: "Tất cả trạng thái",
  options: ["Active", "Draft", "Inactive"].map((v) => ({
    label: v,
    conditions: [{ field: "status", operator: "eq", value: v }],
  })),
};
const groupFilter = (field: string): QuickFilter => ({
  key: "group",
  allLabel: "Tất cả nhóm xe",
  options: VEHICLE_GROUPS.map((g) => ({
    label: g,
    conditions: [{ field, operator: "eq", value: g }],
  })),
});

/**
 * Previous Cost screen (route costs with versions / toll costs / operating rates). Hidden from the
 * menu since Cost became master data; kept so it can be brought back without rewriting.
 */
export function RouteCostTabs({ route }: { route?: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("route-cost");
  const costsAll = useCollection(costRepository);
  const routesAll = useCollection(routeRepository);
  const routes = useMemo(() => routesAll.filter((r) => !r.deleted), [routesAll]);
  const costs = useMemo(() => costsAll.filter((c) => !c.deleted), [costsAll]);
  const routeById = useMemo(() => new Map(routesAll.map((r) => [r.id, r])), [routesAll]);

  const tabs = (
    <div className="mb-4 flex rounded-lg bg-muted p-1 sm:w-fit">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-semibold transition",
            tab === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const costColumns = useMemo<ListColumn<CostRecord>[]>(() => {
    const rc = (c: CostRecord) => routeById.get(c.routeId);
    return [
      {
        key: "code",
        label: "Mã chi phí",
        type: "text",
        pinned: true,
        value: (c) => c.code,
        render: (c) => <span className="font-semibold text-primary">{c.code}</span>,
      },
      {
        key: "route",
        label: "Route",
        type: "text",
        value: (c) => rc(c)?.code ?? "",
        render: (c) => (
          <div>
            <div className="font-medium">{rc(c)?.code ?? "—"}</div>
            <div className="max-w-48 truncate text-xs text-muted-foreground">{rc(c)?.name}</div>
          </div>
        ),
      },
      {
        key: "vehicleGroup",
        label: "Vehicle Group",
        type: "enum",
        options: VEHICLE_GROUPS,
        value: (c) => c.vehicleGroup,
      },
      {
        key: "version",
        label: "Phiên bản",
        type: "number",
        value: (c) => displayVersion(c).version,
        render: (c) => (
          <span>
            v{displayVersion(c).version}{" "}
            <span className="text-xs text-muted-foreground">/ {c.versions.length}</span>
          </span>
        ),
      },
      {
        key: "effectiveFrom",
        label: "Hiệu lực từ",
        type: "date",
        value: (c) => displayVersion(c).effectiveFrom,
        render: (c) => formatDate(displayVersion(c).effectiveFrom),
      },
      {
        key: "distance",
        label: "Khoảng cách (km)",
        type: "number",
        value: (c) => displayVersion(c).routeSnapshot?.distanceKm ?? null,
        defaultHidden: true,
      },
      {
        key: "toll",
        label: "Phí cầu đường (₫)",
        type: "number",
        value: (c) => displayVersion(c).routeSnapshot?.tollCost ?? 0,
        render: (c) => formatVnd(displayVersion(c).routeSnapshot?.tollCost ?? 0),
      },
      {
        key: "total",
        label: "Tổng chi phí ước tính (₫)",
        type: "number",
        value: (c) => displayVersion(c).totalEstimated,
        render: (c) => (
          <span className="font-semibold">{formatVnd(displayVersion(c).totalEstimated)}</span>
        ),
      },
      {
        key: "status",
        label: "Trạng thái",
        type: "enum",
        options: ["Active", "Draft", "Inactive"],
        value: (c) => c.status,
        render: (c) => <StatusBadge status={c.status} />,
      },
      {
        key: "updatedAt",
        label: "Cập nhật lúc",
        type: "date",
        value: (c) => c.updatedAt,
        defaultHidden: true,
        render: (c) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(c.updatedAt)}</span>
        ),
      },
    ];
  }, [routeById]);

  const tollColumns = useMemo<ListColumn<RouteRecord>[]>(
    () => [
      {
        key: "code",
        label: "Mã route",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      { key: "name", label: "Tên route", type: "text", value: (r) => r.name },
      {
        key: "vehicleGroup",
        label: "Vehicle Group",
        type: "enum",
        options: VEHICLE_GROUPS,
        value: (r) => r.vehicleGroup,
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
        key: "stations",
        label: "Số trạm",
        type: "number",
        value: (r) => routeTotals(r).stationCount,
      },
      {
        key: "outbound",
        label: "Phí chiều đi (₫)",
        type: "number",
        value: (r) => routeTotals(r).outboundToll,
        render: (r) => formatVnd(routeTotals(r).outboundToll),
      },
      {
        key: "return",
        label: "Phí chiều về (₫)",
        type: "number",
        value: (r) => routeTotals(r).returnToll,
        render: (r) => (r.type === "Round Trip" ? formatVnd(routeTotals(r).returnToll) : "—"),
      },
      {
        key: "manual",
        label: "Thủ công / phà (₫)",
        type: "number",
        value: (r) => routeTotals(r).manualTotal,
        render: (r) => formatVnd(routeTotals(r).manualTotal),
      },
      {
        key: "total",
        label: "Tổng phí cầu đường (₫)",
        type: "number",
        value: (r) => routeTotals(r).totalRouteCost,
        render: (r) => (
          <span className="font-semibold">{formatVnd(routeTotals(r).totalRouteCost)}</span>
        ),
      },
      {
        key: "status",
        label: "Trạng thái",
        type: "enum",
        options: ["Active", "Draft", "Inactive"],
        value: (r) => r.status,
        render: (r) => <StatusBadge status={r.status} />,
      },
    ],
    [],
  );

  const rateColumns: ListColumn<OperatingRateRow>[] = [
    {
      key: "code",
      label: "Mã",
      type: "text",
      pinned: true,
      value: (r) => r.code,
      render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
    },
    { key: "name", label: "Tên", type: "text", value: (r) => r.name },
    {
      key: "category",
      label: "Nhóm chi phí",
      type: "enum",
      options: ["Fixed", "Fuel", "Driver", "Other"],
      value: (r) => r.category,
      render: (r) => <Tag tone="cat">{r.category}</Tag>,
    },
    {
      key: "vehicleGroup",
      label: "Vehicle Group",
      type: "enum",
      options: VEHICLE_GROUPS,
      value: (r) => r.vehicleGroup,
    },
    { key: "unit", label: "Đơn vị", type: "text", value: (r) => r.unit },
    {
      key: "amount",
      label: "Đơn giá (₫)",
      type: "number",
      value: (r) => r.amount,
      render: (r) => <span className="font-semibold">{formatVnd(r.amount)}</span>,
    },
  ];
  const rates = useMemo(
    () =>
      operatingRateRows().map((r) => ({
        ...r,
        status: "Active" as const,
        createdAt: "",
        createdBy: "",
        updatedAt: "",
        updatedBy: "",
      })),
    [],
  );

  if (tab === "toll")
    return (
      <EntityListPage<RouteRecord>
        key="toll"
        screen="cost-toll"
        entityType="Route"
        entityLabel="Toll cost"
        title="Cost"
        subtitle="Phí cầu đường theo route — đọc trực tiếp từ Routing (một nguồn dữ liệu duy nhất)"
        above={tabs}
        rows={routes}
        columns={tollColumns}
        searchPlaceholder="Tìm route code, tên..."
        searchValues={(r) => [r.code, r.name, r.vehicleGroup]}
        quickFilters={[groupFilter("vehicleGroup"), statusFilter]}
        readOnlyReason="Dữ liệu phí cầu đường được quản lý ở Routing — mở route để chỉnh sửa."
        onView={(r) =>
          void navigate({ to: "/routing/$id", params: { id: r.id }, search: { mode: "view" } })
        }
        extraRowActions={[
          {
            label: "Mở Route (sửa phí)",
            icon: <RouteIcon className="h-4 w-4" />,
            onClick: (r) =>
              void navigate({ to: "/routing/$id", params: { id: r.id }, search: { mode: "edit" } }),
          },
        ]}
      />
    );

  if (tab === "rates")
    return (
      <EntityListPage
        key="rates"
        screen="cost-rates"
        entityType="Cost"
        entityLabel="Operating rate"
        title="Cost"
        subtitle="Đơn giá vận hành theo Vehicle Group (dùng để điền sẵn dòng chi phí mới)"
        above={tabs}
        rows={rates}
        columns={rateColumns as ListColumn<(typeof rates)[number]>[]}
        searchPlaceholder="Tìm code, tên..."
        searchValues={(r) => [r.code, r.name, r.vehicleGroup]}
        quickFilters={[groupFilter("vehicleGroup")]}
        readOnlyReason="Bảo trì đơn giá nằm ngoài phạm vi demo (chỉ đọc)."
      />
    );

  return (
    <EntityListPage<CostRecord>
      key="route-cost"
      screen="cost"
      entityType="Cost"
      entityLabel="Cost"
      title="Cost"
      subtitle="Chi phí tuyến theo Route + Vehicle Group, có version & effective date"
      above={tabs}
      rows={costs}
      columns={costColumns}
      searchPlaceholder="Tìm cost code, route, vehicle group..."
      searchValues={(c) => [c.code, routeById.get(c.routeId)?.code, c.vehicleGroup]}
      quickFilters={[groupFilter("vehicleGroup"), statusFilter]}
      crud={costCrud}
      addLabel="Thêm mới Cost"
      onAdd={() => void navigate({ to: "/cost/$id", params: { id: "new" } })}
      onView={(c) =>
        void navigate({ to: "/cost/$id", params: { id: c.id }, search: { mode: "view" } })
      }
      onEdit={(c) =>
        void navigate({ to: "/cost/$id", params: { id: c.id }, search: { mode: "edit" } })
      }
      importConfig={costImportConfig}
      extraRowActions={[
        {
          label: "Mở Route",
          icon: <RouteIcon className="h-4 w-4" />,
          onClick: (c) =>
            void navigate({
              to: "/routing/$id",
              params: { id: c.routeId },
              search: { mode: "view" },
            }),
        },
      ]}
      {...(route ? { initialSearch: route } : {})}
    />
  );
}
