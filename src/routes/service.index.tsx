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
import { tr, useT } from "@/lib/i18n";
import { TEMPLATES, type ServiceRecord } from "@/types";

export const Route = createFileRoute("/service/")({
  head: () => ({
    meta: [
      { title: "Service — MoveX" },
      {
        name: "description",
        content: tr(
          "Danh mục dịch vụ, cấu hình Default Template và phân công người xử lý.",
          "Service catalog, Default Template settings and handler assignment.",
        ),
      },
      { property: "og:title", content: "Service — MoveX" },
      {
        property: "og:description",
        content: tr(
          "Danh mục dịch vụ, cấu hình Default Template và phân công người xử lý.",
          "Service catalog, Default Template settings and handler assignment.",
        ),
      },
    ],
  }),
  component: ServiceList,
});

const FORM_NAMES = TEMPLATES.map((t) => formName(t));

function ServiceList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const quickFilters = useMemo<QuickFilter[]>(
    () => [
      {
        key: "form",
        allLabel: t("Tất cả Default Template", "All Default Templates"),
        options: FORM_NAMES.map((f) => ({
          label: f,
          conditions: [{ field: "form", operator: "eq", value: f }],
        })),
      },
      {
        key: "status",
        allLabel: t("Tất cả trạng thái", "All statuses"),
        options: ["Active", "Inactive"].map((v) => ({
          label: v,
          conditions: [{ field: "status", operator: "eq", value: v }],
        })),
      },
    ],
    [lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const all = useCollection(serviceRepository);
  const rows = useMemo(() => treeOrder(all.filter((s) => !s.deleted)), [all]);

  const view = (s: ServiceRecord) =>
    void navigate({ to: "/service/$id", params: { id: s.id }, search: { mode: "view" } });

  const columns = useMemo<ListColumn<ServiceRecord>[]>(() => {
    const byId = new Map(rows.map((s) => [s.id, s]));
    return [
      {
        key: "code",
        label: t("Mã dịch vụ", "Service Code"),
        type: "text",
        pinned: true,
        value: (s) => s.code,
        render: (s) => <span className="font-semibold text-primary">{s.code}</span>,
      },
      {
        key: "name",
        label: t("Tên dịch vụ", "Service Name"),
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
        label: t("Dịch vụ cha", "Parent Service"),
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
        label: t("Nhóm dịch vụ", "Service Group"),
        type: "text",
        value: (s) => groupOf(s, rows),
      },
      {
        key: "form",
        label: "Default Template",
        type: "enum",
        options: FORM_NAMES,
        value: (s) => formName(templateOf(s, rows)),
        render: (s) => <Tag tone="tpl">{formName(templateOf(s, rows))}</Tag>,
      },
      {
        key: "status",
        label: t("Trạng thái", "Status"),
        type: "enum",
        options: ["Active", "Inactive", "Draft"],
        value: (s) => s.status,
        render: (s) => <StatusBadge status={s.status} />,
      },
      {
        key: "updatedAt",
        label: t("Cập nhật lúc", "Updated At"),
        type: "date",
        value: (s) => s.updatedAt,
        render: (s) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(s.updatedAt)}</span>
        ),
      },
    ];
  }, [rows, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EntityListPage<ServiceRecord>
      screen="service.v2"
      entityType="Service"
      entityLabel="Service"
      title="Service"
      subtitle={t(
        "Danh mục dịch vụ, cấu hình Default Template và phân công người xử lý",
        "Service catalog, Default Template settings and handler assignment",
      )}
      rows={rows}
      columns={columns}
      searchPlaceholder={t("Tìm mã, tên dịch vụ...", "Search service code, name...")}
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
