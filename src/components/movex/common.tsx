import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  Active: "bg-success-soft text-success",
  Draft: "bg-warning-soft text-warning",
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

export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {crumbs && (
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {c.to ? (
                <Link to={c.to} className="hover:text-primary">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      {title && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
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
}: {
  label: string;
  children: ReactNode;
  className?: string | undefined;
  required?: boolean;
  error?: string | undefined;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
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
