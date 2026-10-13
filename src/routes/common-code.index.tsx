import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository } from "@/repositories";
import type { CommonCodeRecord } from "@/types";

export const Route = createFileRoute("/common-code/")({
  head: () => ({ meta: [{ title: "Common Code — MoveX" }] }),
  component: CommonCodeList,
});

type Row = CommonCodeRecord;

const columns: ListColumn<Row>[] = [
  {
    key: "code",
    label: "Common Code",
    type: "text",
    pinned: true,
    width: 140,
    value: (r) => r.code,
    render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
  },
  {
    key: "name",
    label: "Common Name",
    type: "text",
    width: 260,
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "kind",
    label: "Type",
    type: "enum",
    options: ["Customizable", "Fixed"],
    width: 140,
    value: (r) => r.kind,
    render: (r) => <Tag>{r.kind}</Tag>,
  },
  {
    key: "options",
    label: "Options",
    type: "number",
    width: 130,
    value: (r) => r.options.filter((o) => o.active).length,
    render: (r) => (
      <span>
        {r.options.filter((o) => o.active).length}
        <span className="text-muted-foreground"> / {r.options.length} active</span>
      </span>
    ),
  },
  {
    key: "usage",
    label: "Used In",
    type: "text",
    width: 220,
    truncate: true,
    value: (r) => [...new Set(r.usage.map((u) => u.module))].join(", "),
  },
  {
    key: "remark",
    label: "Description",
    type: "text",
    width: 360,
    truncate: true,
    value: (r) => r.remark,
    render: (r) => r.remark || <span className="text-muted-foreground">--</span>,
  },
];

/** Common Code types are defined by the system: the list has no Add / Delete. */
function CommonCodeList() {
  const navigate = useNavigate();
  const all = useCollection(commonCodeRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
  const open = (r: Row) => void navigate({ to: "/common-code/$id", params: { id: r.id } });
  return (
    <EntityListPage<Row>
      screen="common-code"
      entityType="Common Code"
      entityLabel="Common Code"
      title="Common Code List"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search"
      searchValues={(r) => [r.code, r.name, r.remark]}
      quickFilters={[
        {
          key: "kind",
          allLabel: "Type: All",
          options: ["Customizable", "Fixed"].map((k) => ({
            label: k,
            conditions: [{ field: "kind", operator: "eq", value: k }],
          })),
        },
      ]}
      showRefresh={false}
      allowDelete={false}
      onView={open}
      onEdit={open}
    />
  );
}
