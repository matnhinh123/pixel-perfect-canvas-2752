import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, PageHeader, Panel } from "@/components/movex/common";
import { AuditTimeline } from "@/components/movex/AuditDrawer";
import { useCollection } from "@/hooks/use-store";
import { auditRepository } from "@/repositories";
import { applySearch } from "@/services/filterService";
import { AUDIT_ACTION_LABEL } from "@/services/auditService";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — MoveX" },
      { name: "description", content: "Change history across routes, services and costs." },
      { property: "og:title", content: "Audit Log — MoveX" },
      { property: "og:description", content: "Change history across routes, services and costs." },
    ],
  }),
  component: AuditLogPage,
});

function AuditLogPage() {
  const all = useCollection(auditRepository);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [showViews, setShowViews] = useState(false);
  const rows = useMemo(() => {
    const base = all.filter(
      (e) =>
        (!entity || e.entityType === entity) &&
        (!action || e.action === action) &&
        (showViews || action === "VIEW" || e.action !== "VIEW"),
    );
    return applySearch(base, q, (e) => [
      e.entityLabel,
      e.user,
      e.field,
      e.oldValue,
      e.newValue,
      e.note,
    ])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 300);
  }, [all, q, entity, action, showViews]);
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Lịch sử thay đổi toàn hệ thống (append-only)" />
      <Panel className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm entity, user, giá trị..."
              className="pl-9"
            />
          </div>
          <NativeSelect
            value={entity}
            onChange={setEntity}
            options={["", "Route", "Service", "Cost"]}
            labels={{ "": "Tất cả đối tượng" }}
          />
          <NativeSelect
            value={action}
            onChange={setAction}
            options={["", ...Object.keys(AUDIT_ACTION_LABEL)]}
            labels={{ "": "Tất cả hành động" }}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showViews}
              onChange={(e) => setShowViews(e.target.checked)}
            />
            Hiện sự kiện VIEW
          </label>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            {rows.length} sự kiện · chỉ đọc
          </span>
        </div>
        <AuditTimeline entries={rows} showEntity />
      </Panel>
    </div>
  );
}
