import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { useCollection } from "@/hooks/use-store";
import { costGroupRepository } from "@/repositories";
import { costGroupCrud, costGroupImportConfig } from "@/services/costMasterService";
import type { CostGroupRecord } from "@/types";

export const Route = createFileRoute("/cost-group/")({
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
  const navigate = useNavigate();
  const open = (g: CostGroupRecord, mode: "view" | "edit") =>
    void navigate({ to: "/cost-group/$id", params: { id: g.id }, search: { mode } });

  const columns = useMemo<ListColumn<CostGroupRecord>[]>(
    () => [
      {
        key: "code",
        label: "Cost Group Code",
        type: "text",
        pinned: true,
        value: (g) => g.code,
        render: (g) => <span className="font-semibold text-primary">{g.code}</span>,
      },
      { key: "name", label: "Cost Group Name", type: "text", value: (g) => g.name },
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
    [],
  );

  return (
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
      quickFilters={[statusFilter]}
      crud={costGroupCrud}
      allowDelete={false}
      addLabel="Add Cost Group"
      onAdd={() => void navigate({ to: "/cost-group/$id", params: { id: "new" }, search: {} })}
      onView={(g) => open(g, "view")}
      onEdit={(g) => open(g, "edit")}
      importConfig={costGroupImportConfig}
    />
  );
}
