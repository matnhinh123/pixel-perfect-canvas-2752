import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Route as RouteIcon, Boxes, Wallet, Coins } from "lucide-react";
import { PageHeader, Panel, StatCard, Tag } from "@/components/movex/common";
import { AuditTimeline } from "@/components/movex/AuditDrawer";
import { useCollection } from "@/hooks/use-store";
import {
  auditRepository,
  costRepository,
  routeRepository,
  serviceRepository,
} from "@/repositories";
import { routeTotals } from "@/services/cost/costMath";
import { displayVersion } from "@/services/costService";
import { formatVnd } from "@/lib/format";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MoveX" },
      { name: "description", content: "MoveX logistics overview: routes, services and costs." },
      { property: "og:title", content: "Dashboard — MoveX" },
      {
        property: "og:description",
        content: "MoveX logistics overview: routes, services and costs.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useT();
  const routes = useCollection(routeRepository).filter((r) => !r.deleted);
  const services = useCollection(serviceRepository).filter((s) => !s.deleted);
  const costs = useCollection(costRepository).filter((c) => !c.deleted);
  const audit = useCollection(auditRepository);
  const recent = useMemo(
    () =>
      [...audit]
        .filter((e) => e.action !== "VIEW")
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 5),
    [audit],
  );
  const tollSum = routes
    .filter((r) => r.status === "Active")
    .reduce((s, r) => s + routeTotals(r).totalRouteCost, 0);
  const activeCosts = costs.filter((c) => c.status === "Active");
  const avgCost = activeCosts.length
    ? activeCosts.reduce((s, c) => s + displayVersion(c).totalEstimated, 0) / activeCosts.length
    : 0;
  const recentRoutes = [...routes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={t("Tổng quan vận hành MoveX", "MoveX operations overview")}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Routes"
          value={String(routes.filter((r) => r.status === "Active").length)}
          hint={t(`${routes.length} tổng`, `${routes.length} total`)}
          icon={<RouteIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Services"
          value={String(services.length)}
          hint="3 templates"
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          label={t("Toll Cost / tháng (ước tính)", "Toll Cost / month (estimated)")}
          value={formatVnd(tollSum * 22)}
          hint={t("Active routes × 22 chuyến", "Active routes × 22 trips")}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Avg. Trip Cost"
          value={formatVnd(avgCost)}
          hint={`${activeCosts.length} active cost records`}
          icon={<Coins className="h-4 w-4" />}
        />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title={t("Routes gần đây", "Recent routes")}
          className="xl:col-span-2"
          actions={
            <Link to="/routing" className="text-sm font-medium text-primary">
              {t("Xem tất cả", "View all")}
            </Link>
          }
        >
          <div className="divide-y">
            {recentRoutes.map((r) => (
              <Link
                key={r.id}
                to="/routing/$id"
                params={{ id: r.id }}
                search={{ mode: "view" }}
                className="flex items-center justify-between py-3 hover:text-primary"
              >
                <div>
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.code} ·{" "}
                    {r.outbound
                      ? `${routeTotals(r).distanceKm} km`
                      : t("chưa tính tuyến", "route not calculated")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Tag>{r.type}</Tag>
                  <Tag>{r.status}</Tag>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel
          title={t("Hoạt động mới", "Recent activity")}
          actions={
            <Link to="/audit-log" className="text-sm font-medium text-primary">
              Audit Log
            </Link>
          }
        >
          <AuditTimeline entries={recent} showEntity />
        </Panel>
      </div>
    </div>
  );
}
