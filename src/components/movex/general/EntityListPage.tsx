import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, NativeSelect, PageHeader, Panel } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import type { BaseRecord, EntityType, FilterCondition, SortState } from "@/types";
import type { EntityCrud } from "@/services/crudService";
import type { ImportEntityConfig } from "@/services/importExportService";
import { exportView } from "@/services/importExportService";
import {
  applyConditions,
  applySearch,
  applySort,
  describeCondition,
  type CellValue,
} from "@/services/filterService";
import { useColumnPreference } from "@/hooks/use-store";
import { AdvancedFilter } from "./AdvancedFilter";
import { ColumnSettings } from "./ColumnSettings";
import { DataTable } from "./DataTable";
import { ImportDialog } from "./ImportDialog";
import { useEntityActions } from "./useEntityActions";
import type { ListColumn, QuickFilter } from "./types";

export interface ExtraRowAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (row: T) => void;
}

export interface EntityListPageProps<T extends BaseRecord> {
  screen: string;
  entityType: EntityType;
  entityLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  rows: T[];
  columns: ListColumn<T>[];
  searchPlaceholder: string;
  searchValues: (row: T) => CellValue[];
  quickFilters?: QuickFilter[];
  crud?: EntityCrud<T>;
  addLabel?: string;
  onAdd?: () => void;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  importConfig?: ImportEntityConfig;
  /** Shown as tooltip when Add/Import are disabled for read-only lists. */
  readOnlyReason?: string;
  extraRowActions?: ExtraRowAction<T>[];
  /** Rendered between header and toolbar (e.g. Cost tabs). */
  above?: ReactNode;
  /** Render without its own PageHeader (when embedded below an existing header). */
  embedded?: boolean;
  auditable?: boolean;
  /** Prefill quick search, e.g. when navigating from a related record. */
  initialSearch?: string;
}

function DisabledWithReason({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** The standard list screen used by Routing, Service, Cost (+ derived lists). Configure, don't copy. */
export function EntityListPage<T extends BaseRecord>(p: EntityListPageProps<T>) {
  const { screen, columns, crud } = p;
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const { pref, setPref, reset } = useColumnPreference(
    screen,
    allKeys,
    columns.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [q, setQ] = useState(p.initialSearch ?? "");
  const [quick, setQuick] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState<FilterCondition[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState<false | "import" | "history">(false);
  const [auditRow, setAuditRow] = useState<T | null>(null);
  const actions = useEntityActions(crud);

  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const get = (row: T, key: string) => colByKey.get(key)?.value(row);
  const visibleCols = pref.order
    .filter((k) => !pref.hidden.includes(k) || colByKey.get(k)?.pinned)
    .map((k) => colByKey.get(k)!)
    .filter(Boolean);
  const filterFields = columns
    .filter((c) => c.filterable !== false)
    .map(({ key, label, type, options }) => ({
      key,
      label,
      type,
      ...(options ? { options } : {}),
    }));

  const quickConditions = useMemo<FilterCondition[]>(() => {
    const out: FilterCondition[] = [];
    for (const qf of p.quickFilters ?? []) {
      const opt = qf.options.find((o) => o.label === quick[qf.key]);
      opt?.conditions.forEach((c) => out.push({ ...c, id: `${qf.key}-${c.field}` }));
    }
    return out;
  }, [quick, p.quickFilters]);

  const filtered = useMemo(() => {
    const searched = applySearch(p.rows, q, p.searchValues);
    const conds = [...quickConditions, ...advanced];
    return applySort(applyConditions(searched, conds, filterFields, get), sort, get);
  }, [p.rows, q, quickConditions, advanced, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(() => {
    setPage(1);
  }, [q, quick, advanced, pageSize]);
  // Drop selections that disappeared (e.g. after delete / rollback).
  useEffect(() => {
    const ids = new Set(p.rows.map((r) => r.id));
    setSelected((s) =>
      Array.from(s).every((id) => ids.has(id))
        ? s
        : new Set(Array.from(s).filter((id) => ids.has(id))),
    );
  }, [p.rows]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedRows = p.rows.filter((r) => selected.has(r.id));
  const filtersActive = q.trim() !== "" || quickConditions.length > 0 || advanced.length > 0;

  const doExport = (rows: T[], scope: string) => {
    if (rows.length === 0) {
      toast.error("Không có dữ liệu để export — danh sách hiện tại đang trống.");
      return;
    }
    const cols = visibleCols;
    const file = exportView({
      entityType: p.entityType,
      screen,
      scope,
      headers: cols.map((c) => c.label),
      rows: rows.map((r) => cols.map((c) => (c.exportValue ?? c.value)(r) ?? "")),
    });
    toast.success(`Đã export ${rows.length} dòng → ${file}`);
  };

  const refresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Đã làm mới danh sách");
    }, 450);
  };

  const clearAll = () => {
    setQ("");
    setQuick({});
    setAdvanced([]);
  };
  const ro = p.readOnlyReason ?? "Không khả dụng cho danh sách này";

  const importBtn = p.importConfig ? (
    <div className="flex">
      <Button variant="outline" className="rounded-r-none" onClick={() => setImportOpen("import")}>
        <Upload className="h-4 w-4" />
        Import
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="rounded-l-none border-l-0 px-2"
            aria-label="Import options"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setImportOpen("import")}>
            <Upload className="h-4 w-4" />
            Import từ Excel…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setImportOpen("history")}>
            <History className="h-4 w-4" />
            Lịch sử import
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <DisabledWithReason reason={ro}>
      <Button variant="outline" disabled>
        <Upload className="h-4 w-4" />
        Import
      </Button>
    </DisabledWithReason>
  );

  const exportBtn = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Export
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Excel (CSV) · {visibleCols.length} cột đang hiển thị
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() =>
            doExport(
              filtered,
              filtersActive || sort ? "current view (search + filter + sort)" : "all records",
            )
          }
        >
          <Download className="h-4 w-4" />
          Export theo view hiện tại ({filtered.length})
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={selectedRows.length === 0}
          onClick={() => doExport(applySort(selectedRows, sort, get), "selected rows")}
        >
          <CheckCircle2 className="h-4 w-4" />
          Export dòng đã chọn ({selectedRows.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const addBtn = p.onAdd ? (
    <Button onClick={p.onAdd}>
      <Plus className="h-4 w-4" />
      {p.addLabel ?? "Thêm mới"}
    </Button>
  ) : (
    <DisabledWithReason reason={ro}>
      <Button disabled>
        <Plus className="h-4 w-4" />
        {p.addLabel ?? "Thêm mới"}
      </Button>
    </DisabledWithReason>
  );

  const rowMenu = (r: T) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {p.onView && (
          <DropdownMenuItem onClick={() => p.onView!(r)}>
            <Eye className="h-4 w-4" />
            View
          </DropdownMenuItem>
        )}
        {p.onEdit && (
          <DropdownMenuItem onClick={() => p.onEdit!(r)}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {p.auditable !== false && crud && (
          <DropdownMenuItem onClick={() => setAuditRow(r)}>
            <History className="h-4 w-4" />
            Audit History
          </DropdownMenuItem>
        )}
        {p.extraRowActions?.map((a) => (
          <DropdownMenuItem key={a.label} onClick={() => a.onClick(r)}>
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
        {crud && (
          <>
            <DropdownMenuSeparator />
            {r.status === "Inactive" ? (
              <DropdownMenuItem onClick={() => void actions.setStatus([r], "Active")}>
                <CheckCircle2 className="h-4 w-4" />
                Activate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void actions.setStatus([r], "Inactive")}>
                <XCircle className="h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void actions.requestDelete(r)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div>
      {!p.embedded && (
        <PageHeader
          crumbs={[{ label: typeof p.title === "string" ? p.title : p.entityLabel }]}
          title={p.title}
          subtitle={p.subtitle}
          actions={
            <>
              {importBtn}
              {exportBtn}
              {addBtn}
            </>
          }
        />
      )}
      {p.above}
      <Panel>
        {p.embedded && (
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            {importBtn}
            {exportBtn}
            {addBtn}
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={p.searchPlaceholder}
              className="pl-9 pr-8"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Xoá tìm kiếm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {p.quickFilters?.map((qf) => (
            <NativeSelect
              key={qf.key}
              value={quick[qf.key] ?? ""}
              onChange={(v) => setQuick((s) => ({ ...s, [qf.key]: v }))}
              options={["", ...qf.options.map((o) => o.label)]}
              labels={{ "": qf.allLabel }}
            />
          ))}
          <AdvancedFilter
            screen={screen}
            fields={filterFields}
            value={advanced}
            onApply={setAdvanced}
          />
          <div className="ml-auto flex items-center gap-2">
            <ColumnSettings
              columns={columns}
              pref={pref}
              onChange={setPref}
              onReset={() => {
                reset();
                toast.success("Đã khôi phục cột mặc định");
              }}
            />
            <Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </div>

        {(advanced.length > 0 || quickConditions.length > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {[...quickConditions, ...advanced].map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground"
              >
                {describeCondition(c, filterFields)}
              </span>
            ))}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={clearAll}
            >
              Xoá tất cả lọc
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm">
            <span className="font-semibold text-accent-foreground">Đã chọn {selected.size}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => doExport(applySort(selectedRows, sort, get), "selected rows")}
            >
              <Download className="h-4 w-4" />
              Export đã chọn
            </Button>
            {crud && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void actions.setStatus(selectedRows, "Active")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void actions.setStatus(selectedRows, "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setSelected(new Set())}
            >
              Bỏ chọn
            </Button>
          </div>
        )}

        <DataTable
          columns={visibleCols}
          rows={pageRows}
          totalRows={filtered.length}
          page={Math.min(page, pages)}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
          sort={sort}
          onSort={setSort}
          widths={pref.widths}
          onResize={(k, w) => setPref((x) => ({ ...x, widths: { ...x.widths, [k]: w } }))}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onToggleAll={(ids, on) =>
            setSelected((s) => {
              const n = new Set(s);
              ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
              return n;
            })
          }
          {...(p.onView ? { onRowClick: p.onView } : {})}
          {...(p.onView || p.onEdit || crud || p.extraRowActions?.length
            ? { actions: rowMenu }
            : {})}
          loading={loading}
          empty={
            p.rows.length === 0 ? (
              <EmptyState
                title={`Chưa có dữ liệu ${p.entityLabel}`}
                description={
                  p.onAdd ? `Bấm "${p.addLabel ?? "Thêm mới"}" hoặc import từ Excel.` : undefined
                }
                action={
                  p.onAdd ? (
                    <Button size="sm" onClick={p.onAdd}>
                      <Plus className="h-4 w-4" />
                      {p.addLabel ?? "Thêm mới"}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={<SearchX className="h-8 w-8" />}
                title="Không có bản ghi phù hợp"
                description="Thử từ khoá khác hoặc xoá bộ lọc."
                action={
                  <Button size="sm" variant="outline" onClick={clearAll}>
                    Xoá bộ lọc
                  </Button>
                }
              />
            )
          }
        />
      </Panel>

      {p.importConfig && importOpen && (
        <ImportDialog
          open
          onOpenChange={(o) => !o && setImportOpen(false)}
          config={p.importConfig}
          entityLabel={p.entityLabel}
          initialTab={importOpen}
        />
      )}
      {crud && (
        <AuditHistoryDrawer
          open={!!auditRow}
          onOpenChange={(o) => !o && setAuditRow(null)}
          entityType={p.entityType}
          entityId={auditRow?.id}
          title={auditRow ? crud.labelOf(auditRow) : ""}
        />
      )}
    </div>
  );
}
