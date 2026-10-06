import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutDashboard, Route as RouteIcon, Boxes, Wallet, Tags, History, Truck, Bell, Search } from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/routing", label: "Routing", icon: RouteIcon },
  { to: "/service", label: "Service", icon: Boxes },
  { to: "/cost", label: "Cost", icon: Wallet },
  { to: "/pricing", label: "Pricing", icon: Tags },
  { to: "/audit-log", label: "Audit Log", icon: History },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold leading-none text-sidebar-primary">MoveX</div>
            <div className="text-xs opacity-75">Logistics Platform</div>
          </div>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-primary !text-sidebar-primary-foreground hover:!bg-sidebar-primary" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-5 py-4 text-xs opacity-80">
          Tenant: <span className="font-semibold">MoveX Việt Nam</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-card px-6">
          <div className="flex w-80 items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            <Search className="h-4 w-4" /> Tìm kiếm nhanh...
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">MA</div>
              <div className="text-sm leading-tight">
                <div className="font-semibold">Nguyễn Minh Anh</div>
                <div className="text-xs text-muted-foreground">Ops Manager</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
