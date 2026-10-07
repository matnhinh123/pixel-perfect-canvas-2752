import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Panel, Tag, thClass } from "@/components/movex/common";
import { useTemplateConfig } from "@/hooks/use-store";
import { formName, TEMPLATE_FIELDS } from "@/mock-data/templates";
import { rootOf, serviceCatalogService, templateOf } from "@/services/serviceCatalogService";
import type { ServiceRecord, TenantFieldSetting } from "@/types";

/** Tab "Cấu hình form": Visible / Required per field of the form the service inherits. */
export function ServiceFormConfig({
  service,
  services,
}: {
  service: ServiceRecord;
  services: ServiceRecord[];
}) {
  const cfg = useTemplateConfig();
  const form = templateOf(service, services);
  const root = rootOf(service, services);
  const inherited = !!service.parentId;
  const saved = form ? serviceCatalogService.fieldSettings(form, cfg) : {};
  const savedSig = JSON.stringify(saved);
  const [draft, setDraft] = useState<Record<string, TenantFieldSetting>>(saved);
  useEffect(() => setDraft(JSON.parse(savedSig) as Record<string, TenantFieldSetting>), [savedSig]);

  if (!form)
    return (
      <Panel title="Cấu hình form">
        <EmptyState title="Dịch vụ chưa có Form" description="Chọn Form cho dịch vụ gốc trước." />
      </Panel>
    );

  const dirty = JSON.stringify(draft) !== savedSig;
  const set = (key: string, patch: Partial<TenantFieldSetting>) =>
    setDraft((d) => {
      const next = { ...d[key]!, ...patch };
      if (!next.visible) next.required = false;
      return { ...d, [key]: next };
    });
  const save = () => {
    const n = serviceCatalogService.saveTemplateConfig(form, draft, {
      id: service.id,
      label: service.code,
    });
    toast.success(n ? `Đã lưu cấu hình ${formName(form)}` : "Không có thay đổi");
  };

  return (
    <Panel
      title="Cấu hình form"
      bodyClassName="p-0"
      actions={
        !inherited && dirty ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(saved)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <span className="text-muted-foreground">Form:</span>
        <Tag tone="tpl">{formName(form)}</Tag>
        {inherited ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Kế thừa từ {root.name}
            </span>
            <Link
              to="/service/$id"
              params={{ id: root.id }}
              search={{ mode: "view", tab: "form" }}
              className="ml-auto text-xs font-semibold text-primary hover:underline"
            >
              Chỉnh ở {root.name} →
            </Link>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Áp dụng cho mọi dịch vụ dùng {formName(form)}.
          </span>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={thClass}>Trường</TableHead>
            <TableHead className={`${thClass} w-32 text-center`}>Hiển thị</TableHead>
            <TableHead className={`${thClass} w-32 text-center`}>Bắt buộc</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {TEMPLATE_FIELDS[form].map((def) => {
            const s = draft[def.key] ?? { visible: true, required: false };
            const locked = def.coreMandatory;
            const disabled = locked || inherited;
            return (
              <TableRow key={def.key}>
                <TableCell className="py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {def.label}
                    {locked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} aria-label="Trường cố định">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Trường cố định, luôn hiển thị và bắt buộc</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-center">
                  <Switch
                    checked={s.visible}
                    disabled={disabled}
                    aria-label={`Hiển thị ${def.label}`}
                    onCheckedChange={(v) => set(def.key, { visible: v })}
                  />
                </TableCell>
                <TableCell className="py-2.5 text-center">
                  <Switch
                    checked={s.required}
                    disabled={disabled || !s.visible}
                    aria-label={`Bắt buộc ${def.label}`}
                    onCheckedChange={(v) => set(def.key, { required: v })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
