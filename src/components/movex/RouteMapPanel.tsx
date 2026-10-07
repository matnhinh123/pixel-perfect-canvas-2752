// Interactive route map (Leaflet). Renders whatever geometry the RouteProvider returned — real
// Vietmap geometry when a key is configured, mock geometry otherwise. Tiles: Esri.
// Round trip: outbound = blue, return = red; `legView` picks which leg(s) are drawn.
import { useEffect, useRef, useState, type ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Layers, Loader2 } from "lucide-react";
import type { RoutePoint, TollStation } from "@/types";
import { cn } from "@/lib/utils";

export interface MapToll extends TollStation {
  leg: "Outbound" | "Return";
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASE_LAYERS = {
  terrain: {
    label: "Terrain",
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors",
  },
  street: {
    label: "Street",
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors",
  },
  satellite: {
    label: "Satellite",
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

export type LegView = "both" | "outbound" | "return";

const OUTBOUND_COLOR = "#2563eb";
const RETURN_COLOR = "#dc2626";
/** Display-only shift (px) used when outbound and return share one geometry. */
const SHARED_OFFSET_PX = 3;

const sameLine = (a: [number, number][], b: [number, number][]) =>
  a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);

/** Shift a line `px` screen pixels to the right of its direction of travel (never changes the data). */
function offsetLine(
  L: typeof Leaflet,
  map: Leaflet.Map,
  pts: [number, number][],
  px: number,
): Leaflet.LatLng[] {
  const p = pts.map((x) => map.latLngToLayerPoint(x));
  return p.map((pt, i) => {
    const a = p[Math.max(0, i - 1)]!;
    const b = p[Math.min(p.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Right-hand normal in screen space (y grows downwards).
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return map.layerPointToLatLng(L.point(pt.x + nx * px, pt.y + ny * px));
  });
}

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
  onRouteDrag,
  onWaypointDrag,
  legView = "both",
  returnSameAsOutbound = false,
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
  /** Google-style: grab the selected outbound line and drop it elsewhere to add a via point. */
  onRouteDrag?: ((p: { lat: number; lng: number }) => void) | undefined;
  /** Drag an existing outbound waypoint (0-based index into `waypoints`) to a new position. */
  onWaypointDrag?: ((index: number, p: { lat: number; lng: number }) => void) | undefined;
  /** Round trip: which leg(s) to draw. */
  legView?: LegView;
  /** Return = outbound reversed: in "both" the two lines are drawn slightly apart. */
  returnSameAsOutbound?: boolean;
}) {
  const selectRef = useRef(onSelectAlternative);
  selectRef.current = onSelectAlternative;
  const routeDragRef = useRef(onRouteDrag);
  routeDragRef.current = onRouteDrag;
  const wpDragRef = useRef(onWaypointDrag);
  wpDragRef.current = onWaypointDrag;
  // After a drag the route is recalculated; keep the user's viewport instead of re-fitting.
  const keepViewRef = useRef(false);
  const prevGeomRef = useRef(outboundGeometry);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const offsetLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const drawOffsetRef = useRef<(() => void) | null>(null);
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
        offsetLayerRef.current = L.layerGroup().addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        map.on("zoomend", () => drawOffsetRef.current?.());
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
    legView,
    returnSameAsOutbound,
    alternatives.map((a) => a.id),
    selectedAlternativeId,
  ]);
  useEffect(() => {
    const L = LRef.current,
      map = mapRef.current,
      layer = layerRef.current;
    const offsetLayer = offsetLayerRef.current;
    if (!ready || !L || !map || !layer || !offsetLayer) return;
    layer.clearLayers();
    offsetLayer.clearLayers();
    drawOffsetRef.current = null;
    const all: [number, number][] = [];
    const showOut = !roundTrip || legView !== "return";
    const showRet = !!roundTrip && legView !== "outbound";
    const retGeom = showRet && returnGeometry?.length ? returnGeometry : undefined;
    const outGeom = showOut && outboundGeometry?.length ? outboundGeometry : undefined;
    // Both legs on one geometry: draw each a few px to its right so neither hides the other.
    const shared =
      !!retGeom &&
      !!outGeom &&
      (returnSameAsOutbound ||
        sameLine(outGeom, [...retGeom].reverse()) ||
        sameLine(outGeom, retGeom));
    const marker = (
      p: RoutePoint,
      html: string,
      size: [number, number],
      anchor: [number, number],
      z = 0,
      onDragEnd?: (ll: Leaflet.LatLng) => void,
    ) => {
      if (!valid(p)) return;
      all.push([p.lat, p.lng]);
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", html, iconSize: size, iconAnchor: anchor }),
        zIndexOffset: z,
        draggable: !!onDragEnd,
      })
        .bindTooltip(`<b>${esc(p.name)}</b>${p.address ? `<br/>${esc(p.address)}` : ""}`, {
          direction: "top",
          offset: [0, -anchor[1] + 4],
        })
        .addTo(layer);
      if (onDragEnd) m.on("dragend", () => onDragEnd(m.getLatLng()));
    };

    for (const a of showOut ? alternatives : []) {
      if (a.id === selectedAlternativeId || !a.geometry.length) continue;
      L.polyline(a.geometry, { color: "#64748b", weight: 5, opacity: 0.45 })
        .bindTooltip(`${a.label} — click to select`, { sticky: true })
        .on("click", () => selectRef.current?.(a.id))
        .addTo(layer);
      all.push(...a.geometry);
    }
    // The drag hit area must stay above the (re)drawn offset lines.
    let hitLine: Leaflet.Polyline | null = null;
    if (shared) {
      const draw = () => {
        offsetLayer.clearLayers();
        const out = offsetLine(L, map, outGeom!, SHARED_OFFSET_PX);
        const ret = offsetLine(L, map, retGeom!, SHARED_OFFSET_PX);
        L.polyline(out, { color: "#ffffff", weight: 7, opacity: 0.9 }).addTo(offsetLayer);
        L.polyline(ret, { color: "#ffffff", weight: 7, opacity: 0.9 }).addTo(offsetLayer);
        L.polyline(ret, { color: RETURN_COLOR, weight: 4 })
          .bindTooltip("Return Trip")
          .addTo(offsetLayer);
        L.polyline(out, { color: OUTBOUND_COLOR, weight: 4 })
          .bindTooltip("Outbound")
          .addTo(offsetLayer);
        hitLine?.bringToFront();
      };
      drawOffsetRef.current = draw;
      draw();
      all.push(...retGeom!);
    } else if (retGeom) {
      L.polyline(retGeom, { color: "#ffffff", weight: 8, opacity: 0.9 }).addTo(layer);
      L.polyline(retGeom, { color: RETURN_COLOR, weight: 5 })
        .bindTooltip("Return Trip")
        .addTo(layer);
      all.push(...retGeom);
    }
    if (outGeom) {
      if (!shared) {
        L.polyline(outGeom, { color: "#ffffff", weight: 8, opacity: 0.9 }).addTo(layer);
        L.polyline(outGeom, { color: OUTBOUND_COLOR, weight: 5 })
          .bindTooltip("Outbound")
          .addTo(layer);
      }
      // Wide transparent hit area: press and drag anywhere on the line to add a via point.
      if (routeDragRef.current) {
        const hit = L.polyline(outGeom, { color: "#000", weight: 18, opacity: 0 }).addTo(layer);
        hitLine = hit;
        hit.on("mouseover", () => map.getContainer().style.setProperty("cursor", "grab"));
        hit.on("mouseout", () => map.getContainer().style.removeProperty("cursor"));
        hit.on("mousedown", (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          map.dragging.disable();
          const handle = L.marker(e.latlng, {
            interactive: false,
            icon: L.divIcon({
              className: "",
              iconSize: [18, 18],
              iconAnchor: [9, 9],
              html: `<div style="width:18px;height:18px;border-radius:9999px;background:white;border:4px solid #2563eb;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
            }),
          }).addTo(map);
          const move = (ev: Leaflet.LeafletMouseEvent) => handle.setLatLng(ev.latlng);
          const up = (ev: Leaflet.LeafletMouseEvent) => {
            map.off("mousemove", move);
            map.off("mouseup", up);
            handle.remove();
            map.dragging.enable();
            // A plain click (no real movement) is not a drag.
            if (map.distance(e.latlng, ev.latlng) < 5) return;
            keepViewRef.current = true;
            routeDragRef.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng });
          };
          map.on("mousemove", move);
          map.on("mouseup", up);
        });
      }
      all.push(...outGeom);
    } else if (showOut && !outboundGeometry?.length) {
      const stops = [origin, ...waypoints, destination]
        .filter(valid)
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (stops.length >= 2)
        L.polyline(stops, { color: "#94a3b8", weight: 3, dashArray: "4 8" })
          .bindTooltip("Route not calculated")
          .addTo(layer);
    }
    for (const t of tolls) {
      if (t.lat == null || t.lng == null) continue;
      if (t.leg === "Outbound" ? !showOut : !showRet) continue;
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;border-radius:5px;background:#f59e0b;border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,.3);color:white;font:700 10px Inter,sans-serif;display:flex;align-items:center;justify-content:center">T</div>`,
        }),
      })
        .bindTooltip(
          `<b>${esc(t.code ? `${t.code} · ` : "")}${esc(t.name)}</b><br/>${t.leg === "Outbound" ? "Outbound" : "Return Trip"} · ${t.vehicleTollGroup}${t.positionApproximate ? "<br/><i>approximate position</i>" : ""}`,
          { direction: "top" },
        )
        .addTo(layer);
    }
    (showOut ? waypoints : []).forEach((w, i) =>
      marker(
        w,
        dotHtml(String(i + 1), OUTBOUND_COLOR),
        [24, 24],
        [12, 12],
        100,
        wpDragRef.current
          ? (ll) => {
              keepViewRef.current = true;
              wpDragRef.current?.(i, { lat: ll.lat, lng: ll.lng });
            }
          : undefined,
      ),
    );
    if (showRet)
      returnWaypoints.forEach((w, i) =>
        marker(w, dotHtml(`R${i + 1}`, RETURN_COLOR), [24, 24], [12, 12], 100),
      );
    marker(origin, pinHtml("A", "#16a34a"), [30, 40], [15, 40], 200);
    marker(destination, pinHtml("B", "#ef4444"), [30, 40], [15, 40], 200);

    const geomChanged = prevGeomRef.current !== outboundGeometry;
    prevGeomRef.current = outboundGeometry;
    if (keepViewRef.current) {
      if (geomChanged) keepViewRef.current = false;
      return;
    }
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
          Loading map…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
          Could not load the map. Check your network connection.
        </div>
      )}

      <div className="absolute right-3 top-3 z-[400] flex flex-col items-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            aria-label="Map layers"
            title="Map layers"
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
