import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Download, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel, Tag, NativeSelect, thClass } from "@/components/movex/common";
import { serviceService } from "@/lib/api";

export const Route = createFileRoute("/service/")({
  head: () => ({
    meta: [
      { title: "Service — MoveX" },
      { name: "description", content: "Service catalog with trucking, customs and freight templates." },
      { property: "og:title", content: "Service — MoveX" },
      { property: "og:description", content: "Service catalog with trucking, customs and freight templates." },
    ],
  }),
  component: ServiceList,
});

function ServiceList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("All Groups");
  const [tpl, setTpl] = useState("All Templates");
  const [status, setStatus] = useState("All Status");
  const all = serviceService.list();
  const rows = all.filter(
    (s) =>
      (s.name + s.code).toLowerCase().includes(q.toLowerCase()) &&
      (group.startsWith("All") || s.group === group) &&
      (tpl.startsWith("All") || s.template === tpl) &&
      (status.startsWith("All") || s.status === status),
  );
  return (
    <div>
      <PageHeader title="Service" subtitle="Danh mục dịch vụ & cấu hình template"
        actions={<>
          <Button variant="outline" onClick={() => toast.success("Đã xuất services.xlsx (demo)")}><Download className="h-4 w-4" />Export</Button>
          <Button onClick={() => navigate({ to: "/service/$id", params: { id: "new" } })}><Plus className="h-4 w-4" />Add Service</Button>
        </>}
      />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm service..." className="pl-9" />
          </div>
          <NativeSelect value={group} onChange={setGroup} options={["All Groups", ...new Set(all.map((s) => s.group))]} />
          <NativeSelect value={tpl} onChange={setTpl} options={["All Templates", "Trucking", "Customs", "Freight"]} />
          <NativeSelect value={status} onChange={setStatus} options={["All Status", "Active", "Draft", "Inactive"]} />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow>{["Service Code", "Service Name", "Level 1 Group", "Template", "Child Services", "Status", "Actions"].map((h) => <TableHead key={h} className={thClass}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate({ to: "/service/$id", params: { id: s.id } })}>
                  <TableCell className="font-semibold text-primary">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.group}</TableCell>
                  <TableCell><Tag tone="tpl">{s.template}</Tag></TableCell>
                  <TableCell>{s.childCount}</TableCell>
                  <TableCell><Tag>{s.status}</Tag></TableCell>
                  <TableCell><Pencil className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
