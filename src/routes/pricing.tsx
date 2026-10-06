import { createFileRoute } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Tag, thClass } from "@/components/movex/common";
import { pricingInputs } from "@/lib/mock-data";
import { formatVnd } from "@/lib/api";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — MoveX" },
      { name: "description", content: "Price lists built from MoveX cost inputs." },
      { property: "og:title", content: "Pricing — MoveX" },
      { property: "og:description", content: "Price lists built from MoveX cost inputs." },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Pricing" subtitle="Bảng giá (module sẽ phát triển ở giai đoạn sau)" />
      <Panel>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow>{["Code", "Route", "Service", "COGS", "Margin", "Sell Price", "Status"].map((h) => <TableHead key={h} className={thClass}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {pricingInputs.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="font-semibold text-primary">{p.code}</TableCell>
                  <TableCell>{p.route}</TableCell><TableCell>{p.service}</TableCell>
                  <TableCell>{formatVnd(p.cogs)}</TableCell><TableCell>{p.margin}%</TableCell>
                  <TableCell className="font-semibold">{formatVnd(p.cogs / (1 - p.margin / 100))}</TableCell>
                  <TableCell><Tag>{p.status}</Tag></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  ),
});
