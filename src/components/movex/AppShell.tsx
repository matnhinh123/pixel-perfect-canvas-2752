import { Link, useHydrated, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Code,
  Coins,
  Database,
  FileText,
  History,
  Home,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  RotateCcw,
  Tag,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
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
import { HEADER_CRUMBS_ID } from "./common";
import { useConfirm } from "./general/ConfirmDialog";
import { ExpiringDocumentsList } from "./vehicle/VehicleAlerts";
import { useExpiringDocumentCount } from "./vehicle/useVehicleData";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Sub-pages shown in a drop-down under the item. */
  children?: { to: string; label: string }[];
}

/** Master Data menu (line icons; the active row is orange as in the original MoveX design). */
export const NAV: NavItem[] = [
  { to: "/business-partner", label: "Business Partner", icon: Users },
  { to: "/location", label: "Location", icon: MapPin },
  { to: "/vehicle", label: "Vehicle", icon: Truck },
  { to: "/toll-station", label: "Toll Station", icon: Landmark },
  { to: "/routing", label: "Route Management", icon: Route },
  { to: "/service", label: "Service", icon: Wrench },
  {
    to: "/cost",
    label: "Cost",
    icon: Coins,
    children: [
      { to: "/cost", label: "Fare Code Management" },
      { to: "/fixed-cost", label: "Fixed Cost" },
      { to: "/variable-cost", label: "Variable Cost" },
      { to: "/cogs", label: "COGS" },
    ],
  },
  { to: "/pricing", label: "Pricing", icon: Tag },
  { to: "/vendor-tariff", label: "Vendor Tariff", icon: FileText },
  { to: "/common-code", label: "Common Code", icon: Code },
  { to: "/exchange-rate", label: "Exchange Rate / UoM", icon: ArrowRightLeft },
];

/** Menu row (design: 37px high, radius 10, 13px text). */
const navRow =
  "relative flex h-[37px] w-full items-center gap-2.5 rounded-[10px] pl-3 pr-[9px] text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent";
const navActive = "bg-brand font-semibold text-white shadow-md hover:bg-brand";
/** A collapsed (icon-only) menu row. */
const railRow = "h-10 w-10 justify-center px-0";

/** Menu item with sub-pages: expands in place, or opens a drop-down when the sidebar is collapsed. */
function NavGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const children = item.children ?? [];
  const inside = children.some((c) => path === c.to || path.startsWith(`${c.to}/`));
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  const Icon = item.icon;

  if (collapsed)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={item.label}
            className={cn(navRow, railRow, inside && navActive)}
          >
            <Icon className="h-4 w-4" />
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
        className={cn(navRow, inside && !open && navActive)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 text-sidebar-ring transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-[26px]">
          {children.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              activeOptions={{ exact: false }}
              className={cn(navRow, "h-[34px]")}
              activeProps={{ className: navActive }}
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

/** Bordered 40px icon button of the top bar (design: HeroUI bordered). */
const barButton =
  "relative flex h-10 items-center justify-center rounded-[12px] border-2 border-border-strong text-foreground transition-[opacity,transform] duration-200 hover:opacity-80 active:scale-[0.97]";

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
          className={cn(barButton, "w-10")}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 overflow-hidden p-0">
        {open && <ExpiringDocumentsList onNavigate={() => setOpen(false)} />}
        <div className="border-b px-4 py-3 text-sm font-semibold">
          {t("Hoạt động gần đây", "Recent activity")}
        </div>
        {open && <NotificationList onUnread={() => undefined} />}
        <Link
          to="/audit-log"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-muted"
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
          className={cn(barButton, "gap-2 pl-3 pr-2.5 text-muted-foreground")}
        >
          <Flag className="h-4 w-6" />
          <ChevronDown className="h-3.5 w-3.5" />
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

/** Top-level modules (the level of "Master Data"); only Master Data is part of this demo. */
const MODULES: { key: string; label: string; icon: LucideIcon; to?: string }[] = [
  { key: "master-data", label: "Master Data", icon: Database, to: "/business-partner" },
  { key: "operations", label: "Operations", icon: Truck },
  { key: "finance", label: "Finance", icon: Wallet },
];

/** Sidebar on Home: Home itself + the modules (no module menu until one is picked). */
function ModuleMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useT();
  const row = cn(navRow, collapsed && railRow);
  return (
    <nav
      className={cn(
        "no-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto pb-4",
        collapsed && "items-center",
      )}
    >
      <Link to="/" className={cn(row, navActive)}>
        <Home className="h-4 w-4 shrink-0" />
        {!collapsed && t("Trang chủ", "Home")}
      </Link>
      {MODULES.map((m) => {
        const Icon = m.icon;
        return m.to ? (
          <Link key={m.key} to={m.to} className={row}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && m.label}
          </Link>
        ) : (
          <div
            key={m.key}
            className={cn(row, "cursor-not-allowed opacity-50 hover:bg-transparent")}
            title={t("Ngoài phạm vi demo", "Not in this demo")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                {m.label}
                <span className="ml-auto text-[11px] font-medium">{t("Sắp có", "Soon")}</span>
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const confirm = useConfirm();
  const navigate = useNavigate();
  // Home ("/") sits above the modules: until one is picked the sidebar lists the modules only.
  const atHome = useRouterState({ select: (s) => s.location.pathname }) === "/";
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(readJson<boolean>(COLLAPSE_KEY, false)), []);
  const toggle = () =>
    setCollapsed((c) => {
      writeJson(COLLAPSE_KEY, !c);
      return !c;
    });
  const toggleLabel = collapsed
    ? t("Mở rộng menu", "Expand menu")
    : t("Thu gọn menu", "Collapse menu");

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
          "bg-sidebar-gradient sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-sidebar-border pb-3.5 pt-[18px] text-white transition-[width]",
          collapsed ? "w-[72px] items-center" : "w-[260px] px-3.5",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between pb-5",
            collapsed ? "flex-col gap-2" : "pl-1.5",
          )}
        >
          {/* Original MoveX logo. */}
          <Link
            to="/"
            title={t("Trang chủ", "Home")}
            className="text-[28px] font-extrabold leading-none tracking-tight text-white"
          >
            {collapsed ? "M" : "Move"}
            <span className="text-brand">X</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-sidebar-ring transition-colors hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {atHome ? (
          <ModuleMenu collapsed={collapsed} />
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("Chuyển phân hệ", "Switch module")}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-[12px] border border-sidebar-border bg-[#0455c4] text-left",
                    collapsed ? "h-10 w-10 justify-center" : "h-11 w-full pl-[13px] pr-2.5",
                  )}
                >
                  {!collapsed && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-[#6366f1]" />
                  )}
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#ebf3fe] text-[#0459c9]">
                    <Database className="h-3.5 w-3.5" />
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13px] font-semibold text-white">Master Data</span>
                        <span className="text-[10px] text-sidebar-ring">
                          {t("Danh mục dùng chung", "Shared catalogs")}
                        </span>
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-ring" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={() => void navigate({ to: "/" })}>
                  <Home className="h-4 w-4" />
                  {t("Trang chủ", "Home")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("Phân hệ", "Modules")}</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Database className="h-4 w-4 text-primary" />
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
                <DropdownMenuItem onClick={() => void navigate({ to: "/dashboard" })}>
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void navigate({ to: "/audit-log" })}>
                  <History className="h-4 w-4" />
                  Audit Log
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <nav
              className={cn(
                "no-scrollbar mt-4 flex flex-1 flex-col gap-1 overflow-y-auto pb-4",
                collapsed && "items-center",
              )}
            >
              {NAV.map((n) => {
                if (n.children) return <NavGroup key={n.to} item={n} collapsed={collapsed} />;
                const Icon = n.icon;
                const item = (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-label={collapsed ? n.label : undefined}
                    className={cn(navRow, collapsed && railRow)}
                    activeProps={{ className: navActive }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
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
          </>
        )}

        <div
          className={cn(
            "shrink-0 rounded-[14px] border border-sidebar-border bg-[#0455c4]",
            collapsed ? "p-1" : "w-full p-2.5",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("Tài khoản", "Account")}
                title={t("Tài khoản", "Account")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] p-1 text-left transition-colors hover:bg-sidebar-accent",
                  collapsed && "justify-center",
                )}
              >
                <span className="relative h-[34px] w-[34px] shrink-0">
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#ebf3fe] text-[13px] font-bold text-[#0459c9]">
                    {currentUser.initials}
                  </span>
                  <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#0455c4] bg-[#059669]" />
                </span>
                {!collapsed && (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[13px] font-semibold text-white">
                        {currentUser.name}
                      </span>
                      <span className="truncate text-[11px] text-sidebar-ring">
                        {currentUser.email}
                      </span>
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-white" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuItem onClick={() => void resetDemo()}>
                <RotateCcw className="h-4 w-4" />
                {t("Reset dữ liệu demo", "Reset demo data")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive focus:text-white"
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
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-x-7 gap-y-3 border-b bg-card px-6 py-3">
          <div id={HEADER_CRUMBS_ID} className="min-w-0 flex-1" />
          <div className="ml-auto flex items-center gap-3">
            <LanguageMenu />
            <Notifications />
          </div>
        </header>
        <div className="min-w-0 flex-1 px-6 pb-8 pt-6">{children}</div>
      </main>
    </div>
  );
}
