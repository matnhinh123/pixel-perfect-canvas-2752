// Variable Cost › Variable Cost Mapping list: one mapping per route and vehicle type, with its variable
// costs worked out now. A row opens the mapping's page (view / edit); Add Mapping opens a new one.
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useTripSetups } from "@/components/movex/cost/useTripSetups";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository, routeRepository, variableCostMappingRepository } from "@/repositories";
import { tripVariable } from "@/services/cost/cogsBuild";
import { variableCostMappingCrud } from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import {
  VARIABLE_COMPONENTS,
  type VariableComponent,
  type VariableCostMappingRecord,
} from "@/types";

const money = (n: number) => formatNumber(Math.round(n));

export function VariableMappingTab() {
  const all = useCollection(variableCostMappingRepository);
  const routesAll = useCollection(routeRepository);
  const costsAll = useCollection(costItemRepository);
  const fareOf = (m: VariableCostMappingRecord) => costsAll.find((c) => c.id === m.assignCostId);
  const types = useVehicleTypes();
  const setups = useTripSetups();
  const navigate = useNavigate();
  const openMapping = (id: string, mode: "view" | "edit" = "view") =>
    void navigate({ to: "/variable-cost-mapping/$id", params: { id }, search: { mode } });
  const routeOf = (m: VariableCostMappingRecord) => routesAll.find((r) => r.id === m.routeId);
  /** The trip of a mapping, worked out now. */
  const tripOf = (m: VariableCostMappingRecord) => {
    const r = routeOf(m);
    const vt = types.find((t) => t.key === m.vehicleType);
    return r && vt
      ? tripVariable(r, vt, { ...setups, salaryRangeId: m.salaryRangeId, fuelCostId: m.fuelCostId })
      : null;
  };
  const amountOf = (m: VariableCostMappingRecord, c: VariableComponent) =>
    tripOf(m)?.lines.find((l) => l.component === c)?.amount ?? 0;
  const rows = useMemo(
    () =>
      all
        .filter((m) => !m.deleted)
        .sort(
          (a, b) =>
            (routeOf(a)?.code ?? "").localeCompare(routeOf(b)?.code ?? "") ||
            a.vehicleType.localeCompare(b.vehicleType),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, routesAll],
  );
  const typeKeys = types.map((t) => t.key);

  const columns = useMemo<ListColumn<VariableCostMappingRecord>[]>(
    () => [
      {
        key: "fareCode",
        width: 110,
        label: "Fare Code",
        type: "text",
        pinned: true,
        value: (m) => fareOf(m)?.code ?? "",
        render: (m) => <span className="font-semibold text-primary">{fareOf(m)?.code ?? "—"}</span>,
      },
      {
        key: "routeCode",
        width: 130,
        label: "Route Code",
        type: "text",
        value: (m) => routeOf(m)?.code ?? "",
        render: (m) => (
          <span className="font-semibold text-primary">{routeOf(m)?.code ?? "—"}</span>
        ),
      },
      {
        key: "routeName",
        width: 200,
        label: "Route Name",
        type: "text",
        value: (m) => routeOf(m)?.name ?? "",
      },
      {
        key: "vehicleType",
        width: 190,
        label: "Vehicle Type",
        type: "enum",
        options: typeKeys,
        value: (m) => m.vehicleType,
        render: (m) => (
          <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {m.vehicleType}
          </span>
        ),
      },
      ...VARIABLE_COMPONENTS.map((c): ListColumn<VariableCostMappingRecord> => ({
        key: c,
        width: 130,
        label: c,
        type: "number",
        value: (m) => amountOf(m, c),
        render: (m) => <span className="tabular-nums">{money(amountOf(m, c))}</span>,
        className: "text-right",
      })),
      {
        key: "total",
        width: 150,
        label: "Variable Cost / Trip",
        type: "number",
        value: (m) => tripOf(m)?.total ?? 0,
        render: (m) => <b className="tabular-nums">{money(tripOf(m)?.total ?? 0)}</b>,
        className: "text-right",
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (m) => m.status,
        render: (m) => <StatusBadge status={m.status} />,
      },
      updatedAtColumn<VariableCostMappingRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routesAll, costsAll, typeKeys.join("|"), setups],
  );

  return (
    <>
      <EntityListPage<VariableCostMappingRecord>
        embedded
        lang="en"
        screen="variable-cost-mapping"
        entityType="Variable Cost Mapping"
        entityLabel="Mapping"
        title="Variable Cost Mapping"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search route, vehicle type..."
        searchValues={(m) => [
          fareOf(m)?.code ?? "",
          routeOf(m)?.code ?? "",
          routeOf(m)?.name ?? "",
          m.vehicleType,
        ]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: typeKeys.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleType", operator: "eq", value: v }],
            })),
          },
          statusFilter,
        ]}
        crud={variableCostMappingCrud}
        readOnlyReason="Import is not available for mappings yet"
        bordered
        addLabel="Add Mapping"
        onAdd={() =>
          void navigate({ to: "/variable-cost-mapping/$id", params: { id: "new" }, search: {} })
        }
        onView={(m) => openMapping(m.id)}
        onEdit={(m) => openMapping(m.id, "edit")}
      />
    </>
  );
}
