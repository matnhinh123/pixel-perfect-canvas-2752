// Placeholder map. Replace internals with Google Maps / Mapbox later; keep the props contract.
import type { Point, TollLine } from "@/lib/mock-data";

export function RouteMapPanel({ origin, waypoints, destination, tolls, roundTrip }: { origin: Point; waypoints: Point[]; destination: Point; tolls: TollLine[]; roundTrip?: boolean }) {
  const pts = [origin, ...waypoints, destination];
  const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const ret = [...pts].reverse().map((p) => `${p.x},${p.y + 14}`).join(" ");
  return (
    <div className="relative overflow-hidden rounded-lg border bg-map-bg">
      <svg viewBox="0 0 560 300" className="h-[340px] w-full">
        <path d="M0 270 Q 140 230 280 280 T 560 250 V300 H0Z" className="fill-map-water" />
        <circle cx="420" cy="60" r="45" className="fill-map-park" />
        <circle cx="130" cy="110" r="30" className="fill-map-park" />
        {[40, 110, 190, 260].map((y) => <line key={y} x1="0" x2="560" y1={y} y2={y + 20} className="stroke-map-road" strokeWidth="6" />)}
        {[60, 180, 320, 450].map((x) => <line key={x} x1={x} x2={x + 30} y1="0" y2="300" className="stroke-map-road" strokeWidth="6" />)}
        {roundTrip && <polyline points={ret} fill="none" className="stroke-success" strokeWidth="3" strokeDasharray="6 5" />}
        <polyline points={path} fill="none" className="stroke-primary" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        {tolls.map((t) => (
          <g key={t.order}>
            <rect x={t.x - 9} y={t.y - 9} width="18" height="18" rx="4" className="fill-warning stroke-card" strokeWidth="2" />
            <text x={t.x} y={t.y + 4} textAnchor="middle" className="fill-card text-[10px] font-bold">₫</text>
          </g>
        ))}
        {waypoints.map((w, i) => (
          <g key={i}>
            <circle cx={w.x} cy={w.y} r="8" className="fill-card stroke-primary" strokeWidth="3" />
            <text x={w.x} y={w.y - 13} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">{w.name}</text>
          </g>
        ))}
        {[{ p: origin, c: "fill-success", l: "A" }, { p: destination, c: "fill-destructive", l: "B" }].map(({ p, c, l }) => (
          <g key={l}>
            <circle cx={p.x} cy={p.y} r="12" className={`${c} stroke-card`} strokeWidth="3" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-card text-[11px] font-bold">{l}</text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-3 left-3 flex gap-3 rounded-md bg-card/95 px-3 py-1.5 text-xs shadow">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Origin</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-primary" />Waypoint</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Destination</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning" />Toll</span>
        {roundTrip && <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-success" />Return</span>}
      </div>
      <div className="absolute right-3 top-3 rounded-md bg-card/95 px-2 py-1 text-[10px] text-muted-foreground shadow">Mock map · RouteMapPanel</div>
    </div>
  );
}
