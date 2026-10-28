// Variable Cost › Salary Range list: the driver salary tiers of each vehicle type, under its own code.
// A row opens its page (view / edit); Add Salary Range opens a new one; Duplicate makes a Draft copy
// without a vehicle type, to set up for another one.
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import type { ListColumn } from "@/components/movex/general/types";
import { updatedAtColumn } from "@/components/movex/cost/listParts";
import type { QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { ruleOf, type CalcRule } from "@/services/cost/salaryRange";
import { salaryRangeCrud, salaryRangeService } from "@/services/cost/variableSetup";
import { salaryVehicleChoices } from "@/services/cost/cogsVehicle";
import { formatNumber } from "@/lib/format";
import type { SalaryRangeRecord } from "@/types";

const ruleText = (r: CalcRule) =>
  [
    r.roundStep ? `Round up ${formatNumber(r.roundStep)}` : "No rounding",
    r.regionOn ? `Other terrain +${formatNumber(r.regionAmount)}` : "No Other terrain surcharge",
  ].join(" · ");

const STATUSES = ["Draft", "Active", "Inactive"];
const statusFilter: QuickFilter = {
  key: "status",
  allLabel: "All statuses",
  options: STATUSES.map((v) => ({
    label: v,
    conditions: [{ field: "status", operator: "eq", value: v }],
  })),
};

export function SalaryRangeTab() {
  const all = useCollection(salaryRangeRepository);
  const types = useVehicleTypes();
  const navigate = useNavigate();
  const openRange = (id: string, mode: "view" | "edit" = "view") =>
    void navigate({ to: "/salary-range/$id", params: { id }, search: { mode } });
  const rows = useMemo(
    () => all.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [all],
  );
  const typeKeys = salaryVehicleChoices(types);
  const duplicate = (r: SalaryRangeRecord) => {
    try {
      const copy = salaryRangeService.duplicate(r.id);
      toast.success(`${copy.code} created as Draft — pick its Vehicle Type`);
      openRange(copy.id, "edit");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  };
  const columns = useMemo<ListColumn<SalaryRangeRecord>[]>(
    () => [
      {
        key: "code",
        width: 130,
        label: "Salary Range Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      {
        key: "vehicleType",
        width: 150,
        label: "Vehicle Type",
        type: "text",
        value: (r) => r.vehicleType,
        render: (r) =>
          r.vehicleType || <span className="text-xs italic text-muted-foreground">Not picked</span>,
      },
      {
        key: "containers",
        width: 220,
        label: "Container Columns",
        type: "text",
        value: (r) => (r.containers ?? []).map((c) => `${c.container} +${c.pct}%`).join(", "),
        render: (r) =>
          r.containers?.length ? (
            <div className="flex flex-wrap gap-1">
              {r.containers.map((c) => (
                <span
                  key={c.container}
                  className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {c.container} +{c.pct}%
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { key: "name", width: 240, label: "Salary Range Name", type: "text", value: (r) => r.name },
      {
        key: "tiers",
        width: 170,
        label: "Tiers",
        type: "text",
        value: (r) => `${r.tiers.length} tiers`,
        render: (r) =>
          `${r.tiers.length} tiers · 0 – ${formatNumber(r.tiers[r.tiers.length - 1]?.to ?? 0)} km`,
      },
      {
        key: "rule",
        width: 260,
        label: "Calculation Rule",
        type: "text",
        value: (r) => ruleText(ruleOf(r.rule)),
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: STATUSES,
        value: (r) => r.status,
        render: (r) => <StatusBadge status={r.status} />,
      },
      updatedAtColumn<SalaryRangeRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeKeys.join("|")],
  );

  return (
    <div className="space-y-4">
      <EntityListPage<SalaryRangeRecord>
        fillHeight
        above={<VariableCostTabs active="salary" />}
        lang="en"
        screen="salary-range.v2"
        entityType="Salary Range"
        entityLabel="Salary Range"
        title="Variable Cost"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, name, vehicle type..."
        searchValues={(r) => [r.code, r.name, r.vehicleType]}
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
        crud={salaryRangeCrud}
        readOnlyReason="Import is not available for salary ranges yet"
        bordered
        addLabel="Add Salary Range"
        onAdd={() => void navigate({ to: "/salary-range/$id", params: { id: "new" }, search: {} })}
        onView={(r) => openRange(r.id)}
        onEdit={(r) => openRange(r.id, "edit")}
        extraRowActions={[
          { label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: duplicate },
        ]}
      />
    </div>
  );
}
