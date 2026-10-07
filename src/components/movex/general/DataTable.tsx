import { useRef, type ReactNode } from "react";
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
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  const ids = rows.map((r) => r.id);
  const allOn = !!selected && ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = !!selected && ids.some((id) => selected.has(id));
  const drag = useRef<{ key: string; x: number; w: number } | null>(null);

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
                return (
                  <TableHead
                    key={c.key}
                    className={cn(thClass, "group relative select-none whitespace-nowrap")}
                    style={w ? { width: w, minWidth: w } : undefined}
                  >
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
                <TableHead className={cn(thClass, "w-16 text-right")}>Thao tác</TableHead>
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
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(c.className, c.pinned && "whitespace-nowrap")}
                      >
                        {c.render ? c.render(r) : String(c.value(r) ?? "—")}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
            ? "Không có bản ghi"
            : hidePager
              ? `${totalRows} bản ghi`
              : `Hiển thị ${first}–${last} / ${totalRows} bản ghi`}
        </span>
        {!hidePager && (
          <div className="flex items-center gap-2">
            <span>Số dòng / trang</span>
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
              Trang {page} / {pages}
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
