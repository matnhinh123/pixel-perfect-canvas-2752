import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Calculator, History, Plus, Trash2, MapPin, Clock, Coins, Milestone, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Field, NativeSelect, StatCard, Tag, thClass } from "@/components/movex/common";
import { RouteMapPanel } from "@/components/movex/RouteMapPanel";
import { AuditDrawer } from "@/components/movex/AuditDrawer";
import { routeService, formatVnd, formatDuration, tollTotal, manualTotal } from "@/lib/api";
import type { RouteRecord, RouteType, VehicleProfile, VehicleGroup, Point } from "@/lib/mock-data";

export const Route = createFileRoute("/routing/$id")({
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Create Route — MoveX" : `Route ${params.id} — MoveX` },
      { name: "description", content: "Route detail with map, vehicle profile and toll breakdown." },
      { property: "og:title", content: "Route Detail — MoveX" },
      { property: "og:description", content: "Route detail with map, vehicle profile and toll breakdown." },
    ],
  }),
  component: RouteDetail,
});

const blank: RouteRecord = {
  id: "new", code: "", name: "",
  origin: { name: "", x: 80, y: 200 }, waypoints: [], destination: { name: "", x: 470, y: 110 },
  type: "Single Trip", vehicleProfile: "Truck", vehicleGroup: "Medium Truck", capacityKg: 5000,
  distanceKm: 0, durationMin: 0, status: "Draft", tolls: [], manualCosts: [],
  audit: [{ id: "n1", user: "Nguyễn Minh Anh", time: "—", action: "Draft started" }],
};

function RouteDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const source = routeService.get(id);
  const isNew = !source;
  const [r, setR] = useState<RouteRecord>(() => structuredClone(source ?? blank));
  const [auditOpen, setAuditOpen] = useState(false);
  const [mc, setMc] = useState({ reason: "", amount: "" });
  const set = <K extends keyof RouteRecord>(k: K, v: RouteRecord[K]) => setR((p) => ({ ...p, [k]: v }));
  const heavy = r.vehicleProfile === "Truck" || r.vehicleProfile === "Container";
  const oneWayToll = tollTotal(r.tolls);
  const round = r.type === "Round Trip";
  const totalToll = (round ? oneWayToll * 2 : oneWayToll) + manualTotal(r.manualCosts);

  const calculate = () => {
    if (!r.origin.name || !r.destination.name) return toast.error("Nhập Origin và Destination trước");
    if (r.distanceKm === 0) {
      setR((p) => ({
        ...p, distanceKm: 46.8, durationMin: 70,
        tolls: [{ order: 1, station: "Trạm Long Phước", feeType: "Per pass", tollGroup: "Nhóm 3", unitPrice: 95000, passCount: 1, source: "Auto", x: 280, y: 160 }],
      }));
    }
    toast.success("Đã tính lại tuyến & phí cầu đường (mock)");
  };

  const setWaypoint = (i: number, name: string) => set("waypoints", r.waypoints.map((w, j) => (j === i ? { ...w, name } : w)));
  const addWaypoint = () => {
    const n = r.waypoints.length + 1;
    const wp: Point = { name: "", x: 120 + n * 90, y: 140 + (n % 2) * 50 };
    set("waypoints", [...r.waypoints, wp]);
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: isNew ? "Create Route" : r.code }]}
        title={isNew ? "Create Route" : "Route Detail"}
        subtitle={isNew ? "Tạo tuyến mới" : r.name}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate({ to: "/routing" })}><ArrowLeft className="h-4 w-4" />Back</Button>
            <Button variant="outline" onClick={() => setAuditOpen(true)}><History className="h-4 w-4" />View Audit History</Button>
            <Button variant="secondary" onClick={calculate}><Calculator className="h-4 w-4" />Calculate Route</Button>
            <Button onClick={() => toast.success("Đã lưu route (demo)")}><Save className="h-4 w-4" />Save</Button>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Panel title="Basic Info">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Route Code"><Input value={r.code} onChange={(e) => set("code", e.target.value)} placeholder="RT-XXX" /></Field>
              <Field label="Route Type">
                <div className="flex rounded-md border p-0.5">
                  {(["Single Trip", "Round Trip"] as RouteType[]).map((t) => (
                    <button key={t} onClick={() => set("type", t)} className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold ${r.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
                  ))}
                </div>
              </Field>
              <Field label="Route Name" className="col-span-2"><Input value={r.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Origin" className="col-span-2"><Input value={r.origin.name} onChange={(e) => set("origin", { ...r.origin, name: e.target.value })} placeholder="Điểm đi" /></Field>
              <div className="col-span-2 flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Waypoints</span>
                {r.waypoints.map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="flex h-9 w-7 items-center justify-center text-xs font-bold text-primary">{i + 1}</span>
                    <Input value={w.name} onChange={(e) => setWaypoint(i, e.target.value)} placeholder="Điểm dừng" />
                    <Button variant="ghost" size="icon" onClick={() => set("waypoints", r.waypoints.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="self-start" onClick={addWaypoint}><Plus className="h-4 w-4" />Add Waypoint</Button>
              </div>
              <Field label="Destination" className="col-span-2"><Input value={r.destination.name} onChange={(e) => set("destination", { ...r.destination, name: e.target.value })} placeholder="Điểm đến" /></Field>
            </div>
          </Panel>

          <Panel title="Vehicle Selection">
            <div className="mb-4 grid grid-cols-4 gap-2">
              {(["Car", "Motorcycle", "Truck", "Container"] as VehicleProfile[]).map((v) => (
                <button key={v} onClick={() => set("vehicleProfile", v)} className={`rounded-lg border px-2 py-3 text-xs font-semibold transition ${r.vehicleProfile === v ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary"}`}>{v}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vehicle Group (internal)">
                <NativeSelect value={r.vehicleGroup} onChange={(v) => set("vehicleGroup", v as VehicleGroup)} options={["Light Truck", "Medium Truck", "Heavy Truck", "Tractor / Container Truck"]} />
              </Field>
              {heavy && (
                <Field label="Capacity / Weight (kg)"><Input type="number" value={r.capacityKg ?? ""} onChange={(e) => set("capacityKg", Number(e.target.value))} /></Field>
              )}
            </div>
          </Panel>
        </div>

        <div className="col-span-3 flex flex-col gap-6">
          <Panel title="Map & Route Visualization">
            <RouteMapPanel origin={r.origin} waypoints={r.waypoints} destination={r.destination} tolls={r.tolls} roundTrip={round} />
            <div className="mt-4 grid grid-cols-4 gap-3">
              <StatCard label="Total Distance" value={`${(r.distanceKm * (round ? 2 : 1)).toFixed(1)} km`} icon={<MapPin className="h-4 w-4" />} />
              <StatCard label="Estimated Time" value={formatDuration(r.durationMin * (round ? 2 : 1))} icon={<Clock className="h-4 w-4" />} />
              <StatCard label="Total Toll Cost" value={formatVnd(totalToll)} icon={<Coins className="h-4 w-4" />} />
              <StatCard label="Toll Stations" value={String(r.tolls.length * (round ? 2 : 1))} icon={<Milestone className="h-4 w-4" />} />
            </div>
          </Panel>

          {round && (
            <Panel title="Return Route" actions={
              <div className="flex rounded-md border p-0.5 text-xs">
                {(["auto", "custom"] as const).map((m) => (
                  <button key={m} onClick={() => set("returnMode", m)} className={`rounded px-3 py-1 font-semibold ${(r.returnMode ?? "auto") === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                    {m === "auto" ? "Auto-generate return path" : "Custom return path"}
                  </button>
                ))}
              </div>
            }>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="col-span-4 rounded-lg bg-muted p-3">{r.destination.name || "Destination"} → {[...r.waypoints].reverse().map((w) => w.name).filter(Boolean).join(" → ")}{r.waypoints.length ? " → " : ""}{r.origin.name || "Origin"}</div>
                <StatCard label="Return Distance" value={`${r.distanceKm} km`} />
                <StatCard label="Return Est. Time" value={formatDuration(r.durationMin)} />
                <StatCard label="Return Toll Stations" value={String(r.tolls.length)} />
                <StatCard label="Return Toll Cost" value={formatVnd(oneWayToll)} />
              </div>
              {r.returnMode === "custom" && <p className="mt-3 text-xs text-muted-foreground">Custom mode: kéo thả điểm trên bản đồ để chỉnh đường về (sẽ nối với map thật).</p>}
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Toll Station / Cost Breakdown" className="mt-6" actions={
        !isNew && <Button variant="outline" size="sm" asChild><Link to="/cost/$id" params={{ id: r.id }}><Receipt className="h-4 w-4" />Open Cost Detail</Link></Button>
      }>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>{["#", "Toll Station", "Fee Type", "Vehicle Toll Group", "Unit Price", "Pass Count", "Subtotal", "Source"].map((h) => <TableHead key={h} className={thClass}>{h}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {r.tolls.map((t) => (
                <TableRow key={t.order}>
                  <TableCell>{t.order}</TableCell>
                  <TableCell className="font-medium">{t.station}</TableCell>
                  <TableCell>{t.feeType}</TableCell>
                  <TableCell>{t.tollGroup}</TableCell>
                  <TableCell>{formatVnd(t.unitPrice)}</TableCell>
                  <TableCell>{t.passCount * (round ? 2 : 1)}</TableCell>
                  <TableCell className="font-semibold">{formatVnd(t.unitPrice * t.passCount * (round ? 2 : 1))}</TableCell>
                  <TableCell><Tag>{t.source}</Tag></TableCell>
                </TableRow>
              ))}
              {r.tolls.length === 0 && <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Bấm "Calculate Route" để tính trạm thu phí</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Manual Adjustments</h3>
          {r.manualCosts.map((m) => (
            <div key={m.id} className="mb-2 flex items-center justify-between rounded-lg border bg-warning-soft/50 px-3 py-2 text-sm">
              <span>{m.reason}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{formatVnd(m.amount)}</span>
                <Button variant="ghost" size="icon" onClick={() => set("manualCosts", r.manualCosts.filter((x) => x.id !== m.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="flex items-end gap-3">
            <Field label="Reason" className="flex-1"><Input value={mc.reason} onChange={(e) => setMc({ ...mc, reason: e.target.value })} placeholder="VD: Phụ phí phà ban đêm" /></Field>
            <Field label="Amount (₫)" className="w-48"><Input type="number" value={mc.amount} onChange={(e) => setMc({ ...mc, amount: e.target.value })} /></Field>
            <Button variant="outline" onClick={() => {
              if (!mc.reason || !mc.amount) return toast.error("Nhập lý do và số tiền");
              set("manualCosts", [...r.manualCosts, { id: crypto.randomUUID(), reason: mc.reason, amount: Number(mc.amount) }]);
              setMc({ reason: "", amount: "" });
            }}><Plus className="h-4 w-4" />Add Manual Cost</Button>
          </div>
          <div className="mt-4 flex justify-end text-sm">
            <div className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-foreground">Total Toll Cost: {formatVnd(totalToll)}</div>
          </div>
        </div>
      </Panel>

      <AuditDrawer open={auditOpen} onOpenChange={setAuditOpen} title={r.code || "New route"} entries={r.audit} />
    </div>
  );
}
