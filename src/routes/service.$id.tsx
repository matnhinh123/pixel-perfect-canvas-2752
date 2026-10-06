import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Panel, Field, NativeSelect } from "@/components/movex/common";
import { serviceService } from "@/lib/api";
import { templateFields, type TemplateType, type FieldConfig, type Status } from "@/lib/mock-data";

export const Route = createFileRoute("/service/$id")({
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Add Service — MoveX" : `Service ${params.id} — MoveX` },
      { name: "description", content: "Edit service and per-tenant field configuration." },
      { property: "og:title", content: "Service Detail — MoveX" },
      { property: "og:description", content: "Edit service and per-tenant field configuration." },
    ],
  }),
  component: ServiceDetail,
});

const templates: TemplateType[] = ["Trucking", "Customs", "Freight"];

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const s = serviceService.get(id);
  const [form, setForm] = useState({
    code: s?.code ?? "", name: s?.name ?? "", group: s?.group ?? "Vận tải đường bộ",
    template: (s?.template ?? "Trucking") as TemplateType, description: s?.description ?? "", status: (s?.status ?? "Draft") as Status,
  });
  const [fields, setFields] = useState<Record<TemplateType, FieldConfig[]>>(() => structuredClone(templateFields));
  const [view, setView] = useState<TemplateType>(form.template);

  const toggle = (t: TemplateType, key: string, prop: "visible" | "required") =>
    setFields((f) => ({
      ...f,
      [t]: f[t].map((x) => {
        if (x.key !== key) return x;
        const next = { ...x, [prop]: !x[prop] };
        if (prop === "visible" && !next.visible) next.required = false;
        if (prop === "required" && next.required) next.visible = true;
        return next;
      }),
    }));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Service", to: "/service" }, { label: s ? s.code : "Add Service" }]}
        title={s ? "Service Detail" : "Add Service"} subtitle={s?.name}
        actions={<>
          <Button variant="outline" onClick={() => navigate({ to: "/service" })}><ArrowLeft className="h-4 w-4" />Back</Button>
          <Button onClick={() => toast.success("Đã lưu service (demo)")}><Save className="h-4 w-4" />Save</Button>
        </>}
      />
      <div className="grid grid-cols-5 gap-6">
        <Panel title="General" className="col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Service Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Status"><NativeSelect value={form.status} onChange={(v) => setForm({ ...form, status: v as Status })} options={["Active", "Draft", "Inactive"]} /></Field>
            <Field label="Service Name" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Parent Group" className="col-span-2"><NativeSelect value={form.group} onChange={(v) => setForm({ ...form, group: v })} options={["Vận tải đường bộ", "Thủ tục hải quan", "Cước quốc tế"]} /></Field>
            <Field label="Template Type" className="col-span-2">
              <div className="grid grid-cols-3 gap-2">
                {templates.map((t) => (
                  <button key={t} onClick={() => { setForm({ ...form, template: t }); setView(t); }} className={`rounded-lg border py-2 text-sm font-semibold ${form.template === t ? "border-primary bg-accent text-accent-foreground" : "hover:border-primary"}`}>{t}</button>
                ))}
              </div>
            </Field>
            <Field label="Description" className="col-span-2"><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        </Panel>

        <Panel title="Field Configuration by Tenant" className="col-span-3" actions={
          <div className="flex rounded-md border p-0.5 text-xs">
            {templates.map((t) => (
              <button key={t} onClick={() => setView(t)} className={`rounded px-3 py-1 font-semibold ${view === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t}</button>
            ))}
          </div>
        }>
          <p className="mb-3 text-xs text-muted-foreground">Bật/tắt hiển thị và bắt buộc cho các field không cố định. Tenant: MoveX Việt Nam.</p>
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_100px_100px] bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{view} field</span><span className="text-center">Visible</span><span className="text-center">Required</span>
            </div>
            {fields[view].map((f) => (
              <div key={f.key} className="grid grid-cols-[1fr_100px_100px] items-center border-t px-4 py-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {f.label}
                  {f.mandatory && <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Lock className="h-3 w-3" />System</span>}
                </span>
                <div className="flex justify-center"><Switch checked={f.visible} disabled={f.mandatory} onCheckedChange={() => toggle(view, f.key, "visible")} /></div>
                <div className="flex justify-center"><Switch checked={f.required} disabled={f.mandatory} onCheckedChange={() => toggle(view, f.key, "required")} /></div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-dashed p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground">PREVIEW — form đơn hàng</div>
            <div className="grid grid-cols-2 gap-3">
              {fields[view].filter((f) => f.visible).map((f) => (
                <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}><Input placeholder={f.label} /></Field>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
