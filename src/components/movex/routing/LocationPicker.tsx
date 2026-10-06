import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { LocationSuggestion, RoutePoint } from "@/types";
import { routingService } from "@/services/routing/routingService";
import { cn } from "@/lib/utils";

/**
 * Location autocomplete in the design style: [📍 TP.HCM (HCM)      ✕][🔍]
 * Talks to routingService only (master data + Vietmap via the server proxy).
 */
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
  const [query, setQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setText(value.name);
  }, [value.name]);

  useEffect(() => {
    if (query === null) return;
    setLoading(true);
    const t = setTimeout(() => {
      routingService
        .searchLocation(query)
        .then((r) => setItems(r))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

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
      toast.error("Không xác định được toạ độ địa điểm này. Hãy chọn địa điểm khác.");
    }
  };

  const valid = Number.isFinite(value.lat) && Number.isFinite(value.lng) && !!value.name;
  const browse = () => {
    if (disabled) return;
    setQuery(text.trim() && !valid ? text.trim() : "");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex h-10 overflow-hidden rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring",
            invalid && "border-destructive",
            disabled && "bg-muted/50",
          )}
        >
          <div className="relative flex flex-1 items-center">
            <MapPin
              className={cn(
                "absolute left-3 h-4 w-4",
                valid ? "text-foreground" : "text-muted-foreground",
              )}
            />
            <input
              ref={inputRef}
              value={text}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              placeholder={placeholder ?? "Tìm địa điểm…"}
              className="h-full w-full bg-transparent pl-9 pr-8 text-sm outline-none disabled:cursor-not-allowed"
              onFocus={() => {
                if (!valid) browse();
              }}
              onChange={(e) => {
                typing.current = true;
                setText(e.target.value);
                setQuery(e.target.value.trim());
                setOpen(true);
                // Typed text is not a location until picked from the list.
                if (valid) onChange({ name: e.target.value, lat: NaN, lng: NaN });
              }}
            />
            {text && !disabled && (
              <button
                type="button"
                aria-label="Xoá"
                className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  typing.current = true;
                  setText("");
                  onChange({ name: "", lat: NaN, lng: NaN });
                  setQuery("");
                  setOpen(true);
                  inputRef.current?.focus();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Tìm địa điểm"
            onClick={browse}
            disabled={disabled}
            className="flex w-10 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-primary disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!loading && items.length === 0 && (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            Không tìm thấy địa điểm. Thử "Cát Lái", "Bình Dương", "Quy Nhơn"…
          </div>
        )}
        <div className="max-h-72 overflow-y-auto">
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
