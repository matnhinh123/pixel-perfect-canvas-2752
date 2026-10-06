import { createFileRoute, Link } from "@tanstack/react-router";
import { Route as RouteIcon, Boxes, Wallet, Coins } from "lucide-react";
import { PageHeader, Panel, StatCard, Tag } from "@/components/movex/common";
import { AuditTimeline } from "@/components/movex/AuditDrawer";
import { routeService, serviceService, routeTollCost, formatVnd } from "@/lib/api";
import { globalAudit } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MoveX" },
      { name: "description", content: "MoveX logistics overview: routes, services and costs." },
      { property: "og:title", content: "Dashboard — MoveX" },
      { property: "og:description", content: "MoveX logistics overview: routes, services and costs." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const routes = routeService.list();
  const services = serviceService.list();
  const tollSum = routes.reduce((s, r) => s + routeTollCost(r), 0);
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Tổng quan vận hành MoveX" />
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Routes" value={String(routes.filter((r) => r.status === "Active").length)} hint={`${routes.length} tổng`} icon={<RouteIcon className="h-4 w-4" />} />
        <StatCard label="Services" value={String(services.length)} hint="3 templates" icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Toll Cost / tháng (ước tính)" value={formatVnd(tollSum * 22)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Avg. Margin" value="17.3%" hint="Pricing input" icon={<Coins className="h-4 w-4" />} />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Panel title="Routes gần đây" className="col-span-2" actions={<Link to="/routing" className="text-sm font-medium text-primary">Xem tất cả</Link>}>
          <div className="divide-y">
            {routes.slice(0, 5).map((r) => (
              <Link key={r.id} to="/routing/$id" params={{ id: r.id }} className="flex items-center justify-between py-3 hover:text-primary">
                <div>
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.code} · {r.distanceKm} km</div>
                </div>
                <div className="flex items-center gap-3"><Tag>{r.type}</Tag><Tag>{r.status}</Tag></div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Hoạt động mới"><AuditTimeline entries={globalAudit.slice(0, 4).reverse()} /></Panel>
      </div>
    </div>
  );
}
