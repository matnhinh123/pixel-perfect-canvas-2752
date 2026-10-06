import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Tag, thClass } from "@/components/movex/common";
import { routeService, routeTollCost, formatVnd } from "@/lib/api";
import { operatingCosts, pricingInputs } from "@/lib/mock-data";

export const Route = createFileRoute("/cost/")({
  head: () => ({
    meta: [
      { title: "Cost — MoveX" },
      { name: "description", content: "Toll, operating cost and pricing inputs for MoveX routes." },
      { property: "og:title", content: "Cost — MoveX" },
      { property: "og:description", content: "Toll, operating cost and pricing inputs for MoveX routes." },
    ],
  }),
  component: CostList,
});

const tabs = ["Toll Cost", "Operating Cost", "Pricing Input"] as const;

function CostList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Toll Cost");
  const [q, setQ] = useState("");
  const m = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const head = (cols: string[]) => <TableHeader><TableRow>{cols.map((h) => <TableHead key={h} className={thClass}>{h}</TableHead>)}</TableRow></TableHeader>;

  return (
    <div>
      <PageHeader title="Cost" subtitle="Chi phí cầu đường, vận hành và đầu vào định giá"
        actions={<Button variant="outline" onClick={() => toast.success("Đã xuất costs.xlsx (demo)")}><Download className="h-4 w-4" />Export</Button>} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{t}</button>
            ))}
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm..." className="pl-9" />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            {tab === "Toll Cost" && <>
              {head(["Cost ID", "Route", "Vehicle Group", "Effective Date", "Version", "Stations", "Total Toll", "Status"])}
              <TableBody>
                {routeService.list().filter((r) => m(r.code + r.name)).map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/cost/$id", params: { id: r.id } })}>
                    <TableCell className="font-semibold text-primary">TC-{r.id}</TableCell>
                    <TableCell><div className="font-medium">{r.code}</div><div className="text-xs text-muted-foreground">{r.name}</div></TableCell>
                    <TableCell>{r.vehicleGroup}</TableCell>
                    <TableCell>2026-10-01</TableCell>
                    <TableCell>v{r.audit.length > 3 ? 3 : 1}</TableCell>
                    <TableCell>{r.tolls.length}</TableCell>
                    <TableCell className="font-semibold">{formatVnd(routeTollCost(r))}</TableCell>
                    <TableCell><Tag>{r.status}</Tag></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>}
            {tab === "Operating Cost" && <>
              {head(["Code", "Name", "Category", "Vehicle Group", "Unit", "Amount", "Status"])}
              <TableBody>
                {operatingCosts.filter((c) => m(c.code + c.name)).map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-semibold text-primary">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><Tag tone="cat">{c.category}</Tag></TableCell>
                    <TableCell>{c.vehicleGroup}</TableCell>
                    <TableCell>{c.unit}</TableCell>
                    <TableCell className="font-semibold">{formatVnd(c.amount)}</TableCell>
                    <TableCell><Tag>{c.status}</Tag></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>}
            {tab === "Pricing Input" && <>
              {head(["Code", "Route", "Service", "COGS", "Target Margin", "Suggested Price", "Status"])}
              <TableBody>
                {pricingInputs.filter((p) => m(p.code + p.route + p.service)).map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-semibold text-primary">{p.code}</TableCell>
                    <TableCell>{p.route}</TableCell>
                    <TableCell>{p.service}</TableCell>
                    <TableCell>{formatVnd(p.cogs)}</TableCell>
                    <TableCell>{p.margin}%</TableCell>
                    <TableCell className="font-semibold">{formatVnd(p.cogs / (1 - p.margin / 100))}</TableCell>
                    <TableCell><Tag>{p.status}</Tag></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>}
          </Table>
        </div>
      </Panel>
    </div>
  );
}
