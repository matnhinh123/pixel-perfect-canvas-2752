import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { CostDetailDrawer, costEditComingSoon } from "@/components/movex/cost/CostDetailDrawer";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import { costItemCrud, groupName, serviceName } from "@/services/costMasterService";
import type { CostItemRecord } from "@/types";

export const Route = createFileRoute("/cost/")({
  // `route` is still accepted from old links (Routing list); the Cost master ignores it.
  validateSearch: (s: Record<string, unknown>): { route?: string } =>
    typeof s["route"] === "string" ? { route: s["route"] } : {},
  head: () => ({
    meta: [
      { title: "Cost — MoveX" },
      { name: "description", content: "Cost master data." },
      { property: "og:title", content: "Cost — MoveX" },
      { property: "og:description", content: "Cost master data." },
    ],
  }),
  component: CostListPage,
});

function CostListPage() {
  const groupsAll = useCollection(costGroupRepository);
  const itemsAll = useCollection(costItemRepository);
  const groups = useMemo(() => groupsAll.filter((g) => !g.deleted), [groupsAll]);
  const items = useMemo(() => itemsAll.filter((c) => !c.deleted), [itemsAll]);
  const [costId, setCostId] = useState<string | null>(null);

  const columns = useMemo<ListColumn<CostItemRecord>[]>(
    () => [
      {
        key: "code",
        label: "Cost Code",
        type: "text",
        pinned: true,
        value: (c) => c.code,
        render: (c) => <span className="font-semibold text-primary">{c.code}</span>,
      },
      { key: "name", label: "Cost Name", type: "text", value: (c) => c.name },
      { key: "localName", label: "Local Name", type: "text", value: (c) => c.localName },
      {
        key: "group",
        label: "Cost Group",
        type: "enum",
        options: groups.map((g) => g.name),
        value: (c) => groupName(c.groupId, groups),
      },
      { key: "service", label: "Service", type: "text", value: (c) => serviceName(c.serviceId) },
      { key: "currency", label: "Currency", type: "text", value: (c) => c.currency },
      { key: "uom", label: "UoM", type: "text", value: (c) => c.uom },
      {
        key: "status",
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (c) => c.status,
        render: (c) => <StatusBadge status={c.status} />,
      },
      updatedAtColumn<CostItemRecord>(),
      {
        key: "taxEvidence",
        label: "Tax Evidence",
        type: "text",
        value: (c) => c.taxEvidence,
        defaultHidden: true,
      },
      {
        key: "taxTariff",
        label: "Tax Tariff",
        type: "text",
        value: (c) => c.taxTariff,
        defaultHidden: true,
      },
      { key: "remark", label: "Remark", type: "text", value: (c) => c.remark, defaultHidden: true },
    ],
    [groups],
  );

  return (
    <>
      <EntityListPage<CostItemRecord>
        lang="en"
        screen="cost-item"
        entityType="Cost"
        entityLabel="Cost"
        title="Cost"
        subtitle="Cost master data"
        rows={items}
        columns={columns}
        searchPlaceholder="Search code, name..."
        searchValues={(c) => [c.code, c.name, c.localName]}
        quickFilters={[
          statusFilter,
          {
            key: "group",
            allLabel: "All cost groups",
            options: groups.map((g) => ({
              label: g.name,
              conditions: [{ field: "group", operator: "eq", value: g.name }],
            })),
          },
        ]}
        crud={costItemCrud}
        allowDelete={false}
        readOnlyReason="Cost Create / Edit is coming soon."
        onView={(c) => setCostId(c.id)}
        onEdit={costEditComingSoon}
      />
      <CostDetailDrawer
        cost={items.find((c) => c.id === costId) ?? null}
        groups={groups}
        onClose={() => setCostId(null)}
      />
    </>
  );
}
