import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { CostGroupTabs } from "@/components/movex/cost/CostGroupTabs";
import { CostGroupDrawer, type CostGroupTarget } from "@/components/movex/cost/CostGroupDrawer";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import { costGroupTabs, costItemCrud, groupName, serviceNames } from "@/services/costMasterService";
import type { CostGroupRecord, CostItemRecord } from "@/types";

// "Cost 2": Cost Group and Cost on one page (Cost Group tabs + drawer), offered next to the
// separate Cost Group / Cost pages so the client can compare both layouts.
export const Route = createFileRoute("/cost-2")({
  // `group`: selected Cost Group tab (code).
  validateSearch: (s: Record<string, unknown>): { group?: string } =>
    typeof s["group"] === "string" && s["group"] ? { group: s["group"] } : {},
  head: () => ({
    meta: [
      { title: "Cost — MoveX" },
      { name: "description", content: "Cost master data." },
      { property: "og:title", content: "Cost — MoveX" },
      { property: "og:description", content: "Cost master data." },
    ],
  }),
  component: Cost2Page,
});

function Cost2Page() {
  const groupsAll = useCollection(costGroupRepository);
  const itemsAll = useCollection(costItemRepository);
  const groups = useMemo(() => groupsAll.filter((g) => !g.deleted), [groupsAll]);
  const items = useMemo(() => itemsAll.filter((c) => !c.deleted), [itemsAll]);
  const navigate = useNavigate();
  const open = (c: CostItemRecord, mode: "view" | "edit") =>
    void navigate({ to: "/cost/$id", params: { id: c.id }, search: { mode, from: "cost-2" } });

  // One tab per Cost Group (selection in the URL).
  const search = Route.useSearch();
  const selectedCode = search.group;
  const selected = groups.find((g) => g.code === selectedCode) ?? null;
  const rows = selected ? items.filter((c) => c.groupId === selected.id) : items;
  const select = (g: CostGroupRecord | null) =>
    void navigate({ to: "/cost-2", search: g ? { group: g.code } : {}, replace: true });

  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const parentOf = (c: CostItemRecord) => {
    const pid = byId.get(c.groupId)?.parentId;
    return pid ? byId.get(pid) : undefined;
  };

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
        // Cost Code → Cost Group (shown here) → Parent Cost Group (shown in the Cost Group drawer).
        key: "groupCode",
        label: "Cost Group Code",
        type: "enum",
        options: groups.map((g) => g.code),
        value: (c) => byId.get(c.groupId)?.code ?? "",
      },
      {
        key: "group",
        label: "Cost Group Name",
        type: "enum",
        options: groups.map((g) => g.name),
        value: (c) => groupName(c.groupId, groups),
      },
      {
        key: "service",
        label: "Services",
        type: "text",
        value: (c) => serviceNames(c.serviceIds ?? []).join(", "),
        render: (c) => {
          const names = serviceNames(c.serviceIds ?? []);
          if (!names.length) return <span className="text-muted-foreground">—</span>;
          return (
            <span title={names.join(", ")}>
              {names[0]}
              {names.length > 1 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  +{names.length - 1}
                </span>
              )}
            </span>
          );
        },
      },
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
    [groups, byId],
  );

  // Add / edit Cost Groups in a drawer, without leaving the page; the saved group gets selected.
  const [groupTarget, setGroupTarget] = useState<CostGroupTarget | null>(null);
  const onGroupSaved = (g: CostGroupRecord) => {
    setGroupTarget(null);
    // Show the saved group when it has a tab; a pure parent group keeps the current tab.
    if (costGroupTabs().some((x) => x.id === g.id)) select(g);
  };

  return (
    <>
      <EntityListPage<CostItemRecord>
        lang="en"
        screen="cost-item-2"
        entityType="Cost"
        entityLabel="Cost"
        title="Cost"
        subtitle="Cost codes by cost group"
        above={
          <CostGroupTabs
            groups={groups}
            items={items}
            selected={selected}
            onSelect={select}
            onAdd={() => setGroupTarget({ mode: "new", parentId: null })}
            onEdit={(g) => setGroupTarget({ mode: "edit", group: g })}
          />
        }
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, name, cost group..."
        searchValues={(c) => [
          c.code,
          c.name,
          c.localName,
          groupName(c.groupId, groups),
          byId.get(c.groupId)?.code,
          parentOf(c)?.code,
          parentOf(c)?.name,
        ]}
        quickFilters={[statusFilter]}
        crud={costItemCrud}
        allowDelete={false}
        addLabel="Add Cost"
        onAdd={() =>
          void navigate({
            to: "/cost/$id",
            params: { id: "new" },
            // A cost added from a group tab starts in that group.
            search: { from: "cost-2", ...(selected ? { group: selected.id } : {}) },
          })
        }
        onView={(c) => open(c, "view")}
        onEdit={(c) => open(c, "edit")}
      />
      <CostGroupDrawer
        target={groupTarget}
        groups={groups}
        onClose={() => setGroupTarget(null)}
        onSaved={onGroupSaved}
        onEditGroup={(g) => setGroupTarget({ mode: "edit", group: g })}
      />
    </>
  );
}
