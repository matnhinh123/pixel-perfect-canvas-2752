import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const tones: Record<string, string> = {
  Active: "bg-success-soft text-success",
  Draft: "bg-info-soft text-primary",
  Inactive: "bg-muted text-muted-foreground",
  Auto: "bg-info-soft text-info",
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
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[key] ?? "bg-secondary text-secondary-foreground",
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

/**
 * Page header from the MoveX design:
 *   🏠 / Danh mục / Routing / Tạo mới
 *   [←] Title  [badge]                      [actions]
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
  const trail: Crumb[] = [{ label: rootLabel ?? t("Danh mục", "Master Data") }, ...(crumbs ?? [])];
  return (
    <div className="mb-5">
      <nav
        aria-label="Breadcrumb"
        className="mb-3 flex items-center gap-1.5 text-[15px] text-muted-foreground"
      >
        <Link to="/" aria-label={t("Trang chủ", "Home")} className="hover:text-primary">
          <Home className="h-4 w-4" />
        </Link>
        {trail.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-muted-foreground/70">/</span>
            {c.to ? (
              <Link to={c.to} className="hover:text-primary">
                {c.label}
              </Link>
            ) : (
              <span
                className={i === trail.length - 1 ? "font-semibold text-foreground" : undefined}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("Quay lại", "Back")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground shadow-sm hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-[28px] font-bold leading-tight tracking-tight">
              {title}
              {badge}
            </h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Card with the tinted blue header bar used throughout the design. */
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
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card-header px-4 py-2.5">
          <h2 className="text-[17px] font-semibold text-card-title">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
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
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold text-foreground">
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
        "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive",
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
    <div className="rounded-xl border bg-card p-4 shadow-sm">
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

export const thClass =
  "bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
