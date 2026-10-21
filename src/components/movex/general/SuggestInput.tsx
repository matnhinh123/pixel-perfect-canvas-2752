import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Free-text input that drops down values already used elsewhere (e.g. brands of other vehicles):
 * the list opens on focus, narrows while typing, and any other value can still be typed. The list is
 * drawn on top of the page (portal) so a panel with hidden overflow never cuts it off.
 */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  invalid,
  upper,
  emptyText,
  hint,
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
  /** Secondary text next to a suggestion (e.g. the name of a code); also searched. */
  hint?: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const needle = fold(value.trim());
  const hits = [...new Set(suggestions)].filter(
    (s) => !needle || fold(s).includes(needle) || (!!hint && fold(hint(s)).includes(needle)),
  );
  // Nothing to suggest when the box already holds exactly the only match.
  const shown = hits.length === 1 && hits[0] === value ? [] : hits;
  const listOpen = open && (shown.length > 0 || (!!emptyText && !hits.length));

  // Place the list under the input (above it when there is no room below) and follow scrolling.
  useLayoutEffect(() => {
    if (!listOpen) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 248 && r.top > below;
      setPos({
        position: "fixed",
        left: r.left,
        width: Math.max(r.width, 160),
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [listOpen]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
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
      {listOpen &&
        pos &&
        createPortal(
          <ul
            role="listbox"
            data-suggest-list=""
            // An open modal dialog turns pointer events off outside itself; the list stays clickable.
            style={{ ...pos, pointerEvents: "auto" }}
            className="z-[100] max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
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
                  {hint && <span className="ml-2 text-xs text-muted-foreground">{hint(s)}</span>}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
