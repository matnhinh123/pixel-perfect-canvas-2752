// Interactive route map (Leaflet + OpenStreetMap tiles). Renders whatever geometry the RouteProvider
// returned — real Vietmap geometry when a key is configured, mock geometry otherwise.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Crosshair, Loader2 } from "lucide-react";
import type { RoutePoint, TollStation } from "@/types";
import { formatVnd } from "@/lib/format";

export interface MapToll extends TollStation {
  leg: "Outbound" | "Return";
}

const valid = (p: RoutePoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

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
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const boundsRef = useRef<Leaflet.LatLngBounds | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el.current) return;
        const L =
          (mod as unknown as { default?: typeof Leaflet }).default ??
          (mod as unknown as typeof Leaflet);
        LRef.current = L;
        const map = L.map(el.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          attributionControl: true,
        }).setView([16.0, 106.5], 6);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
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

  // Redraw overlays whenever route data changes.
  const fitKey = JSON.stringify([
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    waypoints.map((w) => [w.lat, w.lng]),
    outboundGeometry?.length,
    returnGeometry?.length,
    roundTrip,
  ]);
  useEffect(() => {
    const L = LRef.current,
      map = mapRef.current,
      layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const all: [number, number][] = [];

    const pin = (p: RoutePoint, label: string, cls: string, size = 26) => {
      if (!valid(p)) return;
      all.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div class="flex items-center justify-center rounded-full border-[3px] border-white text-[11px] font-bold text-white shadow ${cls}" style="width:${size}px;height:${size}px">${label}</div>`,
        }),
      })
        .bindTooltip(`<b>${esc(p.name)}</b>${p.address ? `<br/>${esc(p.address)}` : ""}`, {
          direction: "top",
          offset: [0, -size / 2],
        })
        .addTo(layer);
    };

    if (roundTrip && returnGeometry?.length) {
      L.polyline(returnGeometry, {
        color: "#16a34a",
        weight: 4,
        dashArray: "8 6",
        className: "stroke-success",
      })
        .bindTooltip("Return")
        .addTo(layer);
      all.push(...returnGeometry);
    }
    if (outboundGeometry?.length) {
      L.polyline(outboundGeometry, {
        color: "#2563eb",
        weight: 6,
        opacity: 0.9,
        className: "stroke-primary",
      })
        .bindTooltip("Outbound")
        .addTo(layer);
      all.push(...outboundGeometry);
    } else {
      // Not calculated yet: dashed straight preview between the stops.
      const stops = [origin, ...waypoints, destination]
        .filter(valid)
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (stops.length >= 2)
        L.polyline(stops, { color: "#94a3b8", weight: 3, dashArray: "4 8" })
          .bindTooltip("Not calculated — click Calculate Route")
          .addTo(layer);
    }
    waypoints.forEach((w, i) =>
      pin(w, String(i + 1), "bg-white text-primary! border-primary!", 22),
    );
    if (roundTrip)
      returnWaypoints.forEach((w, i) =>
        pin(w, `R${i + 1}`, "bg-white text-success! border-success!", 22),
      );
    for (const t of tolls) {
      if (t.lat == null || t.lng == null) continue;
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div class="flex h-5 w-5 items-center justify-center rounded-[5px] border-2 border-white bg-warning text-[10px] font-bold text-white shadow">₫</div>`,
        }),
      })
        .bindTooltip(
          `<b>${esc(t.name)}</b><br/>${t.leg} · ${t.feeType} · ${t.vehicleTollGroup}<br/>${formatVnd(t.price)}${t.positionApproximate ? "<br/><i>approx. position</i>" : ""}`,
          { direction: "top" },
        )
        .addTo(layer);
    }
    pin(origin, "A", "bg-success");
    pin(destination, "B", "bg-destructive");

    if (all.length) {
      boundsRef.current = L.latLngBounds(all);
      map.fitBounds(boundsRef.current, { padding: [36, 36], maxZoom: 14 });
    }
  }, [ready, fitKey, tolls.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-lg border bg-map-bg" style={{ height }}>
      <div ref={el} className="absolute inset-0 z-0" />
      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading map…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
          Map failed to load. Check your connection.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-3 rounded-md bg-card/95 px-3 py-1.5 text-xs shadow">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" />
          Origin
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border-2 border-primary" />
          Waypoint
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Destination
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-warning" />
          Toll
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-primary" />
          Outbound
        </span>
        {roundTrip && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 border-t-2 border-dashed border-success" />
            Return
          </span>
        )}
      </div>
      <div className="absolute right-3 top-3 z-[400] flex items-center gap-2">
        {providerLabel && (
          <span className="rounded-md bg-card/95 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow">
            {providerLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            boundsRef.current &&
            mapRef.current?.fitBounds(boundsRef.current, { padding: [36, 36], maxZoom: 14 })
          }
          className="rounded-md bg-card/95 p-1.5 text-muted-foreground shadow hover:text-primary"
          aria-label="Fit route"
          title="Fit to route"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
