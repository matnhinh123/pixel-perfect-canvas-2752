// Pick a location's coordinates by searching a place, clicking the map (Leaflet, Esri tiles) or
// typing them.
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Check, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/movex/common";
import { useT } from "@/lib/i18n";

const TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const VIETNAM: [number, number] = [16.0, 106.5];
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const parse = (v: string) => (v.trim() === "" ? NaN : Number(v));

interface PlaceHit {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  /** Vietmap hits carry a ref id; their coordinates come from a second "place" call. */
  refId?: string;
}

let vietmapReady: Promise<boolean> | null = null;
/** Whether the server has a Vietmap key (checked once). */
const hasVietmap = () =>
  (vietmapReady ??= fetch("/api/vietmap/status")
    .then((r) => (r.ok ? r.json() : { configured: false }))
    .then((j: { configured?: boolean }) => !!j.configured)
    .catch(() => false));

/** Place search: Vietmap (through the server proxy) when configured, else OpenStreetMap Nominatim. */
async function searchPlaces(text: string, signal: AbortSignal): Promise<PlaceHit[]> {
  if (await hasVietmap()) {
    const r = await fetch(`/api/vietmap/search?text=${encodeURIComponent(text)}`, { signal });
    if (!r.ok) throw new Error("search failed");
    const items = (await r.json()) as { id: string; name: string; address: string }[];
    return items.map((x) => ({ id: x.id, name: x.name, address: x.address, refId: x.id }));
  }
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", text);
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "vi,en");
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("search failed");
  const items = (await r.json()) as {
    place_id: number;
    name?: string;
    display_name: string;
    lat: string;
    lon: string;
  }[];
  return items.map((x) => ({
    id: String(x.place_id),
    name: x.name || x.display_name.split(",")[0]!,
    address: x.display_name,
    lat: Number(x.lat),
    lng: Number(x.lon),
  }));
}

/** Coordinates of a hit (Vietmap needs the place details call). */
async function coordsOf(hit: PlaceHit): Promise<{ lat: number; lng: number }> {
  if (Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return { lat: hit.lat!, lng: hit.lng! };
  const r = await fetch(`/api/vietmap/place?refid=${encodeURIComponent(hit.refId ?? hit.id)}`);
  if (!r.ok) throw new Error("place failed");
  const p = (await r.json()) as { lat: number; lng: number };
  return { lat: p.lat, lng: p.lng };
}

/** "Search a place" box: type a name / address, pick a result to move the pin there. */
function PlaceSearch({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setHits([]);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    setError(false);
    // Debounced: one request after the user stops typing.
    const timer = setTimeout(() => {
      searchPlaces(text, ctrl.signal)
        .then((r) => {
          setHits(r);
          setOpen(true);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== "AbortError") setError(true);
        })
        .finally(() => setBusy(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const pick = (h: PlaceHit) => {
    setOpen(false);
    setQ(h.name);
    coordsOf(h)
      .then(onPick)
      .catch(() => setError(true));
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        className="pl-9 pr-9"
        placeholder={t(
          "Tìm địa điểm (tên, địa chỉ)… VD: Cảng Cát Lái",
          "Search a place (name or address)… e.g. Cat Lai Port",
        )}
        aria-label={t("Tìm địa điểm", "Search a place")}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            e.preventDefault();
            pick(hits[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {busy && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && q.trim().length >= 3 && !busy && (
        <div className="absolute z-[1000] mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {t("Không tìm thấy địa điểm.", "No place found.")}
            </p>
          ) : (
            hits.map((h) => (
              <button
                key={h.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent"
                onClick={() => pick(h)}
              >
                <span className="text-sm font-medium">{h.name}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{h.address}</span>
              </button>
            ))
          )}
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs font-medium text-destructive">
          {t(
            "Không tìm được địa điểm lúc này — có thể chọn trên bản đồ hoặc nhập toạ độ.",
            "Place search is unavailable right now — pick on the map or type the coordinates.",
          )}
        </p>
      )}
    </div>
  );
}

export function MapPickerDialog({
  open,
  onOpenChange,
  lat,
  lng,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number;
  lng: number;
  onConfirm: (p: { lat: number; lng: number }) => void;
}) {
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Chọn vị trí trên bản đồ", "Pick location on map")}</DialogTitle>
          <DialogDescription>
            {t(
              "Tìm địa điểm, nhấp vào bản đồ để đặt ghim, hoặc nhập trực tiếp vĩ độ / kinh độ.",
              "Search a place, click the map to drop the pin, or type latitude / longitude directly.",
            )}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Picker
            lat={lat}
            lng={lng}
            onCancel={() => onOpenChange(false)}
            onConfirm={(p) => {
              onConfirm(p);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  lat,
  lng,
  onCancel,
  onConfirm,
}: {
  lat: number;
  lng: number;
  onCancel: () => void;
  onConfirm: (p: { lat: number; lng: number }) => void;
}) {
  const { t } = useT();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Leaflet.Map | null>(null);
  const [L, setL] = useState<typeof Leaflet | null>(null);
  const [marker, setMarker] = useState<Leaflet.CircleMarker | null>(null);
  const [latText, setLatText] = useState(Number.isFinite(lat) ? String(lat) : "");
  const [lngText, setLngText] = useState(Number.isFinite(lng) ? String(lng) : "");
  const [failed, setFailed] = useState(false);

  const la = parse(latText),
    ln = parse(lngText);
  const valid =
    Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;

  // Create the map once its container is mounted.
  useEffect(() => {
    if (!el) return;
    let cancelled = false;
    let created: Leaflet.Map | null = null;
    import("leaflet")
      .then((mod) => {
        if (cancelled) return;
        const lib =
          (mod as unknown as { default?: typeof Leaflet }).default ??
          (mod as unknown as typeof Leaflet);
        const start: [number, number] =
          Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : VIETNAM;
        created = lib
          .map(el, { scrollWheelZoom: true })
          .setView(start, Number.isFinite(lat) ? 14 : 6);
        lib.tileLayer(TILES, { attribution: "Tiles &copy; Esri", maxZoom: 19 }).addTo(created);
        created.on("click", (ev: Leaflet.LeafletMouseEvent) => {
          setLatText(String(round(ev.latlng.lat)));
          setLngText(String(round(ev.latlng.lng)));
        });
        // The dialog animates open; recompute the size once it settles.
        setTimeout(() => created?.invalidateSize(), 250);
        setL(lib);
        setMap(created);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      created?.remove();
      setMap(null);
    };
    // Initial position only; later edits move the pin through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  // Keep the pin in sync with the typed / clicked coordinates.
  useEffect(() => {
    if (!map || !L) return;
    if (!valid) {
      marker?.remove();
      setMarker(null);
      return;
    }
    if (marker) marker.setLatLng([la, ln]);
    else
      setMarker(
        L.circleMarker([la, ln], {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: "#e11d48",
          fillOpacity: 1,
        }).addTo(map),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, L, valid, la, ln]);

  return (
    <>
      <PlaceSearch
        onPick={(p) => {
          setLatText(String(round(p.lat)));
          setLngText(String(round(p.lng)));
          map?.setView([p.lat, p.lng], 16);
        }}
      />
      <div className="relative h-[380px] overflow-hidden rounded-lg border bg-muted">
        <div ref={setEl} className="absolute inset-0" />
        {!map && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t(
              "Không tải được bản đồ — vẫn có thể nhập toạ độ bên dưới.",
              "The map could not be loaded — you can still type the coordinates below.",
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Vĩ độ (Latitude)", "Latitude")}>
          <Input
            inputMode="decimal"
            placeholder="10.8231"
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
          />
        </Field>
        <Field label={t("Kinh độ (Longitude)", "Longitude")}>
          <Input
            inputMode="decimal"
            placeholder="106.6297"
            value={lngText}
            onChange={(e) => setLngText(e.target.value)}
          />
        </Field>
      </div>
      {!valid && (latText || lngText) && (
        <p className="text-xs font-medium text-destructive">
          {t(
            "Toạ độ không hợp lệ (vĩ độ -90…90, kinh độ -180…180).",
            "Invalid coordinates (latitude -90…90, longitude -180…180).",
          )}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={!latText && !lngText}
          onClick={() => {
            setLatText("");
            setLngText("");
          }}
        >
          {t("Xoá vị trí", "Clear")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            {t("Huỷ", "Cancel")}
          </Button>
          <Button
            type="button"
            disabled={!valid && (latText !== "" || lngText !== "")}
            onClick={() => onConfirm(valid ? { lat: la, lng: ln } : { lat: NaN, lng: NaN })}
          >
            <Check className="h-4 w-4" />
            {valid ? t("Dùng vị trí này", "Use this location") : t("Xác nhận", "Confirm")}
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {t(
          "Địa điểm chưa có toạ độ sẽ không được gợi ý trong Routing.",
          "Locations without coordinates are not offered in Routing.",
        )}
      </p>
    </>
  );
}
