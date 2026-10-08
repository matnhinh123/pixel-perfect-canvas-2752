import { Link, useHydrated, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  EllipsisVertical,
  History,
  Home,
  LogOut,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { auditRepository, resetAllStorage } from "@/repositories";
import { readJson, writeJson } from "@/repositories/storage";
import { AUDIT_ACTION_LABEL } from "@/services/auditService";
import { currentUser } from "@/services/session";
import { useCollection } from "@/hooks/use-store";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setLang, useT } from "@/lib/i18n";
import { useConfirm } from "./general/ConfirmDialog";
import { ExpiringDocumentsList } from "./vehicle/VehicleAlerts";
import { useExpiringDocumentCount } from "./vehicle/useVehicleData";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Sub-pages shown in a drop-down under the item. */
  children?: { to: string; label: string }[];
}

/** Master Data menu (design: colourful emoji-style icons, orange active item). */
export const NAV: NavItem[] = [
  { to: "/business-partner", label: "Business Partner", icon: "💼" },
  { to: "/location", label: "Location", icon: "📍" },
  { to: "/vehicle", label: "Vehicle", icon: "🚚" },
  { to: "/toll-station", label: "Toll Station", icon: "🏛️" },
  { to: "/routing", label: "Route Management", icon: "🗺️" },
  { to: "/service", label: "Service", icon: "🧩" },
  {
    to: "/cost",
    label: "Cost",
    icon: "💰",
    children: [
      { to: "/cost", label: "Cost" },
      { to: "/cost-group", label: "Cost Group" },
    ],
  },
  { to: "/pricing", label: "Pricing", icon: "🏷️" },
  { to: "/vendor-tariff", label: "Vendor Tariff", icon: "📜" },
  { to: "/common-code", label: "Common Code", icon: "📋" },
  { to: "/exchange-rate", label: "Exchange Rate / UoM", icon: "💲" },
];

const navLinkClass =
  "flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-semibold text-white/95 transition-colors hover:bg-white/10";

/** Menu item with sub-pages: expands in place, or opens a drop-down when the sidebar is collapsed. */
function NavGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const children = item.children ?? [];
  const inside = children.some((c) => path === c.to || path.startsWith(`${c.to}/`));
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const icon = <span className="w-6 text-center text-lg leading-none">{item.icon}</span>;

  if (collapsed)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={item.label}
            className={cn(
              navLinkClass,
              "justify-center px-0",
              inside && "bg-brand text-white shadow-md",
            )}
          >
            {icon}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
          {children.map((c) => (
            <DropdownMenuItem key={c.to} asChild>
              <Link to={c.to}>{c.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(navLinkClass, "w-full", inside && !open && "bg-brand text-white shadow-md")}
      >
        {icon}
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 pl-9">
          {children.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              activeOptions={{ exact: false }}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10"
              activeProps={{ className: "bg-brand! text-white shadow-md" }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const COLLAPSE_KEY = "ui:sidebar-collapsed";
const SEEN_KEY = "ui:notifications-seen-at";

/** Client-only: reads the audit log from localStorage. */
function NotificationList({ onUnread }: { onUnread: (n: number) => void }) {
  const audit = useCollection(auditRepository);
  const seenAt = readJson<string>(SEEN_KEY, "2026-10-01T00:00:00.000Z");
  const recent = [...audit]
    .filter((e) => e.action !== "VIEW")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);
  const unread = audit.filter((e) => e.action !== "VIEW" && e.timestamp > seenAt).length;
  useEffect(() => onUnread(unread), [unread, onUnread]);
  return (
    <div className="max-h-96 overflow-y-auto">
      {recent.map((e) => (
        <div key={e.id} className="border-b px-4 py-2.5 text-sm last:border-0">
          <div className="flex justify-between gap-2">
            <span className="font-medium">{AUDIT_ACTION_LABEL[e.action]}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(e.timestamp)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {e.user} · {e.entityType} {e.entityLabel}
            {e.field ? ` · ${e.field}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnreadCounter({ onUnread }: { onUnread: (n: number) => void }) {
  const audit = useCollection(auditRepository);
  const seenAt = readJson<string>(SEEN_KEY, "2026-10-01T00:00:00.000Z");
  const unread = audit.filter((e) => e.action !== "VIEW" && e.timestamp > seenAt).length;
  // Expiring vehicle documents stay counted until they are renewed (not cleared by "seen").
  const expiring = useExpiringDocumentCount();
  useEffect(() => onUnread(unread + expiring), [unread, expiring, onUnread]);
  return null;
}

function Notifications() {
  const { t } = useT();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          writeJson(SEEN_KEY, new Date().toISOString());
          setUnread(0);
        }
      }}
    >
      {hydrated && !open && <UnreadCounter onUnread={setUnread} />}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("Thông báo", "Notifications")}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-amber-500 shadow-sm hover:bg-white"
        >
          <Bell className="h-4 w-4 fill-amber-400" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-96 p-0">
        {open && <ExpiringDocumentsList onNavigate={() => setOpen(false)} />}
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {t("Hoạt động gần đây", "Recent activity")}
        </div>
        {open && <NotificationList onUnread={() => undefined} />}
        <Link
          to="/audit-log"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-sm font-medium text-primary hover:bg-accent"
        >
          <History className="h-4 w-4" />
          {t("Xem toàn bộ Audit Log", "View full Audit Log")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

const VnFlag = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 30 20" className={className} aria-hidden>
    <rect width="30" height="20" rx="2" fill="#da251d" />
    <polygon
      fill="#ffff00"
      points="15,4 16.2,8.3 20.7,8.3 17.1,10.9 18.4,15.2 15,12.6 11.6,15.2 12.9,10.9 9.3,8.3 13.8,8.3"
    />
  </svg>
);

const UkFlag = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 60 30" className={className} aria-hidden>
    <clipPath id="uk-flag">
      <rect width="60" height="30" rx="4" />
    </clipPath>
    <g clipPath="url(#uk-flag)">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="3" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </g>
  </svg>
);

/** VI / EN switch (flag of the current language). */
function LanguageMenu() {
  const { t, lang } = useT();
  const Flag = lang === "en" ? UkFlag : VnFlag;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Ngôn ngữ", "Language")}
          title={t("Ngôn ngữ", "Language")}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 shadow-sm hover:bg-white"
        >
          <Flag className="h-4 w-6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("Ngôn ngữ", "Language")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setLang("vi")}>
          <VnFlag className="h-3 w-4.5" />
          Tiếng Việt
          {lang === "vi" && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("en")}>
          <UkFlag className="h-3 w-4.5" />
          English
          {lang === "en" && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(readJson<boolean>(COLLAPSE_KEY, false)), []);
  const toggle = () =>
    setCollapsed((c) => {
      writeJson(COLLAPSE_KEY, !c);
      return !c;
    });

  const resetDemo = async () => {
    const r = await confirm({
      title: t("Reset dữ liệu demo?", "Reset demo data?"),
      description: t(
        "Toàn bộ route, service, cost, audit, lịch sử import và cấu hình cột lưu trên trình duyệt này sẽ được thay bằng dữ liệu mẫu ban đầu.",
        "All routes, services, costs, audit, import history and column settings saved in this browser will be replaced by the original demo data.",
      ),
      confirmLabel: "Reset",
      cancelLabel: t("Huỷ", "Cancel"),
      tone: "danger",
    });
    if (r === "confirm") {
      resetAllStorage();
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "bg-sidebar-gradient sticky top-0 flex h-screen shrink-0 flex-col text-white transition-[width]",
          collapsed ? "w-[76px]" : "w-[300px]",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 pb-4 pt-5", collapsed && "flex-col")}>
          <Link
            to="/"
            className="text-[28px] font-extrabold leading-none tracking-tight text-white"
            title="Dashboard"
          >
            {collapsed ? (
              <>
                M<span className="text-brand">X</span>
              </>
            ) : (
              <>
                Move<span className="text-brand">X</span>
              </>
            )}
          </Link>
          <div
            className={cn(
              "flex items-center gap-2",
              !collapsed && "ml-auto",
              collapsed && "flex-col",
            )}
          >
            <LanguageMenu />
            <Notifications />
            <button
              type="button"
              onClick={toggle}
              aria-label={
                collapsed ? t("Mở rộng menu", "Expand menu") : t("Thu gọn menu", "Collapse menu")
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-primary shadow-sm hover:bg-white"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left text-[15px] font-bold text-brand shadow-sm",
                  collapsed && "justify-center px-0",
                )}
              >
                <Home className="h-5 w-5" />
                {!collapsed && (
                  <>
                    <span>Master Data</span>
                    <EllipsisVertical className="ml-auto h-4 w-4 text-muted-foreground" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t("Phân hệ", "Modules")}</DropdownMenuLabel>
              <DropdownMenuItem>
                <Home className="h-4 w-4 text-brand" />
                Master Data
                <Check className="ml-auto h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Operations {t("(ngoài phạm vi demo)", "(not in this demo)")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Finance {t("(ngoài phạm vi demo)", "(not in this demo)")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: "/" })}>
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void navigate({ to: "/audit-log" })}>
                Audit Log
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
          {NAV.map((n) => {
            if (n.children) return <NavGroup key={n.to} item={n} collapsed={collapsed} />;
            const item = (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] font-semibold text-white/95 transition-colors hover:bg-white/10",
                  collapsed && "justify-center px-0",
                )}
                activeProps={{ className: "bg-brand! text-white shadow-md" }}
              >
                <span className="w-6 text-center text-lg leading-none">{n.icon}</span>
                {!collapsed && n.label}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={n.to}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">{n.label}</TooltipContent>
              </Tooltip>
            ) : (
              item
            );
          })}
        </nav>

        <div
          className={cn(
            "flex items-center gap-3 border-t border-white/15 px-4 py-4",
            collapsed && "flex-col",
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-primary">
            {currentUser.initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-semibold">{currentUser.name}</div>
              <div className="truncate text-xs text-white/75">{currentUser.email}</div>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("Tài khoản", "Account")}
                className="rounded-md p-1.5 text-white/90 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onClick={() => void resetDemo()}>
                <RotateCcw className="h-4 w-4" />
                {t("Reset dữ liệu demo", "Reset demo data")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast.info(
                    t(
                      "Bản demo không có đăng nhập — bạn đang dùng tài khoản mẫu Thuy Vu.",
                      "This demo has no sign-in — you are using the sample account Thuy Vu.",
                    ),
                  )
                }
              >
                <LogOut className="h-4 w-4" />
                {t("Đăng xuất", "Sign out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-7 py-5">{children}</main>
    </div>
  );
}
