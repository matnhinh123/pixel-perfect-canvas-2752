import { useMemo, useState } from "react";
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

/** Lower case, no accents: "Hồ Chí Minh" matches "ho chi minh". */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
/** Initials, so "hcm" finds "TP. Hồ Chí Minh". */
const initials = (s: string) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["tp", "tinh", "thanh", "pho"].includes(w))
    .map((w) => w[0])
    .join("");

/**
 * Drop-down with a search box: same props as NativeSelect ("" = nothing chosen, its label is the
 * placeholder). Typing narrows the list, accents ignored. Disabled natively inside a read-only
 * <fieldset> (view mode).
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  labels,
  className,
  disabled,
  invalid,
  searchPlaceholder = "Search...",
  emptyText = "No results.",
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = (o: string) => labels?.[o] ?? o;
  const choices = options.filter((o) => o !== "");
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return choices;
    return choices.filter(
      (o) => fold(label(o)).includes(needle) || initials(label(o)).startsWith(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, options, labels]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive",
            className,
          )}
        >
          <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
            {value ? label(value) : (labels?.[""] ?? "")}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-disabled:hidden" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {shown.map((o) => (
                <CommandItem
                  key={o}
                  value={o}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Check className={cn("h-4 w-4", o === value ? "opacity-100" : "opacity-0")} />
                  {label(o)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
