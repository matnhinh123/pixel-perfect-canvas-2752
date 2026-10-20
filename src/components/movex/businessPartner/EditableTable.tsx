import { useState, type ReactNode } from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { ChevronDown, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, joinList, splitList } from "@/lib/utils";
import { withCurrent } from "@/services/commonCodeService";
import { useT } from "@/lib/i18n";

export interface ColDef<T> {
  key: keyof T & string;
  label: string;
  required?: boolean;
  /** Minimum column width in px. */
  width: number;
  /** "file": pick a file from the computer; the cell keeps its file name. */
  /** "readonly": shown, never edited (filled by `derive`). */
  /** "multiselect": several options, stored as "A, B"; hovering the cell previews them all. */
  kind:
    | "text"
    | "number"
    | "date"
    | "datetime"
    | "select"
    | "multiselect"
    | "bool"
    | "file"
    | "readonly";
  options?: readonly string[];
  /** Unit shown to the right of the input (e.g. "Day", "VND"). */
  suffix?: string;
  /** Date cells: earliest / latest date the picker allows for this row (e.g. Expiry ≥ Valid). */
  min?: (row: T) => string | undefined;
  max?: (row: T) => string | undefined;
  /** Hover preview of a multiselect cell; defaults to the list of picked values. */
  preview?: (row: T) => ReactNode;
}

const thClass =
  "whitespace-nowrap bg-muted px-2 py-2 text-left text-xs font-semibold text-foreground";
const cell =
  "h-8 w-full rounded-md border border-input bg-card px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring";

/**
 * Inline-editable table used by every Business Partner tab: header with "Add", one input per cell,
 * horizontal scroll for wide tables. `derive` lets a cell fill its siblings (code ↔ name).
 * The whole table is disabled by wrapping it in a <fieldset disabled> (view mode).
 */
export function EditableTable<T extends { rid: string }>({
  title,
  rows,
  onChange,
  blank,
  columns,
  derive,
  extra,
  error,
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: () => T;
  columns: ColDef<T>[];
  derive?: (row: T, key: keyof T & string, value: unknown) => Partial<T>;
  /** Read-only computed column rendered after the inputs. */
  extra?: { label: string; width: number; render: (row: T) => ReactNode };
  error?: string | undefined;
}) {
  const { t } = useT();
  const set = (rid: string, key: keyof T & string, value: unknown) =>
    onChange(
      rows.map((r) =>
        r.rid === rid ? { ...r, [key]: value, ...(derive?.(r, key, value) ?? {}) } : r,
      ),
    );
  const remove = (rid: string) => {
    const next = rows.filter((r) => r.rid !== rid);
    onChange(next.length ? next : [blank()]);
  };

  const input = (r: T, c: ColDef<T>) => {
    const v = r[c.key] as unknown;
    const ph = `${c.kind.endsWith("select") ? "Select" : "Enter"} ${c.label}`;
    if (c.kind === "multiselect")
      return (
        <MultiCell
          value={String(v ?? "")}
          options={c.options ?? []}
          label={c.label}
          placeholder={ph}
          preview={c.preview?.(r)}
          onChange={(next) => set(r.rid, c.key, next)}
        />
      );
    if (c.kind === "bool")
      return (
        <div className="flex h-8 items-center justify-center">
          <Checkbox
            checked={v === true}
            aria-label={c.label}
            onCheckedChange={(on) => set(r.rid, c.key, on === true)}
          />
        </div>
      );
    if (c.kind === "readonly")
      return (
        <div
          className={cn(cell, "flex items-center bg-muted/50", !v && "text-muted-foreground")}
          aria-label={c.label}
          title={v ? String(v) : undefined}
        >
          <span className="truncate">{v ? String(v) : "—"}</span>
        </div>
      );
    if (c.kind === "file")
      return (
        <div className="flex h-8 items-center gap-1.5">
          <label
            className={cn(
              cell,
              "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 group-disabled:cursor-default",
              !v && "text-muted-foreground",
            )}
            title={v ? String(v) : undefined}
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{v ? String(v) : t("Chọn file…", "Choose file…")}</span>
            <input
              type="file"
              className="sr-only"
              aria-label={c.label}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) set(r.rid, c.key, file.name);
                e.target.value = "";
              }}
            />
          </label>
          {!!v && (
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground group-disabled:hidden"
              aria-label={t("Bỏ file", "Remove file")}
              onClick={() => set(r.rid, c.key, "")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
    if (c.kind === "select")
      return (
        <select
          className={cn(cell, !v && "text-muted-foreground")}
          value={String(v ?? "")}
          aria-label={c.label}
          onChange={(e) => set(r.rid, c.key, e.target.value)}
        >
          <option value="">{ph}</option>
          {withCurrent(c.options ?? [], v ? String(v) : undefined).map((o) => (
            <option key={o} value={o} className="text-foreground">
              {o}
            </option>
          ))}
        </select>
      );
    const field = (
      <Input
        className={cn("h-8 px-2 text-[13px] md:text-[13px]", c.suffix && "rounded-r-none")}
        type={c.kind === "date" ? "date" : c.kind === "datetime" ? "datetime-local" : "text"}
        inputMode={c.kind === "number" ? "decimal" : undefined}
        min={c.min?.(r) || undefined}
        max={c.max?.(r) || undefined}
        value={String(v ?? "")}
        placeholder={ph}
        aria-label={c.label}
        onChange={(e) =>
          set(
            r.rid,
            c.key,
            c.kind === "number" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value,
          )
        }
      />
    );
    return c.suffix ? (
      <div className="flex">
        {field}
        <span className="flex items-center rounded-r-md border border-l-0 bg-muted px-2 text-xs font-medium text-muted-foreground">
          {c.suffix}
        </span>
      </div>
    ) : (
      field
    );
  };

  return (
    <div className="rounded-[12px] border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-card-title">{title}</h3>
        <Button
          size="sm"
          type="button"
          className="group-disabled:hidden"
          onClick={() => onChange([...rows, blank()])}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div
        className={cn("overflow-x-auto rounded-lg border bg-card", error && "border-destructive")}
      >
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/60">
              <th className={cn(thClass, "sticky left-0 z-20 w-9 min-w-9 text-center")}>#</th>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  className={cn(thClass, i === 0 && "sticky left-9 z-20 border-r")}
                  style={{ minWidth: c.width }}
                >
                  {c.label}
                  {c.required && <span className="ml-0.5 text-destructive">*</span>}
                </th>
              ))}
              {extra && (
                <th className={thClass} style={{ minWidth: extra.width }}>
                  {extra.label}
                </th>
              )}
              <th
                className={cn(thClass, "sticky right-0 z-20 w-10 min-w-10 group-disabled:hidden")}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.rid} className="group/row border-t align-middle hover:bg-accent/30">
                <td className="sticky left-0 z-10 bg-card px-2 text-center text-xs text-muted-foreground group-hover/row:bg-accent">
                  {i + 1}
                </td>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      "p-1",
                      ci === 0 && "sticky left-9 z-10 border-r bg-card group-hover/row:bg-accent",
                    )}
                    style={{ minWidth: c.width }}
                  >
                    {input(r, c)}
                  </td>
                ))}
                {extra && <td className="whitespace-nowrap p-1 px-2">{extra.render(r)}</td>}
                <td className="sticky right-0 z-10 bg-card p-1 text-center group-hover/row:bg-accent group-disabled:hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={t("Xoá dòng", "Delete row")}
                    onClick={() => remove(r.rid)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Multi-pick cell: one line (first pick + "+N"), a checkbox list on click, and a hover card that
 * previews every pick so a narrow column never hides what was chosen.
 */
function MultiCell({
  value,
  options,
  label,
  placeholder,
  preview,
  onChange,
}: {
  value: string;
  options: readonly string[];
  label: string;
  placeholder: string;
  preview?: ReactNode;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = splitList(value);
  const all = withCurrent(options, ...picked);
  const toggle = (o: string) =>
    onChange(
      joinList(
        picked.includes(o)
          ? picked.filter((x) => x !== o)
          : // Keep the catalog order so the list reads the same way everywhere.
            all.filter((x) => x === o || picked.includes(x)),
      ),
    );

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <Popover open={open} onOpenChange={setOpen}>
        {/* The hover trigger wraps the button so the preview also works when the table is disabled. */}
        <HoverCardTrigger asChild>
          <div>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={label}
                className={cn(
                  cell,
                  "flex items-center gap-1 text-left disabled:cursor-default disabled:bg-muted/40",
                )}
              >
                {picked.length === 0 ? (
                  <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {picked[0]}
                    </span>
                    {picked.length > 1 && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        +{picked.length - 1}
                      </span>
                    )}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-disabled:hidden" />
              </button>
            </PopoverTrigger>
          </div>
        </HoverCardTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
          <Command>
            {all.length > 7 && <CommandInput placeholder="Search..." />}
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {all.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => toggle(o)}>
                    <Checkbox
                      checked={picked.includes(o)}
                      tabIndex={-1}
                      className="pointer-events-none"
                      aria-hidden
                    />
                    {o}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {picked.length > 0 && !open && (
        // Portal: the table scrolls horizontally and would clip the card.
        <HoverCardPrimitive.Portal>
          <HoverCardContent align="start" className="w-auto min-w-48 max-w-80 p-3">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {label} ({picked.length})
            </p>
            {preview ?? (
              <ul className="space-y-1 text-[13px]">
                {picked.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </HoverCardContent>
        </HoverCardPrimitive.Portal>
      )}
    </HoverCard>
  );
}
