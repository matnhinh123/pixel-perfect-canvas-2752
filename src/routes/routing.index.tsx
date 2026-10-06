import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Download, Search, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Tag, NativeSelect, thClass } from "@/components/movex/common";
import { routeService, formatVnd, formatDuration, tollTotal } from "@/lib/api";

export const Route = createFileRoute("/routing/")({
  head: () => ({
    meta: [
      { title: "Routing — MoveX" },
      { name: "description", content: "Manage MoveX routes, distances and toll costs." },
      { property: "og:title", content: "Routing — MoveX" },
      { property: "og:description", content: "Manage MoveX routes, distances and toll costs." },
    ],
  }),
  component: RoutingList,
});

function RoutingList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState("All Route Types");
  const [status, setStatus] = useState("All Status");
  const [vehicle, setVehicle] = useState("All Vehicles");
  const rows = useMemo(
    () =>
      routeService.list().filter(
        (r) =>
          (r.name + r.code + r.origin.name + r.destination.name).toLowerCase().includes(q.toLowerCase()) &&
          (type.startsWith("All") || r.type === type) &&
          (status.startsWith("All") || r.status === status) &&
          (vehicle.startsWith("All") || r.vehicleProfile === vehicle),
      ),
    [q, type, status, vehicle],
  );
  return (
    <div>
      <PageHeader
        title="Routing"
        subtitle="Quản lý tuyến đường, khoảng cách và phí cầu đường"
        actions={
          <>
            <Button variant="outline" onClick={() => toast.success("Đã xuất file routes.xlsx (demo)")}><Download className="h-4 w-4" />Export</Button>
            <Button asChild><Link to="/routing/$id" params={{ id: "new" }}><Plus className="h-4 w-4" />Add New Route</Link></Button>
          </>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm route code, tên, điểm..." className="pl-9" />
          </div>
          <NativeSelect value={type} onChange={setType} options={["All Route Types", "Single Trip", "Round Trip"]} />
          <NativeSelect value={status} onChange={setStatus} options={["All Status", "Active", "Draft", "Inactive"]} />
          <NativeSelect value={vehicle} onChange={setVehicle} options={["All Vehicles", "Car", "Motorcycle", "Truck", "Container"]} />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {["Route Code", "Route Name", "Origin", "Destination", "Route Type", "Vehicle Type", "Distance", "Est. Time", "Toll Cost", "Status", "Actions"].map((h) => (
                  <TableHead key={h} className={thClass}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/routing/$id", params: { id: r.id } })}>
                  <TableCell className="font-semibold text-primary">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">{r.origin.name}</TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground">{r.destination.name}</TableCell>
                  <TableCell><Tag>{r.type}</Tag></TableCell>
                  <TableCell>{r.vehicleProfile}</TableCell>
                  <TableCell>{r.distanceKm} km</TableCell>
                  <TableCell>{formatDuration(r.durationMin)}</TableCell>
                  <TableCell className="font-medium">{formatVnd(tollTotal(r.tolls))}</TableCell>
                  <TableCell><Tag>{r.status}</Tag></TableCell>
                  <TableCell>
                    <div className="flex gap-1 text-muted-foreground">
                      <Eye className="h-4 w-4 hover:text-primary" />
                      <Pencil className="h-4 w-4 hover:text-primary" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="py-10 text-center text-muted-foreground">Không có route phù hợp</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
