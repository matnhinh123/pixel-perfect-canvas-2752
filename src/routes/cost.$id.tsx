import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, History, Route as RouteIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Tag, thClass } from "@/components/movex/common";
import { AuditDrawer } from "@/components/movex/AuditDrawer";
import { routeService, cogs, formatVnd, tollTotal, manualTotal } from "@/lib/api";

export const Route = createFileRoute("/cost/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Toll Cost TC-${params.id} — MoveX` },
      { name: "description", content: "Toll cost breakdown and COGS summary for a route." },
      { property: "og:title", content: "Toll Cost Detail — MoveX" },
      { property: "og:description", content: "Toll cost breakdown and COGS summary for a route." },
    ],
  }),
  component: CostDetail,
});

function CostDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const r = routeService.get(id);
  const [auditOpen, setAuditOpen] = useState(false);
  if (!r) return <Panel>Không tìm thấy cost record. <Link to="/cost" className="text-primary">Quay lại</Link></Panel>;
  const legs = r.type === "Round Trip" ? 2 : 1;
  const c = cogs(r);
  const tollSum = tollTotal(r.tolls) * legs;
  const summary = [
    ["Fixed Cost", c.fixed], ["Driver Cost", c.driver], ["Variable Cost", c.variable], ["Toll Cost", c.toll], ["Ferry Cost", c.ferry],
  ] as const;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Cost", to: "/cost" }, { label: `TC-${r.id}` }]}
        title="Toll Cost Detail" subtitle={`${r.code} · ${r.name}`}
        actions={<>
          <Button variant="outline" onClick={() => navigate({ to: "/cost" })}><ArrowLeft className="h-4 w-4" />Back</Button>
          <Button variant="outline" asChild><Link to="/routing/$id" params={{ id: r.id }}><RouteIcon className="h-4 w-4" />Open Route</Link></Button>
          <Button variant="outline" onClick={() => setAuditOpen(true)}><History className="h-4 w-4" />Audit</Button>
          <Button onClick={() => toast.success("Đã lưu version mới (demo)")}><Save className="h-4 w-4" />Save</Button>
        </>}
      />
      <div className="mb-6 grid grid-cols-4 gap-4">
        {[["Route", r.code], ["Vehicle Group", r.vehicleGroup], ["Effective Date", "2026-10-01"], ["Version", "v3 (current)"]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">{k}</div>
            <div className="mt-1 font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Panel title={`Toll Breakdown ${legs === 2 ? "(Round Trip ×2)" : ""}`}>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader><TableRow>{["#", "Station", "Fee Type", "Group", "Unit Price", "Passes", "Subtotal", "Source"].map((h) => <TableHead key={h} className={thClass}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {r.tolls.map((t) => (
                    <TableRow key={t.order}>
                      <TableCell>{t.order}</TableCell>
                      <TableCell className="font-medium">{t.station}</TableCell>
                      <TableCell>{t.feeType}</TableCell>
                      <TableCell>{t.tollGroup}</TableCell>
                      <TableCell>{formatVnd(t.unitPrice)}</TableCell>
                      <TableCell>{t.passCount * legs}</TableCell>
                      <TableCell className="font-semibold">{formatVnd(t.unitPrice * t.passCount * legs)}</TableCell>
                      <TableCell><Tag>{t.source}</Tag></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
          <Panel title="Manual Surcharge Lines">
            {r.manualCosts.length === 0 ? <p className="text-sm text-muted-foreground">Không có phụ phí thủ công.</p> :
              r.manualCosts.map((m) => (
                <div key={m.id} className="mb-2 flex justify-between rounded-lg border bg-warning-soft/50 px-3 py-2 text-sm">
                  <span>{m.reason}</span><span className="font-semibold">{formatVnd(m.amount)}</span>
                </div>
              ))}
            <div className="mt-4 flex justify-end gap-6 border-t pt-4 text-sm">
              <span>Tolls: <b>{formatVnd(tollSum)}</b></span>
              <span>Manual: <b>{formatVnd(manualTotal(r.manualCosts))}</b></span>
              <span className="text-primary">Total Cost: <b>{formatVnd(tollSum + manualTotal(r.manualCosts))}</b></span>
            </div>
          </Panel>
        </div>
        <Panel title="COGS / Cost Summary">
          <div className="flex flex-col gap-3">
            {summary.map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{formatVnd(v)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(v / c.total) * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-2 rounded-lg bg-primary p-4 text-primary-foreground">
              <div className="text-xs opacity-80">Total Estimated Cost</div>
              <div className="text-2xl font-bold">{formatVnd(c.total)}</div>
              <div className="text-xs opacity-80">{r.distanceKm * legs} km · {r.type}</div>
            </div>
          </div>
        </Panel>
      </div>
      <AuditDrawer open={auditOpen} onOpenChange={setAuditOpen} title={`TC-${r.id} · ${r.code}`} entries={r.audit} />
    </div>
  );
}
