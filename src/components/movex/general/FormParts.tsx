import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** 12-column form grid: S3 = a quarter of the row (short fields), S6 = half, S12 = full row. */
export const S3 = "sm:col-span-3 lg:col-span-3";
/** Short fields (dates, years, numbers with a unit, switches) — a sixth of the row. */
export const S2 = "sm:col-span-3 lg:col-span-2";
/** A third of the row (three fields per line). */
export const S4 = "sm:col-span-6 lg:col-span-4";
export const S6 = "sm:col-span-6 lg:col-span-6";
export const S12 = "sm:col-span-6 lg:col-span-12";

/** A titled block of fields laid out on the 12-column grid. */
export function FormGroup({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-3 text-sm font-semibold text-card-title">
        <span>
          {title}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        <span className="h-px flex-1 bg-border" />
      </h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-12">
        {children}
      </div>
    </section>
  );
}

/** Everything inside is natively disabled in view mode and restyled to read like plain text. */
export function ReadOnlyScope({
  readOnly,
  className,
  children,
}: {
  readOnly: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={readOnly}
      className={cn(
        "group min-w-0",
        "[&_input:disabled]:bg-muted/40 [&_input:disabled]:text-foreground [&_input:disabled]:opacity-100 [&_input:disabled]:placeholder:text-transparent",
        "[&_textarea:disabled]:bg-muted/40 [&_textarea:disabled]:text-foreground [&_textarea:disabled]:opacity-100 [&_textarea:disabled]:placeholder:text-transparent",
        "[&_select:disabled]:appearance-none [&_select:disabled]:bg-muted/40 [&_select:disabled]:text-foreground [&_select:disabled]:opacity-100",
        className,
      )}
    >
      {children}
    </fieldset>
  );
}

/** Panel whose body can be folded away from the header (chevron, like the design). */
export function CollapsiblePanel({
  title,
  defaultOpen = true,
  forceOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Unfolds the panel when it turns true (e.g. a validation error is inside it). */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-b bg-card-header px-4 py-2.5 text-left"
      >
        <h2 className="text-[17px] font-semibold text-card-title">{title}</h2>
        <ChevronUp
          className={cn("h-5 w-5 text-card-title transition-transform", !open && "rotate-180")}
        />
      </button>
      {/* Hidden (not unmounted) so field state and validation survive folding. */}
      <div className={cn("space-y-6 p-4", !open && "hidden")}>{children}</div>
    </section>
  );
}
