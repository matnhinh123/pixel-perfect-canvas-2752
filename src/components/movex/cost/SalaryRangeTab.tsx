// Variable Cost › Salary Range list: the driver salary tiers of each vehicle type, under its own code.
// A row opens its page (view / edit); Add Salary Range opens a new one.
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { ruleOf, type CalcRule } from "@/services/cost/salaryRange";
import { salaryRangeCrud } from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import type { SalaryRangeRecord } from "@/types";

const ruleText = (r: CalcRule) =>
  [
    r.roundStep ? `Round up ${formatNumber(r.roundStep)}` : "No rounding",
    r.regionOn ? `Highland +${formatNumber(r.regionAmount)}` : "No Highland",
  ].join(" · ");

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
  const typeKeys = types.map((t) => t.key);
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
        key: "vehicleTypes",
        width: 260,
        label: "Vehicle Types",
        type: "text",
        value: (r) => r.vehicleTypes.join(", "),
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {r.vehicleTypes.map((t) => (
              <span
                key={t}
                className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
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
        options: ["Active", "Inactive"],
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
        embedded
        lang="en"
        screen="salary-range.v2"
        entityType="Salary Range"
        entityLabel="Salary Range"
        title="Salary Range"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, name, vehicle type..."
        searchValues={(r) => [r.code, r.name, ...r.vehicleTypes]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: typeKeys.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleTypes", operator: "contains", value: v }],
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
      />
    </div>
  );
}
