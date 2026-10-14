import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Free-text input that drops down values already used elsewhere (e.g. brands of other vehicles):
 * the list opens on focus, narrows while typing, and any other value can still be typed.
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  invalid,
  upper,
  emptyText,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
  invalid?: boolean;
  /** Store / show the typed text in upper case. */
  upper?: boolean;
  /** Shown when nothing matches (omit to show nothing). */
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const needle = fold(value.trim());
  const hits = suggestions.filter((s) => !needle || fold(s).includes(needle));
  // Nothing to suggest when the box already holds exactly the only match.
  const shown = hits.length === 1 && hits[0] === value ? [] : hits;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-invalid={invalid || undefined}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(upper ? e.target.value.toUpperCase() : e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open || !shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % shown.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + shown.length) % shown.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(shown[Math.min(active, shown.length - 1)]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (shown.length > 0 || (emptyText && !hits.length)) && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-40 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</li>
          ) : (
            shown.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "cursor-pointer rounded px-2 py-1.5",
                  i === active ? "bg-accent" : "hover:bg-accent/60",
                )}
                onMouseEnter={() => setActive(i)}
                // mousedown: pick before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                {s}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
