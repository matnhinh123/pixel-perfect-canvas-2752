import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tag } from "@/components/movex/common";
import { formName } from "@/mock-data/templates";
import { levelOf, templateOf, treeOrder } from "@/services/serviceCatalogService";
import type { ServiceRecord } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** "Trucking › Inland Trucking" */
const servicePathLabel = (s: ServiceRecord, list: ServiceRecord[]): string => {
  const names: string[] = [];
  let cur: ServiceRecord | undefined = s;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    names.unshift(cur.name);
    const pid: string | null = cur.parentId;
    cur = pid ? list.find((x) => x.id === pid) : undefined;
  }
  return names.join(" › ");
};

/** Pick "Dịch vụ cha" from the service tree (indented, searchable). Empty = root service. */
export function ServiceTreePicker({
  services,
  value,
  onChange,
  excludeIds,
  invalid,
}: {
  services: ServiceRecord[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** The service itself and its descendants cannot become its parent. */
  excludeIds: Set<string>;
  invalid?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const noneLabel = t("— Không có (dịch vụ gốc)", "— None (root service)");
  const options = useMemo(
    () => treeOrder(services).filter((s) => !excludeIds.has(s.id)),
    [services, excludeIds],
  );
  const selected = value ? services.find((s) => s.id === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-invalid={invalid || undefined}
            className={cn(
              "flex h-9 w-full items-center rounded-md border border-input bg-card pl-3 pr-16 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              invalid && "border-destructive",
            )}
          >
            {selected ? (
              <span className="truncate">{servicePathLabel(selected, services)}</span>
            ) : (
              <span className="text-muted-foreground">{noneLabel}</span>
            )}
          </button>
        </PopoverTrigger>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <ChevronDown className="h-4 w-4" />
        </span>
        {selected && (
          <button
            type="button"
            aria-label={t("Bỏ chọn dịch vụ cha", "Clear parent service")}
            onClick={() => onChange(null)}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={t("Tìm mã, tên dịch vụ…", "Search service code, name…")} />
          <CommandList>
            <CommandEmpty>{t("Không tìm thấy dịch vụ.", "No service found.")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("__root Không có dịch vụ gốc", "__root None root service")}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <span className="flex-1 text-muted-foreground">{noneLabel}</span>
                {!value && <Check className="h-4 w-4 text-primary" />}
              </CommandItem>
              {options.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.id} ${s.code} ${s.name}`}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <span
                    className="flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: (levelOf(s, services) - 1) * 16 }}
                  >
                    <span className={cn("truncate", !s.parentId && "font-semibold")}>{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.code}</span>
                    {s.status === "Inactive" && (
                      <span className="text-xs text-muted-foreground">(Inactive)</span>
                    )}
                  </span>
                  {!s.parentId && <Tag tone="tpl">{formName(templateOf(s, services))}</Tag>}
                  {s.id === value && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
