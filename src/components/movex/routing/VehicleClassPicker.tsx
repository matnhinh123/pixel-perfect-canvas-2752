import { Check, ChevronDown, Container, Truck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VEHICLE_CLASSES } from "@/services/routing/RouteProvider";
import { cn } from "@/lib/utils";

type Profile = keyof typeof VEHICLE_CLASSES;
const PROFILES: { key: Profile; label: string; Icon: typeof Truck }[] = [
  { key: "Truck", label: "Truck", Icon: Truck },
  { key: "Container", label: "Container", Icon: Container },
];

/**
 * Route map vehicle switch: Truck (class 1–5) / Container (class 3–5). The class is the Vietnamese
 * toll vehicle class Vietmap prices tolls by.
 */
export function VehicleClassPicker({
  profile,
  vehicleClass,
  disabled,
  onChange,
}: {
  profile: string;
  vehicleClass: number;
  disabled?: boolean;
  onChange: (profile: Profile, cls: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5" aria-label="Vehicle">
      {PROFILES.map(({ key, label, Icon }) => {
        const active = profile === key;
        const classes = VEHICLE_CLASSES[key];
        return (
          <DropdownMenu key={key}>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <button
                type="button"
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                  active
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {active && <span className="text-muted-foreground">· Group {vehicleClass}</span>}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {label} — toll vehicle group
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {classes.map((c) => {
                const on = active && c.cls === vehicleClass;
                return (
                  <DropdownMenuItem
                    key={c.cls}
                    onSelect={() => onChange(key, c.cls)}
                    className="flex items-start gap-2 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-medium", on && "text-primary")}>
                        Group {c.cls}
                      </span>
                      <span className="block text-xs text-muted-foreground">{c.desc}</span>
                    </span>
                    {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
