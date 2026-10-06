import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Lock } from "lucide-react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import {
  levelOf,
  serviceCrud,
  serviceImportConfig,
  templateOf,
} from "@/services/serviceCatalogService";
import { formatDateTime } from "@/lib/format";
import { TEMPLATES, type ServiceRecord } from "@/types";

export const Route = createFileRoute("/service/")({
  head: () => ({
    meta: [
      { title: "Service — MoveX" },
      {
        name: "description",
        content: "Service catalog with trucking, customs and freight templates.",
      },
      { property: "og:title", content: "Service — MoveX" },
      {
        property: "og:description",
        content: "Service catalog with trucking, customs and freight templates.",
      },
    ],
  }),
  component: ServiceList,
});

const quickFilters: QuickFilter[] = [
  {
    key: "template",
    allLabel: "Tất cả template",
    options: TEMPLATES.map((t) => ({
      label: t,
      conditions: [{ field: "template", operator: "eq", value: t }],
    })),
  },
  {
    key: "level",
    allLabel: "Tất cả cấp",
    options: [
      {
        label: "Cấp 1 (Nhóm dịch vụ)",
        conditions: [{ field: "level", operator: "eq", value: "1" }],
      },
      {
        label: "Dịch vụ con",
        conditions: [{ field: "level", operator: "between", value: "2", value2: "" }],
      },
    ],
  },
  {
    key: "status",
    allLabel: "Tất cả trạng thái",
    options: ["Active", "Draft", "Inactive"].map((v) => ({
      label: v,
      conditions: [{ field: "status", operator: "eq", value: v }],
    })),
  },
];

function ServiceList() {
  const navigate = useNavigate();
  const all = useCollection(serviceRepository);
  const rows = useMemo(() => {
    const byId = new Map(all.map((s) => [s.id, s]));
    const path = (s: ServiceRecord): string =>
      s.parentId && byId.get(s.parentId) ? `${path(byId.get(s.parentId)!)}/${s.code}` : s.code;
    return all.filter((s) => !s.deleted).sort((a, b) => path(a).localeCompare(path(b)));
  }, [all]);

  const columns = useMemo<ListColumn<ServiceRecord>[]>(() => {
    const byId = new Map(all.map((s) => [s.id, s]));
    const childCount = (id: string) => rows.filter((s) => s.parentId === id).length;
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
          <span className="font-medium" style={{ paddingLeft: (levelOf(s, all) - 1) * 14 }}>
            {levelOf(s, all) > 1 && <span className="mr-1 text-muted-foreground">└</span>}
            {s.name}
          </span>
        ),
      },
      { key: "level", label: "Cấp", type: "number", value: (s) => levelOf(s, all) },
      {
        key: "parent",
        label: "Dịch vụ cha",
        type: "text",
        value: (s) => (s.parentId ? (byId.get(s.parentId)?.code ?? "") : ""),
        render: (s) =>
          s.parentId ? (
            byId.get(s.parentId)?.code
          ) : (
            <span className="text-muted-foreground">— (root)</span>
          ),
      },
      {
        key: "template",
        label: "Template",
        type: "enum",
        options: TEMPLATES,
        value: (s) => templateOf(s, all),
        render: (s) => (
          <span className="inline-flex items-center gap-1">
            <Tag tone="tpl">{templateOf(s, all)}</Tag>
            {s.parentId && (
              <span
                title="Kế thừa từ dịch vụ cấp 1"
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
              >
                <Lock className="h-3 w-3" />
                kế thừa
              </span>
            )}
          </span>
        ),
      },
      { key: "children", label: "Số dịch vụ con", type: "number", value: (s) => childCount(s.id) },
      {
        key: "status",
        label: "Trạng thái",
        type: "enum",
        options: ["Active", "Draft", "Inactive"],
        value: (s) => s.status,
        render: (s) => <StatusBadge status={s.status} />,
      },
      {
        key: "updatedAt",
        label: "Cập nhật lúc",
        type: "date",
        value: (s) => s.updatedAt,
        defaultHidden: true,
        render: (s) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(s.updatedAt)}</span>
        ),
      },
    ];
  }, [all, rows]);

  return (
    <EntityListPage<ServiceRecord>
      screen="service"
      entityType="Service"
      entityLabel="Service"
      title="Service"
      subtitle="Danh mục dịch vụ & cấu hình template (Trucking / Customs / Freight)"
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm service code, tên..."
      searchValues={(s) => [s.code, s.name]}
      quickFilters={quickFilters}
      crud={serviceCrud}
      addLabel="Thêm mới Service"
      onAdd={() => void navigate({ to: "/service/$id", params: { id: "new" } })}
      onView={(s) =>
        void navigate({ to: "/service/$id", params: { id: s.id }, search: { mode: "view" } })
      }
      onEdit={(s) =>
        void navigate({ to: "/service/$id", params: { id: s.id }, search: { mode: "edit" } })
      }
      importConfig={serviceImportConfig}
    />
  );
}
