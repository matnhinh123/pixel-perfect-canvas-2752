import { useState } from "react";
import { Check, ChevronDown, Info, Truck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { VehicleRecord } from "@/types";
import { vehicleLabel, vehicleTollClass } from "@/mock-data/vehicles";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Pick a vehicle from Vehicle Master. Group, weight, routing profile and toll class are derived from it
 * and shown as one read-only line — the user never re-enters them.
 */
export function VehicleSelector({
  vehicles,
  value,
  onChange,
  invalid,
}: {
  vehicles: VehicleRecord[];
  value: string | undefined;
  onChange: (v: VehicleRecord | null) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = vehicles.find((v) => v.id === value);

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-invalid={invalid || undefined}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-md border border-input bg-card pl-3 pr-16 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                invalid && "border-destructive",
              )}
            >
              <Truck
                className={cn(
                  "h-5 w-5 shrink-0",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              />
              {selected ? (
                <span className="truncate font-medium">{vehicleLabel(selected)}</span>
              ) : (
                <span className="text-muted-foreground">Chọn xe…</span>
              )}
            </button>
          </PopoverTrigger>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </span>
          {selected && (
            <button
              type="button"
              aria-label="Bỏ chọn xe"
              onClick={() => onChange(null)}
              className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Tìm biển số, tên xe…" />
            <CommandList>
              <CommandEmpty>Không tìm thấy xe.</CommandEmpty>
              <CommandGroup>
                {vehicles.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.plate} ${v.name} ${v.group}`}
                    onSelect={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3"
                  >
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{vehicleLabel(v)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {v.group} · {formatNumber(v.weightKg)} kg
                      </span>
                    </span>
                    {v.id === value && <Check className="h-4 w-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <div
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm"
          title={`Nhóm phí: ${vehicleTollClass(selected)} · lấy từ Vehicle Master`}
        >
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>{selected.group}</span>
          <span className="text-muted-foreground">·</span>
          <span>{formatNumber(selected.weightKg)} kg</span>
          <span className="text-muted-foreground">·</span>
          <span>{selected.profile}</span>
        </div>
      )}
    </div>
  );
}
