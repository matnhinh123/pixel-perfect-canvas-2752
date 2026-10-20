import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const tones: Record<string, string> = {
  Active: "bg-success-soft text-success",
  Draft: "bg-info-soft text-primary",
  Inactive: "bg-muted text-ink-2",
  Archived: "bg-warning-soft text-warning",
  Auto: "bg-info-soft text-info",
  "UN/LOCODE": "bg-info-soft text-info",
  "IATA Code": "bg-success-soft text-success",
  Manual: "bg-warning-soft text-warning",
  "Single Trip": "bg-info-soft text-info",
  "Round Trip": "bg-success-soft text-success",
  Vietmap: "bg-info-soft text-info",
  Mock: "bg-info-soft text-info",
  Superseded: "bg-muted text-muted-foreground",
  Success: "bg-success-soft text-success",
  "Partial Success": "bg-warning-soft text-warning",
  Failed: "bg-danger-soft text-destructive",
  "Rolled Back": "bg-muted text-muted-foreground",
  Outbound: "bg-info-soft text-info",
  Return: "bg-success-soft text-success",
};

export function Tag({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = tone ?? String(children);
  return (
    <span
      className={cn(
        // HeroUI chip (flat, sm).
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-xs font-normal leading-none",
        tones[key] ?? "bg-muted text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

/** EntityStatusBadge — the one status pill used by every entity. */
export function StatusBadge({ status }: { status: string }) {
  return <Tag>{status}</Tag>;
}

export interface Crumb {
  label: string;
  to?: string;
}

/** Id of the breadcrumb slot in the AppShell top bar (the design shows the trail there). */
export const HEADER_CRUMBS_ID = "app-header-crumbs";

/** Renders into the top-bar slot when the shell has one, else in place. */
function CrumbSlot({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(HEADER_CRUMBS_ID)), []);
  return slot ? createPortal(children, slot) : <div className="mb-3">{children}</div>;
}

/**
 * Page header from the MoveX design:
 *   top bar:  Master Data / Routing / Tạo mới
 *   page:     [←] Title  [badge]                      [actions]
 */
export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
  onBack,
  badge,
  rootLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  onBack?: (() => void) | undefined;
  badge?: ReactNode;
  /** First breadcrumb; defaults to "Danh mục" / "Master Data" by app language. */
  rootLabel?: string;
}) {
  const { t } = useT();
  const trail: Crumb[] = [
    { label: rootLabel ?? t("Danh mục", "Master Data"), to: "/" },
    ...(crumbs ?? []),
  ];
  return (
    <div className="mb-4">
      <CrumbSlot>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[13px]"
        >
          {trail.map((c, i) => {
            const last = i === trail.length - 1;
            return (
              <span key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span className="text-ink-4">/</span>}
                {c.to && !last ? (
                  <Link
                    to={c.to}
                    className="truncate font-medium text-muted-foreground hover:text-accent-foreground"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "truncate",
                      last ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                    )}
                  >
                    {c.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      </CrumbSlot>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("Quay lại", "Back")}
              title={t("Quay lại", "Back")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border-2 border-border-strong bg-transparent text-foreground transition-[opacity,transform] duration-200 hover:opacity-80 active:scale-[0.97]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-bold leading-tight tracking-[-0.3px] text-foreground">
              {title}
              {badge}
            </h1>
            {/* Only record pages (with ←) keep a subtitle — the record code; list pages show the title alone. */}
            {subtitle && onBack && (
              <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** HeroUI card: radius 14, soft shadow; header row with a 16px title over a divider. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[14px] bg-card shadow-hu-sm", className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  className,
  required,
  error,
  hint,
  info,
}: {
  label: string;
  /** Help text shown in a tooltip behind an (i) icon next to the label. */
  info?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  required?: boolean;
  error?: string | undefined;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-normal text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="ml-1.5 inline h-3.5 w-3.5 cursor-help align-[-2px] text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{info}</TooltipContent>
          </Tooltip>
        )}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
  className,
  labels,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  className?: string;
  labels?: Record<string, string>;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "select-chevron h-10 cursor-pointer rounded-[12px] border-2 border-input bg-transparent pl-3 text-sm text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] outline-none transition-colors hover:border-border-strong focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] bg-card p-4 shadow-hu-sm">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon && <span className="text-primary">{icon}</span>}
      </div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action}
    </div>
  );
}

/** Table header cell (HeroUI): grey band, 12px semibold, rounded at the row ends. */
export const thClass = "bg-muted text-xs font-semibold text-muted-foreground";
