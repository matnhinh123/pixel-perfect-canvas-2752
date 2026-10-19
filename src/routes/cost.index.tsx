import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository, costItemRepository } from "@/repositories";
import { costNodeCrud, serviceNames, type CostNode } from "@/services/costMasterService";

export const Route = createFileRoute("/cost/")({
  // `route` is still accepted from old links (Routing list); the Cost master ignores it.
  validateSearch: (s: Record<string, unknown>): { route?: string } =>
    typeof s["route"] === "string" ? { route: s["route"] } : {},
  head: () => ({
    meta: [
      { title: "Cost — MoveX" },
      { name: "description", content: "Cost Groups and Cost Details." },
      { property: "og:title", content: "Cost — MoveX" },
      { property: "og:description", content: "Cost Groups and Cost Details." },
    ],
  }),
  component: CostListPage,
});

const TYPE_LABEL = { group: "Cost Group", detail: "Cost Detail" } as const;

/** Parent of a row in the tree: a group's parent group, a detail's group. */
const parentOf = (n: CostNode) => (n.kind === "group" ? n.parentId : n.groupId || null);

function CostListPage() {
  const groupsAll = useCollection(costGroupRepository);
  const itemsAll = useCollection(costItemRepository);
  const rows = useMemo<CostNode[]>(
    () => [
      ...groupsAll.filter((g) => !g.deleted).map((g) => ({ ...g, kind: "group" as const })),
      ...itemsAll.filter((c) => !c.deleted).map((c) => ({ ...c, kind: "detail" as const })),
    ],
    [groupsAll, itemsAll],
  );
  const navigate = useNavigate();
  const open = (n: CostNode, mode: "view" | "edit") =>
    void navigate({ to: "/cost/$id", params: { id: n.id }, search: { mode } });

  const columns = useMemo<ListColumn<CostNode>[]>(
    () => [
      {
        key: "code",
        width: 110,
        label: "Code",
        type: "text",
        pinned: true,
        value: (n) => n.code,
        render: (n) => <span className="font-semibold text-primary">{n.code}</span>,
      },
      {
        key: "name",
        width: 260,
        label: "Name",
        type: "text",
        value: (n) => n.name,
        render: (n) => <span className={n.kind === "group" ? "font-semibold" : ""}>{n.name}</span>,
      },
      {
        key: "type",
        width: 120,
        label: "Type",
        type: "enum",
        options: [TYPE_LABEL.group, TYPE_LABEL.detail],
        value: (n) => TYPE_LABEL[n.kind],
        render: (n) =>
          n.kind === "group" ? (
            <Tag tone="tpl">{TYPE_LABEL.group}</Tag>
          ) : (
            <Tag>{TYPE_LABEL.detail}</Tag>
          ),
      },
      {
        key: "localName",
        width: 240,
        label: "Local Name",
        type: "text",
        value: (n) => (n.kind === "detail" ? n.localName : ""),
      },
      {
        key: "service",
        width: 200,
        label: "Services",
        type: "text",
        value: (n) => (n.kind === "detail" ? serviceNames(n.serviceIds ?? []).join(", ") : ""),
        render: (n) => {
          const names = n.kind === "detail" ? serviceNames(n.serviceIds ?? []) : [];
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
      {
        key: "currency",
        width: 110,
        label: "Def Currency",
        type: "text",
        value: (n) => (n.kind === "detail" ? n.currency : ""),
      },
      {
        key: "taxTariff",
        width: 140,
        label: "Default Tax Tariff",
        type: "text",
        value: (n) => (n.kind === "detail" ? n.taxTariff : ""),
      },
      {
        key: "taxEvidence",
        width: 140,
        label: "Tax Evidence",
        type: "text",
        value: (n) => (n.kind === "detail" ? n.taxEvidence : ""),
        defaultHidden: true,
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (n) => n.status,
        render: (n) => <StatusBadge status={n.status} />,
      },
      updatedAtColumn<CostNode>(),
      { key: "remark", label: "Remark", type: "text", value: (n) => n.remark, defaultHidden: true },
    ],
    [],
  );

  return (
    <EntityListPage<CostNode>
      lang="en"
      screen="cost"
      entityType="Cost"
      entityTypeOf={(n) => (n.kind === "group" ? "Cost Group" : "Cost")}
      entityLabel="Cost"
      title="Cost"
      subtitle="Cost Groups and the Cost Details inside them"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search code, name..."
      searchValues={(n) => [n.code, n.name, n.kind === "detail" ? n.localName : ""]}
      tree={{ parentOf, column: "name" }}
      quickFilters={[
        statusFilter,
        {
          key: "type",
          allLabel: "All types",
          options: (["group", "detail"] as const).map((k) => ({
            label: TYPE_LABEL[k],
            conditions: [{ field: "type", operator: "eq", value: TYPE_LABEL[k] }],
          })),
        },
      ]}
      crud={costNodeCrud}
      allowDelete={false}
      addLabel="Add Cost"
      onAdd={() => void navigate({ to: "/cost/$id", params: { id: "new" }, search: {} })}
      onView={(n) => open(n, "view")}
      onEdit={(n) => open(n, "edit")}
      extraRowActions={[
        {
          label: "Add Cost Detail",
          icon: <Plus className="h-4 w-4" />,
          hidden: (n) => n.kind !== "group",
          onClick: (n) =>
            void navigate({
              to: "/cost/$id",
              params: { id: "new" },
              search: { type: "detail", group: n.id },
            }),
        },
      ]}
    />
  );
}
