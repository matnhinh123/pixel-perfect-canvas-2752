import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/movex/common";
import { AuditTimeline } from "@/components/movex/AuditDrawer";
import { globalAudit } from "@/lib/mock-data";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — MoveX" },
      { name: "description", content: "Change history across routes, services and costs." },
      { property: "og:title", content: "Audit Log — MoveX" },
      { property: "og:description", content: "Change history across routes, services and costs." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Audit Log" subtitle="Lịch sử thay đổi toàn hệ thống" />
      <Panel className="max-w-3xl"><AuditTimeline entries={[...globalAudit].reverse()} /></Panel>
    </div>
  ),
});
