// Interactive route map (Leaflet). Renders whatever geometry the RouteProvider returned — real
// Vietmap geometry when a key is configured, mock geometry otherwise. Tiles: Esri.
import { useEffect, useRef, useState, type ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Layers, Loader2 } from "lucide-react";
import type { RoutePoint, TollStation } from "@/types";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface MapToll extends TollStation {
  leg: "Outbound" | "Return";
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASE_LAYERS = {
  terrain: {
    label: "Địa hình",
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors",
  },
  street: {
    label: "Đường phố",
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors",
  },
  satellite: {
    label: "Vệ tinh",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri — Maxar, Earthstar Geographics",
  },
} as const;
type LayerKey = keyof typeof BASE_LAYERS;

const valid = (p: RoutePoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Teardrop pin (A / B) like the design. */
const pinHtml = (label: string, color: string) =>
  `<div style="position:relative;width:30px;height:40px">
     <svg width="30" height="40" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="10" fill="${color}" stroke="white" stroke-width="2"/></svg>
     <span style="position:absolute;top:7px;left:0;width:30px;text-align:center;color:white;font:700 13px Inter,sans-serif">${label}</span>
   </div>`;

const dotHtml = (label: string, color: string) =>
  `<div style="width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.35);color:white;font:700 11px Inter,sans-serif;display:flex;align-items:center;justify-content:center">${label}</div>`;

export function RouteMapPanel({
  origin,
  waypoints,
  destination,
  outboundGeometry,
  returnGeometry,
  returnWaypoints = [],
  tolls,
  roundTrip,
  providerLabel,
  height = 420,
  overlay,
  alternatives = [],
  selectedAlternativeId,
  onSelectAlternative,
}: {
  origin: RoutePoint;
  waypoints: RoutePoint[];
  destination: RoutePoint;
  outboundGeometry?: [number, number][] | undefined;
  returnGeometry?: [number, number][] | undefined;
  returnWaypoints?: RoutePoint[];
  tolls: MapToll[];
  roundTrip?: boolean;
  providerLabel?: string;
  height?: number;
  /** Summary box rendered over the bottom-right of the map. */
  overlay?: ReactNode;
  /** Non-selected alternatives are drawn as faint lines behind the selected route; click one to select it. */
  alternatives?: { id: string; label: string; geometry: [number, number][] }[];
  selectedAlternativeId?: string | null;
  onSelectAlternative?: (id: string) => void;
}) {
  const selectRef = useRef(onSelectAlternative);
  selectRef.current = onSelectAlternative;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const tileRef = useRef<Leaflet.TileLayer | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const boundsRef = useRef<Leaflet.LatLngBounds | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [base, setBase] = useState<LayerKey>("terrain");
  const [layersOpen, setLayersOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el.current) return;
        const L =
          (mod as unknown as { default?: typeof Leaflet }).default ??
          (mod as unknown as typeof Leaflet);
        LRef.current = L;
        const map = L.map(el.current, { zoomControl: false, scrollWheelZoom: true }).setView(
          [16.0, 106.5],
          6,
        );
        L.control.zoom({ position: "topleft" }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current,
      map = mapRef.current;
    if (!ready || !L || !map) return;
    tileRef.current?.remove();
    tileRef.current = L.tileLayer(BASE_LAYERS[base].url, {
      maxZoom: 19,
      attribution: BASE_LAYERS[base].attribution,
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [base, ready]);

  const fitKey = JSON.stringify([
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    waypoints.map((w) => [w.lat, w.lng]),
    returnWaypoints.map((w) => [w.lat, w.lng]),
    outboundGeometry?.length,
    returnGeometry?.length,
    roundTrip,
    tolls.map((t) => [t.lat, t.lng]),
    alternatives.map((a) => a.id),
    selectedAlternativeId,
  ]);
  useEffect(() => {
    const L = LRef.current,
      map = mapRef.current,
      layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const all: [number, number][] = [];
    const marker = (
      p: RoutePoint,
      html: string,
      size: [number, number],
      anchor: [number, number],
      z = 0,
    ) => {
      if (!valid(p)) return;
      all.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor }),
        zIndexOffset: z,
      })
        .bindTooltip(`<b>${esc(p.name)}</b>${p.address ? `<br/>${esc(p.address)}` : ""}`, {
          direction: "top",
          offset: [0, -anchor[1] + 4],
        })
        .addTo(layer);
    };

    for (const a of alternatives) {
      if (a.id === selectedAlternativeId || !a.geometry.length) continue;
      L.polyline(a.geometry, { color: "#64748b", weight: 5, opacity: 0.45 })
        .bindTooltip(`${a.label} — bấm để chọn`, { sticky: true })
        .on("click", () => selectRef.current?.(a.id))
        .addTo(layer);
      all.push(...a.geometry);
    }
    if (roundTrip && returnGeometry?.length) {
      L.polyline(returnGeometry, { color: "#16a34a", weight: 4, dashArray: "8 6" })
        .bindTooltip("Chiều về")
        .addTo(layer);
      all.push(...returnGeometry);
    }
    if (outboundGeometry?.length) {
      L.polyline(outboundGeometry, { color: "#ffffff", weight: 8, opacity: 0.9 }).addTo(layer);
      L.polyline(outboundGeometry, { color: "#2563eb", weight: 5 })
        .bindTooltip("Chiều đi")
        .addTo(layer);
      all.push(...outboundGeometry);
    } else {
      const stops = [origin, ...waypoints, destination]
        .filter(valid)
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (stops.length >= 2)
        L.polyline(stops, { color: "#94a3b8", weight: 3, dashArray: "4 8" })
          .bindTooltip("Chưa tính lộ trình")
          .addTo(layer);
    }
    for (const t of tolls) {
      if (t.lat == null || t.lng == null) continue;
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:5px;background:#f59e0b;border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,.3);color:white;font:700 10px Inter,sans-serif;display:flex;align-items:center;justify-content:center">₫</div>`,
        }),
      })
        .bindTooltip(
          `<b>${esc(t.code ? `${t.code} · ` : "")}${esc(t.name)}</b><br/>${t.leg === "Outbound" ? "Chiều đi" : "Chiều về"} · ${t.vehicleTollGroup} · ${formatVnd(t.price)}${t.positionApproximate ? "<br/><i>vị trí ước lượng</i>" : ""}`,
          { direction: "top" },
        )
        .addTo(layer);
    }
    waypoints.forEach((w, i) =>
      marker(w, dotHtml(String(i + 1), "#2563eb"), [24, 24], [12, 12], 100),
    );
    if (roundTrip)
      returnWaypoints.forEach((w, i) =>
        marker(w, dotHtml(`R${i + 1}`, "#16a34a"), [24, 24], [12, 12], 100),
      );
    marker(origin, pinHtml("A", "#16a34a"), [30, 40], [15, 40], 200);
    marker(destination, pinHtml("B", "#ef4444"), [30, 40], [15, 40], 200);

    if (all.length) {
      boundsRef.current = L.latLngBounds(all);
      map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 14 });
    }
  }, [ready, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-lg bg-map-bg" style={{ height }}>
      <div ref={el} className="absolute inset-0 z-0" />
      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Đang tải bản đồ…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
          Không tải được bản đồ. Kiểm tra kết nối mạng.
        </div>
      )}

      <div className="absolute right-3 top-3 z-[400] flex flex-col items-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            aria-label="Lớp bản đồ"
            title="Lớp bản đồ"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-md hover:text-primary"
          >
            <Layers className="h-5 w-5" />
          </button>
          {layersOpen && (
            <div className="absolute right-0 top-11 w-36 overflow-hidden rounded-lg border bg-card text-sm shadow-lg">
              {(Object.keys(BASE_LAYERS) as LayerKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setBase(k);
                    setLayersOpen(false);
                  }}
                  className={cn(
                    "block w-full px-3 py-2 text-left hover:bg-accent",
                    base === k && "font-semibold text-primary",
                  )}
                >
                  {BASE_LAYERS[k].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {providerLabel && (
        <span className="absolute bottom-1 left-2 z-[400] rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {providerLabel}
        </span>
      )}
      {overlay && <div className="absolute bottom-3 right-3 z-[400]">{overlay}</div>}
    </div>
  );
}
