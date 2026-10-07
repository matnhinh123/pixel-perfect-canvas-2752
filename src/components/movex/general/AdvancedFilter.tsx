import { useEffect, useState } from "react";
import { Filter, History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/movex/common";
import type { FilterCondition, FilterOperator } from "@/types";
import {
  describeCondition,
  OPERATOR_LABEL,
  OPERATORS_BY_TYPE,
  type FieldMeta,
} from "@/services/filterService";
import { preferenceService, type RecentFilter } from "@/services/preferenceService";
import { uid } from "@/repositories/storage";
import { useT } from "./listLang";

const blank = (f: FieldMeta): FilterCondition => ({
  id: uid("f-"),
  field: f.key,
  operator: OPERATORS_BY_TYPE[f.type][0]!,
  value: "",
});

/** GEN-06 Advanced Filter: multiple AND conditions, =, ≠, contains, number range, date range + recent filters. */
export function AdvancedFilter({
  screen,
  fields,
  value,
  onApply,
}: {
  screen: string;
  fields: FieldMeta[];
  value: FilterCondition[];
  onApply: (c: FilterCondition[]) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterCondition[]>(value);
  const [recent, setRecent] = useState<RecentFilter[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(value.length ? value : fields[0] ? [blank(fields[0])] : []);
      setRecent(preferenceService.getRecentFilters(screen));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, patch: Partial<FilterCondition>) =>
    setDraft((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const fieldOf = (key: string) => fields.find((f) => f.key === key) ?? fields[0]!;

  const apply = (conds: FilterCondition[]) => {
    const active = conds.filter((c) => c.value !== "" || (c.value2 ?? "") !== "");
    onApply(active);
    if (active.length)
      preferenceService.pushRecentFilter(screen, {
        id: uid("rf-"),
        label: active.map((c) => describeCondition(c, fields)).join(" AND "),
        conditions: active,
        savedAt: new Date().toISOString(),
      });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={value.length ? "secondary" : "outline"} className="h-10">
          <Filter className="h-4 w-4" />
          {t("Bộ lọc", "Filter")}
          {value.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {value.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[620px] p-0">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">{t("Bộ lọc nâng cao", "Filter")}</div>
          <div className="text-xs text-muted-foreground">
            {t("Các điều kiện được kết hợp bằng AND.", "All conditions must match (AND).")}
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                "Chưa có điều kiện. Thêm điều kiện bên dưới.",
                "No conditions yet. Add one below.",
              )}
            </p>
          )}
          {draft.map((c, i) => {
            const f = fieldOf(c.field);
            const inputType = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
            return (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-10 text-right text-xs font-semibold text-muted-foreground">
                  {i === 0 ? t("NẾU", "IF") : t("VÀ", "AND")}
                </span>
                <NativeSelect
                  className="w-44"
                  value={c.field}
                  onChange={(v) => {
                    const nf = fieldOf(v);
                    set(c.id, {
                      field: v,
                      operator: OPERATORS_BY_TYPE[nf.type][0]!,
                      value: "",
                      value2: "",
                    });
                  }}
                  options={fields.map((x) => x.key)}
                  labels={Object.fromEntries(fields.map((x) => [x.key, x.label]))}
                />
                <NativeSelect
                  className="w-28"
                  value={c.operator}
                  onChange={(v) => set(c.id, { operator: v as FilterOperator })}
                  options={OPERATORS_BY_TYPE[f.type]}
                  labels={OPERATOR_LABEL}
                />
                {f.type === "enum" ? (
                  <NativeSelect
                    className="flex-1"
                    value={c.value}
                    onChange={(v) => set(c.id, { value: v })}
                    options={["", ...(f.options ?? [])]}
                    labels={{ "": t("Chọn…", "Select…") }}
                  />
                ) : c.operator === "between" ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      className="h-9"
                      type={inputType}
                      placeholder={t("Từ", "From")}
                      value={c.value}
                      onChange={(e) => set(c.id, { value: e.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      className="h-9"
                      type={inputType}
                      placeholder={t("Đến", "To")}
                      value={c.value2 ?? ""}
                      onChange={(e) => set(c.id, { value2: e.target.value })}
                    />
                  </div>
                ) : (
                  <Input
                    className="h-9 flex-1"
                    type={inputType}
                    placeholder={t("Giá trị", "Value")}
                    value={c.value}
                    onChange={(e) => set(c.id, { value: e.target.value })}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDraft((d) => d.filter((x) => x.id !== c.id))}
                  aria-label={t("Xoá điều kiện", "Remove condition")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => fields[0] && setDraft((d) => [...d, blank(fields[0]!)])}
          >
            <Plus className="h-4 w-4" />
            {t("Thêm điều kiện", "Add condition")}
          </Button>
        </div>
        {recent.length > 0 && (
          <div className="border-t px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              {t("Bộ lọc gần đây", "Recent filters")}
            </div>
            <div className="flex flex-col gap-1">
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => apply(r.conditions.map((c) => ({ ...c, id: uid("f-") })))}
                  className="truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft([]);
              onApply([]);
              setOpen(false);
            }}
          >
            {t("Xoá lọc", "Clear")}
          </Button>
          <Button size="sm" onClick={() => apply(draft)}>
            {t("Áp dụng", "Apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
