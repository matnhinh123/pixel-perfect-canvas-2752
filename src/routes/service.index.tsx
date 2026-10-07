import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import {
  groupOf,
  serviceCrud,
  serviceImportConfig,
  templateOf,
  treeOrder,
} from "@/services/serviceCatalogService";
import { formName } from "@/mock-data/templates";
import { formatDateTime } from "@/lib/format";
import { TEMPLATES, type ServiceRecord } from "@/types";

export const Route = createFileRoute("/service/")({
  head: () => ({
    meta: [
      { title: "Service — MoveX" },
      {
        name: "description",
        content: "Danh mục dịch vụ, cấu hình form và phân công người xử lý.",
      },
      { property: "og:title", content: "Service — MoveX" },
      {
        property: "og:description",
        content: "Danh mục dịch vụ, cấu hình form và phân công người xử lý.",
      },
    ],
  }),
  component: ServiceList,
});

const FORM_NAMES = TEMPLATES.map((t) => formName(t));

const quickFilters: QuickFilter[] = [
  {
    key: "form",
    allLabel: "Tất cả form",
    options: FORM_NAMES.map((f) => ({
      label: f,
      conditions: [{ field: "form", operator: "eq", value: f }],
    })),
  },
  {
    key: "status",
    allLabel: "Tất cả trạng thái",
    options: ["Active", "Inactive"].map((v) => ({
      label: v,
      conditions: [{ field: "status", operator: "eq", value: v }],
    })),
  },
];

function ServiceList() {
  const navigate = useNavigate();
  const all = useCollection(serviceRepository);
  const rows = useMemo(() => treeOrder(all.filter((s) => !s.deleted)), [all]);

  const view = (s: ServiceRecord) =>
    void navigate({ to: "/service/$id", params: { id: s.id }, search: { mode: "view" } });

  const columns = useMemo<ListColumn<ServiceRecord>[]>(() => {
    const byId = new Map(rows.map((s) => [s.id, s]));
    return [
      {
        key: "code",
        label: "Mã dịch vụ",
        type: "text",
        pinned: true,
        value: (s) => s.code,
        render: (s) => <span className="font-semibold text-primary">{s.code}</span>,
      },
      {
        key: "name",
        label: "Tên dịch vụ",
        type: "text",
        value: (s) => s.name,
        render: (s) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              view(s);
            }}
            className={s.parentId ? "font-medium hover:underline" : "font-bold hover:underline"}
          >
            {s.name}
          </button>
        ),
      },
      {
        key: "parent",
        label: "Dịch vụ cha",
        type: "text",
        value: (s) => (s.parentId ? (byId.get(s.parentId)?.name ?? "") : ""),
        render: (s) =>
          s.parentId ? (
            byId.get(s.parentId)?.name
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "group",
        label: "Nhóm dịch vụ",
        type: "text",
        value: (s) => groupOf(s, rows),
      },
      {
        key: "form",
        label: "Form",
        type: "enum",
        options: FORM_NAMES,
        value: (s) => formName(templateOf(s, rows)),
        render: (s) => <Tag tone="tpl">{formName(templateOf(s, rows))}</Tag>,
      },
      {
        key: "status",
        label: "Trạng thái",
        type: "enum",
        options: ["Active", "Inactive", "Draft"],
        value: (s) => s.status,
        render: (s) => <StatusBadge status={s.status} />,
      },
      {
        key: "updatedAt",
        label: "Cập nhật lúc",
        type: "date",
        value: (s) => s.updatedAt,
        render: (s) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(s.updatedAt)}</span>
        ),
      },
    ];
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EntityListPage<ServiceRecord>
      screen="service.v2"
      entityType="Service"
      entityLabel="Service"
      title="Service"
      subtitle="Danh mục dịch vụ, cấu hình form và phân công người xử lý"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm mã, tên dịch vụ..."
      searchValues={(s) => [s.code, s.name]}
      quickFilters={quickFilters}
      crud={serviceCrud}
      allowDelete={false}
      tree={{ parentOf: (s) => s.parentId, column: "name" }}
      addLabel="Add Service"
      onAdd={() => void navigate({ to: "/service/$id", params: { id: "new" } })}
      onView={view}
      onEdit={(s) =>
        void navigate({ to: "/service/$id", params: { id: s.id }, search: { mode: "edit" } })
      }
      importConfig={serviceImportConfig}
    />
  );
}
