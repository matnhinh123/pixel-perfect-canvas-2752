import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

/**
 * Checkbox dropdown for picking several values (Business Category, Currencies). Looks like the
 * NativeSelect next to it; selected values show as chips. Disabled natively inside a read-only
 * <fieldset> (view mode).
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  className,
  disabled,
  selectAllLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: readonly string[];
  placeholder: string;
  invalid?: boolean;
  className?: string;
  disabled?: boolean;
  /** Set: a first "Select all" row ticks / unticks every option. */
  selectAllLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (o: string) =>
    onChange(
      value.includes(o)
        ? value.filter((x) => x !== o)
        : // Keep the catalog order so the chips read the same way everywhere.
          options.filter((x) => x === o || value.includes(x)),
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex min-h-9 w-full items-center gap-1 rounded-md border border-input bg-card px-2 py-1 text-left text-sm outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-destructive disabled:cursor-default disabled:bg-muted/40",
            className,
          )}
        >
          <span className="flex flex-1 flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="px-1 text-muted-foreground group-disabled:text-transparent">
                {placeholder}
              </span>
            ) : (
              value.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                >
                  {v}
                  <X
                    className="h-3 w-3 cursor-pointer group-disabled:hidden"
                    aria-label={`Remove ${v}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(v);
                    }}
                  />
                </span>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-disabled:hidden" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command>
          {options.length > 7 && <CommandInput placeholder="Search..." />}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {selectAllLabel && options.length > 1 && (
                <CommandItem
                  value={`__all ${selectAllLabel}`}
                  onSelect={() =>
                    onChange(options.every((o) => value.includes(o)) ? [] : [...options])
                  }
                  className="border-b font-medium"
                >
                  <Checkbox
                    checked={
                      options.every((o) => value.includes(o))
                        ? true
                        : value.length
                          ? "indeterminate"
                          : false
                    }
                    tabIndex={-1}
                    className="pointer-events-none"
                    aria-hidden
                  />
                  {selectAllLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => toggle(o)}>
                  <Checkbox
                    checked={value.includes(o)}
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
  );
}
