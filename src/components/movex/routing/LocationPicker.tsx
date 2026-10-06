import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { LocationSuggestion, RoutePoint } from "@/types";
import { routingService } from "@/services/routing/routingService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Location autocomplete. Talks to routingService only (master data + Vietmap via the server proxy). */
export function LocationPicker({
  value,
  onChange,
  placeholder,
  invalid,
  disabled,
}: {
  value: RoutePoint;
  onChange: (p: RoutePoint) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LocationSuggestion[]>([]);
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setText(value.name);
  }, [value.name]);

  useEffect(() => {
    if (!typing.current) return;
    const q = text.trim();
    if (!q) {
      setItems([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      routingService
        .searchLocation(q)
        .then((r) => {
          setItems(r);
          setLoading(false);
        })
        .catch(() => {
          setItems([]);
          setLoading(false);
        });
    }, 220);
    return () => clearTimeout(t);
  }, [text]);

  const pick = async (s: LocationSuggestion) => {
    try {
      const r = await routingService.resolveLocation(s);
      if (typeof r.lat !== "number" || typeof r.lng !== "number") throw new Error("No coordinates");
      typing.current = false;
      setText(r.name);
      setOpen(false);
      onChange({
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        ...(r.source === "master" ? { locationId: r.id } : {}),
      });
    } catch {
      toast.error("Could not resolve this location. Pick another one.");
    }
  };

  const valid = Number.isFinite(value.lat) && Number.isFinite(value.lng) && !!value.name;

  return (
    <Popover open={open && !disabled && text.trim().length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <MapPin
            className={cn(
              "absolute left-3 top-2.5 h-4 w-4",
              valid ? "text-success" : "text-muted-foreground",
            )}
          />
          <Input
            value={text}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={cn("pl-9", invalid && "border-destructive")}
            placeholder={placeholder ?? "Search location…"}
            onFocus={() => text && setOpen(true)}
            onChange={(e) => {
              typing.current = true;
              setText(e.target.value);
              setOpen(true);
              // Typed text is not a location until picked from the list.
              if (valid) onChange({ name: e.target.value, lat: NaN, lng: NaN });
            }}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!loading && items.length === 0 && (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            No location found. Try "Cát Lái", "Bình Dương", "Hải Phòng"…
          </div>
        )}
        {items.map((s) => (
          <button
            key={`${s.source}-${s.id}`}
            type="button"
            onClick={() => void pick(s)}
            className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-accent"
          >
            <span className="text-sm font-medium">{s.name}</span>
            <span className="text-xs text-muted-foreground">
              {s.address} · {s.source === "master" ? "Master data" : "Vietmap"}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
