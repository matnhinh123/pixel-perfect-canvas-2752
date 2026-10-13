import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface OverflowItem {
  key: string;
  label: string;
  count: number;
}

/**
 * One row of items (tabs or chips) that never wraps: the items that do not fit the width are
 * gathered in a last "More" entry with a searchable list. The selected item always stays visible.
 */
export function OverflowList({
  items,
  selectedKey,
  onSelect,
  renderItem,
  moreLabel,
  moreClassName,
  className,
  ariaLabel,
}: {
  items: OverflowItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  renderItem: (item: OverflowItem, selected: boolean) => ReactNode;
  /** Text of the overflow entry, e.g. (n) => `More (${n})`. */
  moreLabel: (hidden: number) => string;
  moreClassName: (active: boolean) => string;
  className?: string;
  ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [open, setOpen] = useState(false);

  // Measure every item (hidden copy) against the available width; re-run on resize.
  useLayoutEffect(() => {
    const el = box.current,
      m = measure.current;
    if (!el || !m) return;
    const compute = () => {
      const widths = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth);
      const moreW = widths.pop() ?? 0;
      const avail = el.clientWidth;
      if (!avail) return setFit(items.length);
      let used = 0,
        n = 0;
      for (const [i, w] of widths.entries()) {
        const needMore = i < widths.length - 1 ? moreW : 0;
        if (used + w + needMore > avail) break;
        used += w;
        n++;
      }
      setFit(Math.max(1, n));
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  const all = items.length;
  let shown = items.slice(0, fit);
  const selIndex = items.findIndex((i) => i.key === selectedKey);
  // Keep the selected item visible: it takes the last visible slot.
  if (fit < all && selIndex >= fit)
    shown = [...items.slice(0, Math.max(0, fit - 1)), items[selIndex]!];
  const hidden = items.filter((i) => !shown.includes(i));
  const hiddenActive = hidden.some((i) => i.key === selectedKey);

  const moreButton = (n: number, active: boolean) => (
    <span className={cn("flex items-center gap-1 whitespace-nowrap", moreClassName(active))}>
      {moreLabel(n)}
      <ChevronDown className="h-3.5 w-3.5" />
    </span>
  );

  return (
    <div
      ref={box}
      className={cn("relative flex min-w-0 flex-1", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {shown.map((i) => (
        <span key={i.key} className="shrink-0">
          {renderItem(i, i.key === selectedKey)}
        </span>
      ))}
      {hidden.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="shrink-0" aria-label={moreLabel(hidden.length)}>
              {moreButton(hidden.length, hiddenActive)}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Search…" />
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup>
                  {hidden.map((i) => (
                    <CommandItem
                      key={i.key}
                      value={`${i.label} ${i.key}`}
                      onSelect={() => {
                        onSelect(i.key);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          i.key === selectedKey ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      <span className="text-xs text-muted-foreground">{i.count}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Hidden copy used only to measure widths (every item + the More entry, in order). */}
      <div
        ref={measure}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
      >
        {items.map((i) => (
          <span key={i.key} className="shrink-0">
            {renderItem(i, i.key === selectedKey)}
          </span>
        ))}
        <span className="shrink-0">{moreButton(all, false)}</span>
      </div>
    </div>
  );
}
