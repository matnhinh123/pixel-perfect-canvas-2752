import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { LocationRecord } from "@/types";
import { searchLocations } from "@/services/routing/locationSearch";
import { cn } from "@/lib/utils";

/**
 * Typeahead over Location master data — the one location input for Origin, Waypoints and Destination.
 * Type to filter (case/diacritic-insensitive, by name or province), ↑/↓ to move, Enter to pick,
 * Esc to close. Returns the picked Location (with lat/lng) or null when cleared.
 * - default: bordered input with a pin icon
 * - inline:  borderless until hover/focus (used inside the stop table)
 */
export function LocationAutocomplete({
  locations,
  value,
  onChange,
  fallbackLabel,
  placeholder,
  invalid,
  disabled,
  inline,
}: {
  locations: LocationRecord[];
  /** Selected location id. */
  value: string | null;
  onChange: (loc: LocationRecord | null) => void;
  /** Shown when `value` is not in `locations` (e.g. a point saved from another source). */
  fallbackLabel?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  inline?: boolean;
}) {
  const selected = useMemo(
    () => (value ? (locations.find((l) => l.id === value) ?? null) : null),
    [locations, value],
  );
  const label = selected?.name ?? fallbackLabel ?? "";
  const [text, setText] = useState(label);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typing) setText(label);
  }, [label, typing]);

  const items = useMemo(
    () => searchLocations(locations, typing ? text : "", typing ? 8 : 10),
    [locations, text, typing],
  );

  useEffect(() => {
    setActive(0);
  }, [text]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    setOpen(false);
    setTyping(false);
    setText(label);
  };
  const pick = (l: LocationRecord) => {
    setTyping(false);
    setText(l.name);
    setOpen(false);
    onChange(l);
  };
  const clear = () => {
    setText("");
    setTyping(true);
    onChange(null);
    setOpen(true);
    inputRef.current?.focus();
  };

  const input = (
    <input
      ref={inputRef}
      value={text}
      disabled={disabled}
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      aria-invalid={invalid || undefined}
      placeholder={placeholder ?? "Gõ để tìm địa điểm…"}
      className={cn(
        "h-full w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed",
        inline ? "pl-2 pr-7" : "pl-9 pr-8",
      )}
      onFocus={(e) => {
        e.currentTarget.select();
        setOpen(true);
      }}
      onBlur={close}
      onChange={(e) => {
        setTyping(true);
        setText(e.target.value);
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
          setActive((i) => Math.min(i + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          const l = items[active];
          if (open && l) {
            e.preventDefault();
            pick(l);
          }
        } else if (e.key === "Escape") {
          if (open) e.stopPropagation();
          close();
        }
      }}
    />
  );

  const clearBtn = (selected || text) && !disabled && (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Xoá địa điểm"
      className={cn(
        "absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground",
        inline && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={clear}
    >
      <X className="h-4 w-4" />
    </button>
  );

  return (
    <Popover open={open && !disabled}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "group relative flex items-center rounded-md border",
            inline
              ? "h-9 border-transparent hover:border-input focus-within:border-input focus-within:bg-card focus-within:ring-2 focus-within:ring-ring"
              : "h-10 border-input bg-card focus-within:ring-2 focus-within:ring-ring",
            invalid && "border-destructive",
            disabled && "bg-muted/50",
          )}
        >
          {!inline && (
            <MapPin
              className={cn(
                "absolute left-3 h-4 w-4",
                selected ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
          {input}
          {clearBtn}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Keep focus in the input: clicks inside the list must not blur it before onClick fires.
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            Không tìm thấy địa điểm phù hợp với “{text}”.
          </div>
        ) : (
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto">
            {items.map((l, i) => (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(l)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded px-3 py-2 text-left",
                  i === active && "bg-accent",
                )}
              >
                <MapPin
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    l.id === value ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{l.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
