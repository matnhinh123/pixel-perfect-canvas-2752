import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Route as RouteIcon,
  Boxes,
  Wallet,
  Tags,
  History,
  Truck,
  Bell,
  Search,
  RotateCcw,
} from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  costRepository,
  resetAllStorage,
  routeRepository,
  serviceRepository,
} from "@/repositories";
import { applySearch } from "@/services/filterService";
import { currentUser } from "@/services/session";
import { useConfirm } from "./general/ConfirmDialog";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/routing", label: "Routing", icon: RouteIcon },
  { to: "/service", label: "Service", icon: Boxes },
  { to: "/cost", label: "Cost", icon: Wallet },
  { to: "/pricing", label: "Pricing", icon: Tags },
  { to: "/audit-log", label: "Audit Log", icon: History },
] as const;

type Hit = { kind: "Route" | "Service" | "Cost"; id: string; code: string; name: string };

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits: Hit[] =
    q.trim().length < 2
      ? []
      : [
          ...applySearch(
            routeRepository.all().filter((r) => !r.deleted),
            q,
            (r) => [r.code, r.name, r.origin.name, r.destination.name],
          ).map((r) => ({ kind: "Route" as const, id: r.id, code: r.code, name: r.name })),
          ...applySearch(
            serviceRepository.all().filter((s) => !s.deleted),
            q,
            (s) => [s.code, s.name],
          ).map((s) => ({ kind: "Service" as const, id: s.id, code: s.code, name: s.name })),
          ...applySearch(
            costRepository.all().filter((c) => !c.deleted),
            q,
            (c) => [c.code, c.name],
          ).map((c) => ({ kind: "Cost" as const, id: c.id, code: c.code, name: c.name })),
        ].slice(0, 8);
  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    if (h.kind === "Route") void navigate({ to: "/routing/$id", params: { id: h.id } });
    else if (h.kind === "Service") void navigate({ to: "/service/$id", params: { id: h.id } });
    else void navigate({ to: "/cost/$id", params: { id: h.id } });
  };
  return (
    <Popover open={open && q.trim().length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex w-80 items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) go(hits[0]);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Tìm kiếm nhanh..."
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {hits.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No results</div>
        ) : (
          hits.map((h) => (
            <button
              key={`${h.kind}-${h.id}`}
              type="button"
              onClick={() => go(h)}
              className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="font-semibold text-primary">{h.code}</span>
                <span className="block truncate text-xs text-muted-foreground">{h.name}</span>
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {h.kind}
              </span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const confirm = useConfirm();
  const resetDemo = async () => {
    const r = await confirm({
      title: "Reset demo data?",
      description:
        "All routes, services, costs, audit history, import history and column preferences stored in this browser will be replaced by the original seed data.",
      confirmLabel: "Reset",
      tone: "danger",
    });
    if (r === "confirm") {
      resetAllStorage();
      window.location.reload();
    }
  };
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
              activeProps={{
                className:
                  "bg-sidebar-primary !text-sidebar-primary-foreground hover:!bg-sidebar-primary",
              }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-5 py-4 text-xs opacity-80">
          Tenant: <span className="font-semibold">MoveX Việt Nam</span>
          <button
            type="button"
            onClick={() => void resetDemo()}
            className="mt-2 flex items-center gap-1 opacity-80 hover:underline hover:opacity-100"
          >
            <RotateCcw className="h-3 w-3" /> Reset demo data
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-card px-6">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-4">
            <Link to="/audit-log" aria-label="Recent activity" title="Recent activity">
              <Bell className="h-5 w-5 text-muted-foreground hover:text-primary" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                {currentUser.initials}
              </div>
              <div className="text-sm leading-tight">
                <div className="font-semibold">{currentUser.name}</div>
                <div className="text-xs text-muted-foreground">{currentUser.role}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
