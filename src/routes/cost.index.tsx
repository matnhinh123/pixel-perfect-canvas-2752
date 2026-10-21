import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import {
  costItemCrud,
  serviceNames,
  usedGroups,
  usedSubGroups,
  costItemImportConfig,
} from "@/services/costMasterService";
import type { CostItemRecord } from "@/types";

export const Route = createFileRoute("/cost/")({
  // `route` is still accepted from old links (Routing list); the Cost master ignores it.
  validateSearch: (s: Record<string, unknown>): { route?: string } =>
    typeof s["route"] === "string" ? { route: s["route"] } : {},
  head: () => ({
    meta: [
      { title: "Fare Code Management — MoveX" },
      { name: "description", content: "Fare codes with their group and sub group." },
      { property: "og:title", content: "Fare Code Management — MoveX" },
      { property: "og:description", content: "Fare codes with their group and sub group." },
    ],
  }),
  component: CostListPage,
});

function CostListPage() {
  const itemsAll = useCollection(costItemRepository);
  const groupsAll = useCollection(costGroupRepository);
  const rows = useMemo(() => itemsAll.filter((c) => !c.deleted), [itemsAll]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => usedGroups(rows), [rows, groupsAll]);
  const subGroups = useMemo(() => usedSubGroups(rows), [rows]);
  const navigate = useNavigate();
  const open = (c: CostItemRecord, mode: "view" | "edit") =>
    void navigate({ to: "/cost/$id", params: { id: c.id }, search: { mode } });

  const columns = useMemo<ListColumn<CostItemRecord>[]>(
    () => [
      {
        key: "code",
        width: 110,
        label: "Fare Code",
        type: "text",
        pinned: true,
        value: (c) => c.code,
        render: (c) => <span className="font-semibold text-primary">{c.code}</span>,
      },
      { key: "name", width: 260, label: "Fare Name (EN)", type: "text", value: (c) => c.name },
      {
        key: "localName",
        width: 260,
        label: "Local Name",
        type: "text",
        value: (c) => c.localName,
      },
      {
        key: "group",
        width: 160,
        label: "Group Name",
        type: "enum",
        options: groups,
        value: (c) => c.group ?? "",
      },
      {
        key: "subGroup",
        width: 150,
        label: "Sub Group Name",
        type: "text",
        value: (c) => c.subGroup ?? "",
      },
      {
        key: "taxTariff",
        width: 140,
        label: "Default Tax Tariff",
        type: "text",
        value: (c) => c.taxTariff,
      },
      {
        key: "unit",
        width: 110,
        label: "Default Unit",
        type: "text",
        value: (c) => c.unit ?? "",
      },
      {
        key: "currency",
        width: 110,
        label: "Default Currency",
        type: "text",
        value: (c) => c.currency,
      },
      {
        key: "taxEvidence",
        width: 140,
        label: "Tax Evidence",
        type: "text",
        value: (c) => c.taxEvidence,
      },
      {
        key: "service",
        width: 200,
        label: "Services",
        type: "text",
        value: (c) => serviceNames(c.serviceIds ?? []).join(", "),
        defaultHidden: true,
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
      updatedAtColumn<CostItemRecord>(),
      { key: "remark", label: "Remark", type: "text", value: (c) => c.remark, defaultHidden: true },
    ],
    [groups],
  );

  return (
    <EntityListPage<CostItemRecord>
      lang="en"
      screen="cost-detail"
      entityType="Cost"
      entityLabel="Fare Code"
      title="Fare Code Management"
      subtitle="Fare codes with their group and sub group"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search fare code, fare name..."
      searchValues={(c) => [c.code, c.name, c.localName]}
      quickFilters={[
        statusFilter,
        {
          key: "group",
          allLabel: "All groups",
          options: groups.map((g) => ({
            label: g,
            conditions: [{ field: "group", operator: "eq", value: g }],
          })),
        },
        {
          key: "subGroup",
          allLabel: "All sub groups",
          options: subGroups.map((g) => ({
            label: g,
            conditions: [{ field: "subGroup", operator: "eq", value: g }],
          })),
        },
      ]}
      importConfig={costItemImportConfig}
      bordered
      crud={costItemCrud}
      allowDelete={false}
      addLabel="Add Fare Code"
      onAdd={() => void navigate({ to: "/cost/$id", params: { id: "new" }, search: {} })}
      onView={(c) => open(c, "view")}
      onEdit={(c) => open(c, "edit")}
    />
  );
}
