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
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { vehicleTypeChoices } from "@/services/fixedCostVehicle";
import {
  calcFixedCost,
  fixedCostCrud,
  fixedCostImportConfig,
  loanLabel,
} from "@/services/fixedCostService";
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
          subtitle="Fare Code mapping: the internal costs booked to each Fare Code"
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
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const vehicleTypes = useMemo(() => vehicleTypeChoices(vehiclesAll), [vehiclesAll]);
  const details = useCollection(costItemRepository);
  const rowsAll = useCollection(fixedCostRepository);
  const rows = useMemo(() => rowsAll.filter((f) => !f.deleted), [rowsAll]);
  const mappings = useCollection(fixedCostSummaryRepository);
  /** Fare Codes whose mappings use the fixed cost (Fixed Cost Summary). */
  const mappedTo = (id: string) => [
    ...new Set(
      mappings
        .filter((m) => !m.deleted && m.fixedCostIds.includes(id))
        .map((m) => details.find((c) => c.id === m.assignCostId)?.code ?? "?"),
    ),
  ];
  const open = (f: FixedCostRecord, mode: "view" | "edit") => {
    if (mode === "edit" && f.status !== "Active") {
      toast.error("Activate this Internal Cost before editing it.");
      return;
    }
    void navigate({ to: "/fixed-cost/$id", params: { id: f.id }, search: { mode } });
  };

  const columns = useMemo<ListColumn<FixedCostRecord>[]>(
    () => [
      {
        key: "code",
        label: "Internal Cost Code",
        type: "text",
        pinned: true,
        value: (f) => f.code,
        render: (f) => <span className="font-semibold text-primary">{f.code}</span>,
      },
      {
        key: "name",
        label: "Internal Cost Name (EN)",
        type: "text",
        pinned: true,
        value: (f) => f.name,
      },
      {
        key: "localName",
        label: "Internal Cost Name (Local)",
        type: "text",
        value: (f) => f.localName ?? "",
      },
      {
        key: "costType",
        label: "Fee Type",
        type: "enum",
        options: ["Allocation", "Loan Interest", "Other"],
        value: (f) => f.costType ?? "Allocation",
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
        key: "currency",
        label: "Currency",
        type: "text",
        value: (f) => f.currency,
        defaultHidden: true,
      },
      {
        key: "loan",
        label: "Loan",
        type: "text",
        value: (f) => loanLabel(f.loan),
        defaultHidden: true,
      },
      {
        key: "allocationDays",
        label: "Allocation Days",
        type: "number",
        value: (f) => f.allocationDays,
        defaultHidden: true,
      },
      {
        key: "allocationValue",
        label: "Allocation Value",
        type: "number",
        value: (f) => calcFixedCost(f).allocation,
        render: (f) => money(calcFixedCost(f).allocation),
        className: "text-right",
      },
      ...(["year", "month", "day"] as const).map((k): ListColumn<FixedCostRecord> => ({
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
        key: "mappedTo",
        label: "Mapped To",
        type: "text",
        value: (f) => mappedTo(f.id).join(", "),
        render: (f) => {
          const codes = mappedTo(f.id);
          return codes.length ? (
            <span className="whitespace-nowrap">{codes.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground">Not mapped</span>
          );
        },
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
    [details],
  );

  return (
    <EntityListPage<FixedCostRecord>
      lang="en"
      screen="fixed-cost"
      entityType="Fixed Cost"
      entityLabel="Internal Cost"
      title="Fixed Cost"
      subtitle="Internal costs converted to Year / Month / Day"
      above={<FixedCostTabs active="list" />}
      rows={rows}
      columns={columns}
      searchPlaceholder="Search internal cost code or name..."
      searchValues={(f) => [f.code, f.name]}
      quickFilters={[statusFilter]}
      importConfig={fixedCostImportConfig}
      crud={fixedCostCrud}
      allowDelete={false}
      addLabel="Add Internal Cost"
      onAdd={() => void navigate({ to: "/fixed-cost/$id", params: { id: "new" }, search: {} })}
      onView={(f) => open(f, "view")}
      onEdit={(f) => open(f, "edit")}
    />
  );
}
