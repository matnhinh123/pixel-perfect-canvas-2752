import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { cogsRepository, vehicleMasterRepository } from "@/repositories";
import { cogsCrud } from "@/services/cost/cogsService";
import { cogsVehicleTypes } from "@/services/cost/cogsVehicle";
import { formatNumber } from "@/lib/format";
import type { CogsLineGroup, CogsRecord } from "@/types";

export const Route = createFileRoute("/cogs/")({
  head: () => ({ meta: [{ title: "COGS — MoveX" }] }),
  component: CogsListPage,
});

const sumOf = (c: CogsRecord, g: CogsLineGroup) =>
  c.lines.filter((l) => l.group === g).reduce((s, l) => s + l.amount, 0);
const money = (n: number) => <span className="tabular-nums">{formatNumber(Math.round(n))}</span>;

function CogsListPage() {
  const all = useCollection(cogsRepository);
  const rows = useMemo(() => all.filter((c) => !c.deleted), [all]);
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const vehicleTypes = useMemo(
    () => [
      ...new Set([
        ...cogsVehicleTypes(vehiclesAll).map((t) => t.key),
        ...rows.map((c) => c.vehicleType),
      ]),
    ],
    [vehiclesAll, rows],
  );
  const navigate = useNavigate();
  const open = (c: CogsRecord, mode: "view" | "edit") =>
    void navigate({ to: "/cogs/$id", params: { id: c.id }, search: { mode } });

  const columns = useMemo<ListColumn<CogsRecord>[]>(
    () => [
      {
        key: "code",
        width: 120,
        label: "COGS Code",
        type: "text",
        pinned: true,
        value: (c) => c.code,
        render: (c) => <span className="font-semibold text-primary">{c.code}</span>,
      },
      {
        key: "name",
        width: 260,
        label: "COGS Name",
        type: "text",
        value: (c) => c.name ?? "",
      },
      {
        key: "routeCode",
        width: 140,
        label: "Route Code",
        type: "text",
        value: (c) => c.routeCode,
      },
      {
        key: "routeName",
        width: 240,
        label: "Route Name",
        type: "text",
        value: (c) => c.routeName,
      },
      {
        key: "vehicleType",
        width: 140,
        label: "Vehicle Type",
        type: "enum",
        options: vehicleTypes,
        value: (c) => c.vehicleType,
      },
      {
        key: "utilizationFactor",
        width: 120,
        label: "Utilization Factor",
        type: "number",
        value: (c) => c.utilizationFactor ?? 1,
        render: (c) => `${c.utilizationFactor ?? 1} trip/day`,
        className: "text-right",
      },
      {
        key: "fixed",
        width: 130,
        label: "Fixed Cost",
        type: "number",
        value: (c) => sumOf(c, "Fixed Cost"),
        render: (c) => money(sumOf(c, "Fixed Cost")),
      },
      {
        key: "variable",
        width: 140,
        label: "Variable Cost",
        type: "number",
        value: (c) => sumOf(c, "Variable Cost"),
        render: (c) => money(sumOf(c, "Variable Cost")),
      },
      {
        key: "other",
        width: 120,
        label: "Other Cost",
        type: "number",
        value: (c) => sumOf(c, "Other Cost"),
        render: (c) => money(sumOf(c, "Other Cost")),
      },
      {
        key: "total",
        width: 150,
        label: "Total COGS / Trip",
        type: "number",
        value: (c) => c.total,
        render: (c) => <span className="font-semibold">{money(c.total)}</span>,
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (c) => c.status,
        render: (c) => <StatusBadge status={c.status} />,
      },
      updatedAtColumn<CogsRecord>(),
      { key: "remark", label: "Remark", type: "text", value: (c) => c.remark, defaultHidden: true },
    ],
    [vehicleTypes],
  );

  return (
    <EntityListPage<CogsRecord>
      lang="en"
      screen="cogs"
      entityType="COGS"
      entityLabel="COGS"
      title="COGS"
      subtitle="Cost of goods sold of one trip, per route and vehicle type"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search COGS code, name, route..."
      searchValues={(c) => [c.code, c.name ?? "", c.routeCode, c.routeName]}
      quickFilters={[
        statusFilter,
        {
          key: "vehicleType",
          allLabel: "All vehicle types",
          options: vehicleTypes.map((t) => ({
            label: t,
            conditions: [{ field: "vehicleType", operator: "eq", value: t }],
          })),
        },
      ]}
      crud={cogsCrud}
      importExport={false}
      addLabel="Add COGS"
      onAdd={() => void navigate({ to: "/cogs/$id", params: { id: "new" }, search: {} })}
      onView={(c) => open(c, "view")}
      onEdit={(c) => open(c, "edit")}
    />
  );
}
