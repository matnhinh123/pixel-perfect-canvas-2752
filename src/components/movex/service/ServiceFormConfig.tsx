import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
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
import { formName, TEMPLATE_FIELDS } from "@/mock-data/templates";
import type { TemplateType, TenantFieldSetting } from "@/types";
import { useT } from "@/lib/i18n";

export type FieldSettings = Record<string, TenantFieldSetting>;

/**
 * Tab "Default Template Settings": Visible / Required per field of the template the service uses.
 * Read-only without `onChange` (view); editable in the Create / Edit form, saved with the service.
 */
export function ServiceFormConfig({
  form,
  root,
  inherited,
  value,
  onChange,
}: {
  form: TemplateType | null;
  /** Root service the template comes from. */
  root: { id?: string; name: string };
  /** Child service: the template and its settings belong to the root. */
  inherited: boolean;
  value: FieldSettings;
  onChange?: (v: FieldSettings) => void;
}) {
  const { t } = useT();
  const readOnly = !onChange;

  if (!form)
    return (
      <Panel title={t("Cấu hình Default Template", "Default Template Settings")}>
        <EmptyState
          title={t("Dịch vụ chưa có Default Template", "This service has no Default Template yet")}
          description={t(
            "Chọn Default Template cho dịch vụ gốc trước.",
            "Select a Default Template for the root service first.",
          )}
        />
      </Panel>
    );

  const set = (key: string, patch: Partial<TenantFieldSetting>) => {
    const next = { ...value[key]!, ...patch };
    if (!next.visible) next.required = false;
    onChange?.({ ...value, [key]: next });
  };

  return (
    <Panel title={t("Cấu hình Default Template", "Default Template Settings")} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <span className="text-muted-foreground">Default Template:</span>
        <Tag tone="tpl">{formName(form)}</Tag>
        {inherited ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              {t(`Kế thừa từ ${root.name}`, `Inherited from ${root.name}`)}
            </span>
            {readOnly && root.id && (
              <Link
                to="/service/$id"
                params={{ id: root.id }}
                search={{ mode: "view", tab: "form" }}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                {t(`Xem ở ${root.name} →`, `Open ${root.name} →`)}
              </Link>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t(
              `Áp dụng cho mọi dịch vụ dùng ${formName(form)}.`,
              `Applies to every service using ${formName(form)}.`,
            )}
          </span>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={thClass}>{t("Trường", "Field")}</TableHead>
            <TableHead className={`${thClass} w-32 text-center`}>
              {t("Hiển thị", "Visible")}
            </TableHead>
            <TableHead className={`${thClass} w-32 text-center`}>
              {t("Bắt buộc", "Required")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {TEMPLATE_FIELDS[form].map((def) => {
            const s = value[def.key] ?? { visible: true, required: false };
            const locked = def.coreMandatory;
            const disabled = readOnly || locked || inherited;
            const label = t(def.label, def.labelEn);
            return (
              <TableRow key={def.key}>
                <TableCell className="py-2.5 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {locked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} aria-label={t("Trường cố định", "Locked field")}>
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(
                            "Trường cố định, luôn hiển thị và bắt buộc",
                            "Locked field, always visible and required",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-center">
                  <Switch
                    checked={s.visible}
                    disabled={disabled}
                    aria-label={t(`Hiển thị ${label}`, `${label} visible`)}
                    onCheckedChange={(v) => set(def.key, { visible: v })}
                  />
                </TableCell>
                <TableCell className="py-2.5 text-center">
                  <Switch
                    checked={s.required}
                    disabled={disabled || !s.visible}
                    aria-label={t(`Bắt buộc ${label}`, `${label} required`)}
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
