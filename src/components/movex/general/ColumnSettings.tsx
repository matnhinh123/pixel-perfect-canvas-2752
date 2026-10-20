import { ArrowDown, ArrowUp, Columns3, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColumnPreference } from "@/types";
import { useT } from "./listLang";

/** GEN-04 Column preference popover: show/hide, reorder, reset. Width is resized in the table header. */
export function ColumnSettings({
  columns,
  pref,
  onChange,
  onReset,
}: {
  columns: { key: string; label: string; pinned?: boolean | undefined }[];
  pref: ColumnPreference;
  onChange: (p: ColumnPreference) => void;
  onReset: () => void;
}) {
  const { t } = useT();
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const move = (i: number, d: -1 | 1) => {
    const order = [...pref.order];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    onChange({ ...pref, order });
  };
  const toggle = (key: string) =>
    onChange({
      ...pref,
      hidden: pref.hidden.includes(key)
        ? pref.hidden.filter((k) => k !== key)
        : [...pref.hidden, key],
    });
  const visibleCount = pref.order.filter((k) => !pref.hidden.includes(k)).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10">
          <Columns3 className="h-4 w-4" />
          {t("Cột", "Columns")}
          <span className="inline-flex h-5 items-center rounded-full bg-accent px-[7px] text-xs font-semibold text-accent-foreground">
            {visibleCount}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("Cài đặt cột", "Column settings")}</div>
            <div className="text-xs text-muted-foreground">
              {visibleCount}/{pref.order.length}{" "}
              {t("cột hiển thị · lưu theo người dùng", "columns shown · saved per user")}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t("Mặc định", "Reset")}
          </Button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {pref.order.map((key, i) => {
            const c = byKey.get(key);
            if (!c) return null;
            const visible = !pref.hidden.includes(key);
            return (
              <li
                key={key}
                className="mx-1 flex min-h-8 items-center gap-2 rounded-[8px] px-3 py-1.5 text-sm hover:bg-muted"
              >
                {c.pinned ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Checkbox
                    checked={visible}
                    onCheckedChange={() => toggle(key)}
                    aria-label={`Show ${c.label}`}
                  />
                )}
                <span className={visible ? "flex-1" : "flex-1 text-muted-foreground"}>
                  {c.label}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("Lên", "Up")}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  disabled={i === pref.order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("Xuống", "Down")}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          {t(
            "Mẹo: kéo mép tiêu đề cột để đổi độ rộng.",
            "Tip: drag a column header edge to resize.",
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
