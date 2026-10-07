import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import {
  CostGroupDrawer,
  type CostGroupDrawerState,
} from "@/components/movex/cost/CostGroupDrawer";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository } from "@/repositories";
import { costGroupCrud, costGroupImportConfig, groupName } from "@/services/costMasterService";
import type { CostGroupRecord } from "@/types";

export const Route = createFileRoute("/cost-group")({
  head: () => ({
    meta: [
      { title: "Cost Group — MoveX" },
      { name: "description", content: "Cost groups used to organize cost master data." },
      { property: "og:title", content: "Cost Group — MoveX" },
      { property: "og:description", content: "Cost groups used to organize cost master data." },
    ],
  }),
  component: CostGroupPage,
});

function CostGroupPage() {
  const all = useCollection(costGroupRepository);
  const groups = useMemo(() => all.filter((g) => !g.deleted), [all]);
  const [drawer, setDrawer] = useState<CostGroupDrawerState | null>(null);

  const parentNames = useMemo(
    () =>
      Array.from(
        new Set(groups.filter((g) => g.parentId).map((g) => groupName(g.parentId, groups))),
      ).filter(Boolean),
    [groups],
  );

  const columns = useMemo<ListColumn<CostGroupRecord>[]>(
    () => [
      {
        key: "code",
        label: "Group Code",
        type: "text",
        pinned: true,
        value: (g) => g.code,
        render: (g) => <span className="font-semibold text-primary">{g.code}</span>,
      },
      { key: "name", label: "Group Name", type: "text", value: (g) => g.name },
      {
        key: "parent",
        label: "Parent Group",
        type: "enum",
        options: parentNames,
        value: (g) => groupName(g.parentId, groups),
        render: (g) =>
          groupName(g.parentId, groups) || <span className="text-muted-foreground">—</span>,
      },
      {
        key: "status",
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (g) => g.status,
        render: (g) => <StatusBadge status={g.status} />,
      },
      updatedAtColumn<CostGroupRecord>(),
      { key: "remark", label: "Remark", type: "text", value: (g) => g.remark, defaultHidden: true },
    ],
    [groups, parentNames],
  );

  return (
    <>
      <EntityListPage<CostGroupRecord>
        lang="en"
        screen="cost-group"
        entityType="Cost Group"
        entityLabel="Cost Group"
        title="Cost Group"
        subtitle="Cost groups used to organize cost master data"
        rows={groups}
        columns={columns}
        searchPlaceholder="Search code, name..."
        searchValues={(g) => [g.code, g.name]}
        quickFilters={[
          statusFilter,
          {
            key: "parent",
            allLabel: "All parent groups",
            options: parentNames.map((n) => ({
              label: n,
              conditions: [{ field: "parent", operator: "eq", value: n }],
            })),
          },
        ]}
        crud={costGroupCrud}
        allowDelete={false}
        addLabel="Add Cost Group"
        onAdd={() => setDrawer({ mode: "create" })}
        onView={(g) => setDrawer({ mode: "view", id: g.id })}
        onEdit={(g) => setDrawer({ mode: "edit", id: g.id })}
        importConfig={costGroupImportConfig}
      />
      <CostGroupDrawer state={drawer} groups={groups} onChange={setDrawer} />
    </>
  );
}
