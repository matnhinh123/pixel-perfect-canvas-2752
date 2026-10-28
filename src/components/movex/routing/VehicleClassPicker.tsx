import { Check, ChevronDown, Container, Truck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTAINER_LABEL, VEHICLE_CLASSES } from "@/services/routing/RouteProvider";
import { cn } from "@/lib/utils";

type Profile = keyof typeof VEHICLE_CLASSES;

/** A Truck Type of the Vehicle master and the toll group its trucks are in. */
export interface RouteTruckType {
  truckType: string;
  group: number;
  vehicleCount: number;
}

/**
 * Route map vehicle switch, from the vehicles in the system: Truck → a Truck Type set up in Vehicle (its
 * toll group is the Vehicle Group of those trucks), or Container → header only / ≤ 20 ft / > 20 ft.
 * The group is the Vietnamese toll vehicle class Vietmap prices tolls by.
 */
export function VehicleClassPicker({
  profile,
  vehicleClass,
  truckType,
  truckTypes,
  disabled,
  onChange,
}: {
  profile: string;
  vehicleClass: number;
  truckType: string | undefined;
  truckTypes: readonly RouteTruckType[];
  disabled?: boolean;
  onChange: (profile: Profile, cls: number, truckType?: string) => void;
}) {
  const btn = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60",
      active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  const item = (on: boolean, title: string, desc: string, onSelect: () => void, key: string) => (
    <DropdownMenuItem key={key} onSelect={onSelect} className="flex items-start gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium", on && "text-primary")}>{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
    </DropdownMenuItem>
  );
  const truckOn = profile === "Truck";
  const containerOn = profile === "Container";

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5" aria-label="Vehicle">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button type="button" aria-pressed={truckOn} className={btn(truckOn)}>
            <Truck className="h-3.5 w-3.5" />
            Truck
            {truckOn && (
              <span className="text-muted-foreground">
                · {truckType || `Group ${vehicleClass}`}
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Truck — Truck Type (from Vehicle)
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {truckTypes.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No active truck with a Truck Type in Vehicle yet.
            </div>
          ) : (
            truckTypes.map((t) =>
              item(
                truckOn && t.truckType === truckType,
                t.truckType,
                `Toll group ${t.group} · ${t.vehicleCount} vehicle${t.vehicleCount === 1 ? "" : "s"}`,
                () => onChange("Truck", t.group, t.truckType),
                t.truckType,
              ),
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button type="button" aria-pressed={containerOn} className={btn(containerOn)}>
            <Container className="h-3.5 w-3.5" />
            Container
            {containerOn && (
              <span className="text-muted-foreground">
                · {CONTAINER_LABEL[vehicleClass] ?? `Group ${vehicleClass}`}
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Container
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {VEHICLE_CLASSES.Container.map((c) =>
            item(
              containerOn && c.cls === vehicleClass,
              CONTAINER_LABEL[c.cls] ?? c.desc,
              `${c.desc} · toll group ${c.cls}`,
              () => onChange("Container", c.cls),
              String(c.cls),
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
