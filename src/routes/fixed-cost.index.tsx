import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions } from "@/services/commonCodeService";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { StatusBadge, Tag } from "@/components/movex/common";
import { PageHeader } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { FixedCostTabs, type FixedCostTab } from "@/components/movex/cost/FixedCostTabs";
import { FixedCostSummaryTab } from "@/components/movex/cost/FixedCostSummaryTab";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, fixedCostRepository } from "@/repositories";
import { FIXED_COST_VEHICLE_TYPES } from "@/mock-data/fixedCost";
import { calcFixedCost, fixedCostCrud } from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import type { FixedCostRecord } from "@/types";

export const Route = createFileRoute("/fixed-cost/")({
  validateSearch: (s: Record<string, unknown>): { tab?: FixedCostTab } =>
    s["tab"] === "summary" ? { tab: "summary" } : {},
  head: () => ({
    meta: [
      { title: "Fixed Cost — MoveX" },
      { name: "description", content: "Fixed cost master data and summary per vehicle type." },
    ],
  }),
  component: FixedCostPage,
});

function FixedCostPage() {
  const { tab } = Route.useSearch();
  if (tab === "summary")
    return (
      <div>
        <PageHeader
          crumbs={[{ label: "Cost" }, { label: "Fixed Cost" }]}
          title="Fixed Cost"
          subtitle="Fixed cost summary per vehicle type — feeds the Pricing List"
        />
        <FixedCostTabs active="summary" />
        <FixedCostSummaryTab />
      </div>
    );
  return <FixedCostList />;
}

const money = (n: number | null) => <span className="tabular-nums">{fmtMoney(n)}</span>;

function FixedCostList() {
  const navigate = useNavigate();
  const vehicleTypes = useCodeOptions(CC.FIXED_COST_VEHICLE_TYPE, FIXED_COST_VEHICLE_TYPES);
  const groups = useCollection(costGroupRepository);
  const rowsAll = useCollection(fixedCostRepository);
  const rows = useMemo(() => rowsAll.filter((f) => !f.deleted), [rowsAll]);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? "";
  const open = (f: FixedCostRecord, mode: "view" | "edit") => {
    if (mode === "edit" && f.status !== "Active") {
      toast.error("Activate this Fixed Cost before editing it.");
      return;
    }
    void navigate({ to: "/fixed-cost/$id", params: { id: f.id }, search: { mode } });
  };

  const columns = useMemo<ListColumn<FixedCostRecord>[]>(
    () => [
      { key: "costType", label: "Cost Type", type: "text", value: (f) => f.costTypeCode },
      {
        key: "code",
        label: "Fixed Cost Code",
        type: "text",
        pinned: true,
        value: (f) => f.code,
        render: (f) => <span className="font-semibold text-primary">{f.code}</span>,
      },
      { key: "name", label: "Fixed Cost Name", type: "text", pinned: true, value: (f) => f.name },
      {
        key: "vehicleTypes",
        label: "Vehicle Type",
        type: "text",
        value: (f) => f.vehicleTypes.join(", "),
        render: (f) =>
          f.vehicleTypes.length ? (
            <span className="whitespace-nowrap" title={f.vehicleTypes.join(", ")}>
              <Tag>{f.vehicleTypes[0]}</Tag>
              {f.vehicleTypes.length > 1 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  +{f.vehicleTypes.length - 1}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "costValue",
        label: "Cost Value",
        type: "number",
        value: (f) => f.costValue,
        render: (f) => (
          <span className="whitespace-nowrap tabular-nums">
            {fmtMoney(f.costValue, f.currency === "VND" ? 0 : 2)} {f.currency}
          </span>
        ),
        className: "text-right",
      },
      {
        key: "allocationBase",
        label: "Allocation Base",
        type: "text",
        value: (f) => `${f.allocationBase} ${f.allocationUnit}`,
      },
      {
        key: "allocationValue",
        label: "Allocation Value",
        type: "number",
        value: (f) => calcFixedCost(f).allocation,
        render: (f) => money(calcFixedCost(f).allocation),
        className: "text-right",
      },
      ...(["year", "month", "day", "trip"] as const).map((k): ListColumn<FixedCostRecord> => ({
        key: k,
        label: k[0]!.toUpperCase() + k.slice(1),
        type: "number",
        value: (f) => calcFixedCost(f)[k],
        render: (f) => money(calcFixedCost(f)[k]),
        className: "text-right",
      })),
      {
        key: "status",
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (f) => f.status,
        render: (f) => <StatusBadge status={f.status} />,
      },
      {
        key: "group",
        label: "Cost Group",
        type: "text",
        value: (f) => groupName(f.costGroupId),
        defaultHidden: true,
      },
      {
        key: "createdBy",
        label: "Created By",
        type: "text",
        value: (f) => f.createdBy,
        defaultHidden: true,
      },
      {
        key: "createdAt",
        label: "Created At",
        type: "date",
        value: (f) => f.createdAt,
        defaultHidden: true,
      },
      {
        key: "updatedBy",
        label: "Updated By",
        type: "text",
        value: (f) => f.updatedBy,
        defaultHidden: true,
      },
      updatedAtColumn<FixedCostRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups],
  );

  return (
    <EntityListPage<FixedCostRecord>
      lang="en"
      screen="fixed-cost"
      entityType="Fixed Cost"
      entityLabel="Fixed Cost"
      title="Fixed Cost"
      subtitle="Fixed costs converted to Year / Month / Day / Trip"
      above={<FixedCostTabs active="list" />}
      rows={rows}
      columns={columns}
      searchPlaceholder="Search fixed cost code or name..."
      searchValues={(f) => [f.code, f.name]}
      quickFilters={[
        {
          key: "vehicleType",
          allLabel: "All vehicle types",
          options: vehicleTypes.map((v) => ({
            label: v,
            conditions: [{ field: "vehicleTypes", operator: "contains", value: v }],
          })),
        },
        statusFilter,
      ]}
      crud={fixedCostCrud}
      allowDelete={false}
      addLabel="Add Fixed Cost"
      onAdd={() => void navigate({ to: "/fixed-cost/$id", params: { id: "new" }, search: {} })}
      onView={(f) => open(f, "view")}
      onEdit={(f) => open(f, "edit")}
    />
  );
}
