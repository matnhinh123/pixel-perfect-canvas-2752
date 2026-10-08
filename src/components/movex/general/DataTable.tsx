import { useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NativeSelect, thClass } from "@/components/movex/common";
import type { SortState } from "@/types";
import type { ListColumn } from "./types";
import { useT } from "./listLang";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = ["10", "20", "50"];

/** Standard table: [checkbox] columns… [actions], sortable headers, resizable columns, paging footer. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  totalRows,
  page,
  pageSize,
  onPage,
  onPageSize,
  sort,
  onSort,
  widths,
  onResize,
  onReorder,
  selected,
  onToggle,
  onToggleAll,
  onRowClick,
  actions,
  loading,
  empty,
  hidePager,
}: {
  columns: ListColumn<T>[];
  rows: T[];
  totalRows: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  sort: SortState | null;
  onSort: (s: SortState | null) => void;
  widths: Record<string, number>;
  onResize: (key: string, w: number) => void;
  /** Header drag & drop: move column `from` before (or `after`) column `to`. */
  onReorder?: (from: string, to: string, after: boolean) => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: (ids: string[], on: boolean) => void;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => ReactNode;
  loading?: boolean;
  empty: ReactNode;
  /** Tree view shows every row on one page: only the row count is rendered in the footer. */
  hidePager?: boolean;
}) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  const ids = rows.map((r) => r.id);
  const allOn = !!selected && ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = !!selected && ids.some((id) => selected.has(id));
  const drag = useRef<{ key: string; x: number; w: number } | null>(null);
  // Column being dragged, and where it would land (before / after the hovered header).
  const [moving, setMoving] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null);
  const endMove = () => {
    setMoving(null);
    setDropAt(null);
  };
  const sideOf = (e: React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientX > r.left + r.width / 2;
  };

  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement!;
    drag.current = { key, x: e.clientX, w: th.getBoundingClientRect().width };
    const move = (ev: MouseEvent) =>
      drag.current &&
      onResize(
        drag.current.key,
        Math.max(70, Math.round(drag.current.w + ev.clientX - drag.current.x)),
      );
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const cycleSort = (key: string) => {
    if (!sort || sort.key !== key) onSort({ key, dir: "asc" });
    else if (sort.dir === "asc") onSort({ key, dir: "desc" });
    else onSort(null);
  };

  const colSpan = columns.length + (selected ? 1 : 0) + (actions ? 1 : 0);
  const first = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(totalRows, page * pageSize);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selected && (
                <TableHead className={cn(thClass, "w-10")}>
                  <Checkbox
                    checked={allOn ? true : someOn ? "indeterminate" : false}
                    onCheckedChange={(v) => onToggleAll?.(ids, v === true)}
                    aria-label="Select page"
                  />
                </TableHead>
              )}
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                const w = widths[c.key] ?? c.width;
                const target = dropAt?.key === c.key && moving !== c.key ? dropAt : null;
                return (
                  <TableHead
                    key={c.key}
                    className={cn(
                      thClass,
                      "group relative select-none",
                      !w && "whitespace-nowrap",
                      onReorder && "cursor-grab active:cursor-grabbing",
                      moving === c.key && "opacity-40",
                    )}
                    style={w ? { width: w, minWidth: w } : undefined}
                    {...(onReorder && {
                      draggable: true,
                      title: t("Kéo để đổi vị trí cột", "Drag to move the column"),
                      onDragStart: (e: React.DragEvent) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", c.key);
                        setMoving(c.key);
                      },
                      onDragOver: (e: React.DragEvent) => {
                        if (!moving) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const after = sideOf(e);
                        if (dropAt?.key !== c.key || dropAt.after !== after)
                          setDropAt({ key: c.key, after });
                      },
                      onDrop: (e: React.DragEvent) => {
                        e.preventDefault();
                        if (moving && moving !== c.key) onReorder(moving, c.key, sideOf(e));
                        endMove();
                      },
                      onDragEnd: endMove,
                    })}
                  >
                    {target && (
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-y-1 w-0.5 rounded bg-primary",
                          target.after ? "right-0" : "left-0",
                        )}
                      />
                    )}
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 uppercase hover:text-foreground",
                          active && "text-foreground",
                        )}
                      >
                        {c.label}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                    <span
                      onMouseDown={(e) => startResize(e, c.key)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-primary/40 group-hover:opacity-100"
                      aria-hidden
                    />
                  </TableHead>
                );
              })}
              {actions && (
                <TableHead className={cn(thClass, "sticky right-0 z-10 w-16 bg-muted text-right")}>
                  {t("Thao tác", "Actions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : rows.map((r) => (
                  <TableRow
                    key={r.id}
                    data-state={selected?.has(r.id) ? "selected" : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={() => onRowClick?.(r)}
                  >
                    {selected && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => onToggle?.(r.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    {columns.map((c) => {
                      const content = c.render ? c.render(r) : String(c.value(r) ?? "—");
                      const w = widths[c.key] ?? c.width;
                      return (
                        <TableCell
                          key={c.key}
                          className={cn(
                            c.className,
                            (c.pinned || c.truncate) && "whitespace-nowrap",
                          )}
                        >
                          {c.truncate && w ? (
                            <span
                              className="block truncate"
                              style={{ maxWidth: Math.max(40, w - 32) }}
                              title={String(c.value(r) ?? "")}
                            >
                              {content}
                            </span>
                          ) : (
                            content
                          )}
                        </TableCell>
                      );
                    })}
                    {actions && (
                      <TableCell
                        className="sticky right-0 bg-card text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {actions(r)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan}>{empty}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {totalRows === 0
            ? t("Không có bản ghi", "No records")
            : hidePager
              ? `${totalRows} ${t("bản ghi", "records")}`
              : t(
                  `Hiển thị ${first}–${last} / ${totalRows} bản ghi`,
                  `Showing ${first}–${last} of ${totalRows} records`,
                )}
        </span>
        {!hidePager && (
          <div className="flex items-center gap-2">
            <span>{t("Số dòng / trang", "Rows per page")}</span>
            <NativeSelect
              className="h-8 w-20"
              value={String(pageSize)}
              onChange={(v) => onPageSize(Number(v))}
              options={PAGE_SIZES}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPage(1)}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center">
              {t("Trang", "Page")} {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= pages}
              onClick={() => onPage(pages)}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
