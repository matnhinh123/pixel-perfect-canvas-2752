import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  History,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Table2,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, PageHeader, Panel } from "@/components/movex/common";
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
import { readJson, writeJson } from "@/repositories/storage";
import { cn } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/paging";
import { AdvancedFilter } from "./AdvancedFilter";
import { ColumnSettings } from "./ColumnSettings";
import { DataTable } from "./DataTable";
import { ImportDialog } from "./ImportDialog";
import { useEntityActions } from "./useEntityActions";
import type { ListColumn, QuickFilter } from "./types";
import { ListLangProvider, type ListLang } from "./listLang";
import { useLang } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";

export interface ExtraRowAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (row: T) => void;
  /** Hide the action for some rows (e.g. Restore only on archived records). */
  hidden?: (row: T) => boolean;
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
  /**
   * Hierarchical lists (Service): adds a Tree View / Table View toggle. Tree View indents `column`
   * under its parent with expand/collapse; search/filter keep the ancestors of every match.
   */
  tree?: { parentOf: (row: T) => string | null; column: string };
  /** Hide the Delete row action (master data that is deactivated rather than deleted). */
  allowDelete?: boolean;
  /** Lists that mix entities: the entity whose Change History a row opens. */
  entityTypeOf?: (row: T) => EntityType;
  /** false: no Import / Export buttons at all (incl. "Export selected"). */
  importExport?: boolean;
  /** Show the refresh button (right of the toolbar). Off for the master-data lists. */
  showRefresh?: boolean;
  /** UI language of the list chrome (toolbar, menus, pager). Vietnamese by default. */
  lang?: ListLang;
  /**
   * Search, sort and paging owned by the page (e.g. kept in the URL query). Without it the list
   * keeps them itself. Changing search or rows per page goes back to page 1.
   */
  listState?: ListState;
  onListStateChange?: (s: ListState) => void;
  /**
   * Screen-specific quick filters (Location): the page renders its own quick filters in the
   * toolbar, decides which rows match and lists the applied conditions as removable chips.
   * Replaces `quickFilters`; the generic Advanced Filter stays, as on every other list.
   */
  customFilters?: CustomFilters<T>;
}

export interface ListState {
  q: string;
  sort: SortState | null;
  page: number;
  pageSize: number;
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface CustomFilters<T> {
  toolbar: ReactNode;
  match: (row: T) => boolean;
  chips: FilterChip[];
  /** Clear every filter (and the search box too when `withSearch`). */
  onClearAll: (withSearch: boolean) => void;
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

const ALL = "__all__";

/**
 * Quick filter dropdown. The open list shows plain values ("All", "Active"…); the closed box still
 * names the filter while nothing is picked ("Status: All"), via a hidden option for that state.
 */
function QuickFilterSelect({
  filter,
  value,
  onChange,
  allText,
}: {
  filter: QuickFilter;
  value: string;
  onChange: (v: string) => void;
  allText: string;
}) {
  return (
    <select
      value={value}
      aria-label={filter.allLabel}
      title={filter.allLabel}
      onChange={(e) => onChange(e.target.value === ALL ? "" : e.target.value)}
      className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="" hidden>
        {filter.allLabel}
      </option>
      <option value={ALL}>{allText}</option>
      {filter.options.map((o) => (
        <option key={o.label} value={o.label}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const AUDIT_KEYS = ["createdAt", "createdBy", "updatedAt", "updatedBy"];
const stamp = (iso: string) => (iso ? formatDateTime(iso) : "—");

/**
 * Every list ends with the same four audit columns (Created At / By, Updated At / By); a screen's own
 * definitions of these keys are replaced so all lists label and format them alike.
 */
function withAuditColumns<T extends BaseRecord>(columns: ListColumn<T>[]): ListColumn<T>[] {
  return [
    ...columns.filter((c) => !AUDIT_KEYS.includes(c.key)),
    {
      key: "createdAt",
      label: "Created At",
      type: "date",
      width: 160,
      value: (r) => (r.createdAt ?? "").slice(0, 10),
      exportValue: (r) => stamp(r.createdAt),
      render: (r) => <span className="text-xs text-muted-foreground">{stamp(r.createdAt)}</span>,
    },
    {
      key: "createdBy",
      label: "Created By",
      type: "text",
      width: 150,
      value: (r) => r.createdBy ?? "",
    },
    {
      key: "updatedAt",
      label: "Updated At",
      type: "date",
      width: 160,
      value: (r) => (r.updatedAt ?? "").slice(0, 10),
      exportValue: (r) => stamp(r.updatedAt),
      render: (r) => <span className="text-xs text-muted-foreground">{stamp(r.updatedAt)}</span>,
    },
    {
      key: "updatedBy",
      label: "Updated By",
      type: "text",
      width: 150,
      value: (r) => r.updatedBy ?? "",
    },
  ];
}

/** The standard list screen used by Routing, Service, Cost (+ derived lists). Configure, don't copy. */
export function EntityListPage<T extends BaseRecord>(p: EntityListPageProps<T>) {
  const { screen, crud } = p;
  const columns = useMemo(() => withAuditColumns(p.columns), [p.columns]);
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const { pref, setPref, reset } = useColumnPreference(
    screen,
    allKeys,
    columns.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [ownState, setOwnState] = useState<ListState>({
    q: p.initialSearch ?? "",
    sort: null,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const ls = p.listState ?? ownState;
  const { q, sort, page, pageSize } = ls;
  const patchList = (patch: Partial<ListState>) => {
    const next = { ...ls, ...patch };
    if (p.onListStateChange) p.onListStateChange(next);
    else setOwnState(next);
  };
  const setQ = (v: string) => patchList({ q: v, page: 1 });
  const setSort = (s: SortState | null) => patchList({ sort: s });
  const setPage = (n: number) => patchList({ page: n });
  const setPageSize = (n: number) => patchList({ pageSize: n, page: 1 });
  const custom = p.customFilters;
  const [quick, setQuickState] = useState<Record<string, string>>({});
  const [advanced, setAdvancedState] = useState<FilterCondition[]>([]);
  // Any filter change shows the first page of the new result.
  const setQuick = (next: Record<string, string>) => {
    setQuickState(next);
    setPage(1);
  };
  const setAdvanced = (next: FilterCondition[]) => {
    setAdvancedState(next);
    setPage(1);
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [auditRow, setAuditRow] = useState<T | null>(null);
  const appLang = useLang();
  const lang = p.lang ?? appLang;
  const t = (vi: string, en: string) => (lang === "en" ? en : vi);
  const actions = useEntityActions(crud, lang);
  const viewKey = `list-view.${screen}`;
  const [view, setViewState] = useState<"tree" | "table">(() =>
    readJson<string>(viewKey, "tree") === "table" ? "table" : "tree",
  );
  const setView = (v: "tree" | "table") => {
    setViewState(v);
    writeJson(viewKey, v);
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    const matched = applyConditions(
      custom ? searched.filter(custom.match) : searched,
      [...quickConditions, ...advanced],
      filterFields,
      get,
    );
    return applySort(matched, sort, get);
  }, [p.rows, q, quickConditions, advanced, sort, custom?.match]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Applied conditions as removable chips (quick filters first, then advanced ones). */
  const chips: FilterChip[] = [
    ...(custom
      ? custom.chips
      : (p.quickFilters ?? [])
          .filter((qf) => quick[qf.key])
          .map((qf) => ({
            key: `q-${qf.key}`,
            label: `${qf.allLabel.split(":")[0]}: ${quick[qf.key]}`,
            onRemove: () => setQuick({ ...quick, [qf.key]: "" }),
          }))),
    ...advanced.map((c) => ({
      key: c.id,
      label: describeCondition(c, filterFields),
      onRemove: () => setAdvanced(advanced.filter((x) => x.id !== c.id)),
    })),
  ];

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // ---------- Tree View ----------
  const tree = p.tree;
  const treeOn = !!tree && view === "tree";
  const treeKids = useMemo(() => {
    if (!tree) return null;
    const byId = new Map(p.rows.map((r) => [r.id, r]));
    // Every match plus its ancestors, so a matching child is never shown without its parents.
    const shown = new Set<string>();
    for (const r of filtered) {
      let cur: T | undefined = r;
      while (cur && !shown.has(cur.id)) {
        shown.add(cur.id);
        const pid = tree.parentOf(cur);
        cur = pid ? byId.get(pid) : undefined;
      }
    }
    // Siblings keep the current sort; ancestors that did not match keep the base order.
    const rank = new Map<string, number>();
    filtered.forEach((r, i) => rank.set(r.id, i));
    p.rows.forEach((r, i) => {
      if (!rank.has(r.id)) rank.set(r.id, filtered.length + i);
    });
    const kids = new Map<string | null, T[]>();
    for (const r of p.rows) {
      if (!shown.has(r.id)) continue;
      const pid = tree.parentOf(r);
      const key = pid && pid !== r.id && shown.has(pid) ? pid : null;
      if (!kids.has(key)) kids.set(key, []);
      kids.get(key)!.push(r);
    }
    kids.forEach((l) => l.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!));
    return kids;
  }, [tree, p.rows, filtered]);
  // While searching / filtering, every matching branch is shown open.
  const forceOpen = q.trim() !== "" || chips.length > 0;
  const treeRows = useMemo(() => {
    const out: { row: T; depth: number }[] = [];
    if (!treeKids) return out;
    const seen = new Set<string>();
    const walk = (pid: string | null, depth: number) => {
      for (const r of treeKids.get(pid) ?? []) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ row: r, depth });
        if (forceOpen || !collapsed.has(r.id)) walk(r.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [treeKids, collapsed, forceOpen]);
  const depthOf = new Map(treeRows.map((x) => [x.row.id, x.depth]));
  const parentIds = treeKids
    ? Array.from(treeKids.keys()).filter((k): k is string => k !== null)
    : [];
  const toggleNode = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const tableCols = !treeOn
    ? visibleCols
    : visibleCols.map((c) =>
        c.key !== tree!.column
          ? c
          : {
              ...c,
              render: (r: T) => {
                const hasKids = !!treeKids?.get(r.id)?.length;
                const open = forceOpen || !collapsed.has(r.id);
                return (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ paddingLeft: (depthOf.get(r.id) ?? 0) * 22 }}
                  >
                    {hasKids ? (
                      <button
                        type="button"
                        aria-label={open ? t("Thu gọn", "Collapse") : t("Mở rộng", "Expand")}
                        disabled={forceOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNode(r.id);
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        <ChevronRight
                          className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
                        />
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    {c.render ? c.render(r) : String(c.value(r) ?? "")}
                  </span>
                );
              },
            },
      );
  const selectedRows = p.rows.filter((r) => selected.has(r.id));
  const filtersActive = q.trim() !== "" || chips.length > 0;

  const doExport = async (rows: T[], scope: string) => {
    if (rows.length === 0) {
      toast.error(
        t(
          "Không có dữ liệu để export — danh sách hiện tại đang trống.",
          "Nothing to export — the list is empty.",
        ),
      );
      return;
    }
    const cols = visibleCols;
    try {
      const file = await exportView({
        entityType: p.entityType,
        screen,
        scope,
        headers: cols.map((c) => c.label),
        rows: rows.map((r) => cols.map((c) => (c.exportValue ?? c.value)(r) ?? "")),
      });
      toast.success(
        t(`Đã export ${rows.length} dòng → ${file}`, `Exported ${rows.length} rows → ${file}`),
      );
    } catch {
      toast.error(t("Export thất bại, vui lòng thử lại.", "Export failed, please try again."));
    }
  };
  const viewScope = filtersActive || sort ? "current view (search + filter + sort)" : "all records";
  const sortedSelection = () => applySort(selectedRows, sort, get);

  const refresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success(t("Đã làm mới danh sách", "List refreshed"));
    }, 450);
  };

  /** Remove every filter chip; `withSearch` also empties the search box (empty-result action). */
  const clearAll = (withSearch = true) => {
    if (custom) {
      setAdvancedState([]);
      custom.onClearAll(withSearch);
      return;
    }
    setQuickState({});
    setAdvancedState([]);
    patchList(withSearch ? { q: "", page: 1 } : { page: 1 });
  };
  const ro =
    p.readOnlyReason ?? t("Không khả dụng cho danh sách này", "Not available for this list");

  // Import history stays reachable as a tab inside the import dialog.
  const importExport = p.importExport !== false;
  const importBtn = !importExport ? null : p.importConfig ? (
    <Button variant="outline" onClick={() => setImportOpen(true)}>
      <Upload className="h-4 w-4" />
      Import
    </Button>
  ) : (
    <DisabledWithReason reason={ro}>
      <Button variant="outline" disabled>
        <Upload className="h-4 w-4" />
        Import
      </Button>
    </DisabledWithReason>
  );

  // One click → Excel (.xlsx) of the current view (search + filter + sort, visible columns).
  // Selected rows are exported from the selection bar.
  const exportBtn = importExport && (
    <Button
      variant="outline"
      onClick={() => void doExport(filtered, viewScope)}
      title={t(
        `Export Excel: ${filtered.length} dòng · ${visibleCols.length} cột đang hiển thị`,
        `Export Excel: ${filtered.length} rows · ${visibleCols.length} visible columns`,
      )}
    >
      <Download className="h-4 w-4" />
      Export
    </Button>
  );

  /** Header drag & drop: moves `from` before / after `to` in the saved column order. */
  const reorderColumn = (from: string, to: string, after: boolean) =>
    setPref((x) => {
      const order = x.order.filter((k) => k !== from);
      const i = order.indexOf(to);
      if (i < 0) return x;
      order.splice(after ? i + 1 : i, 0, from);
      return { ...x, order };
    });

  const addBtn = p.onAdd ? (
    <Button onClick={p.onAdd}>
      <Plus className="h-4 w-4" />
      {p.addLabel ?? t("Thêm mới", "Add")}
    </Button>
  ) : (
    <DisabledWithReason reason={ro}>
      <Button disabled>
        <Plus className="h-4 w-4" />
        {p.addLabel ?? t("Thêm mới", "Add")}
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
            {t("Lịch sử thay đổi", "Change History")}
          </DropdownMenuItem>
        )}
        {p.extraRowActions
          ?.filter((a) => !a.hidden?.(r))
          .map((a) => (
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
            {p.allowDelete !== false && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void actions.requestDelete(r)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <ListLangProvider value={lang}>
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
          {/* One toolbar for every list: Search · Filter · Columns · quick filters; tree controls on the right. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative w-full min-w-56 max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={p.searchPlaceholder}
                className="h-10 pl-9 pr-8"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  aria-label={t("Xoá tìm kiếm", "Clear search")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <AdvancedFilter
              screen={screen}
              fields={filterFields}
              value={advanced}
              onApply={setAdvanced}
            />
            <ColumnSettings
              columns={columns}
              pref={pref}
              onChange={setPref}
              onReset={() => {
                reset();
                toast.success(t("Đã khôi phục cột mặc định", "Columns reset to default"));
              }}
            />
            {custom?.toolbar}
            {!custom &&
              p.quickFilters?.map((qf) => (
                <QuickFilterSelect
                  key={qf.key}
                  filter={qf}
                  value={quick[qf.key] ?? ""}
                  onChange={(v) => setQuick({ ...quick, [qf.key]: v })}
                  allText={t("Tất cả", "All")}
                />
              ))}
            <div className="ml-auto flex items-center gap-2">
              {treeOn && !forceOpen && parentIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(parentIds))}
                >
                  {collapsed.size
                    ? t("Mở rộng tất cả", "Expand all")
                    : t("Thu gọn tất cả", "Collapse all")}
                </Button>
              )}
              {tree && (
                <div
                  className="flex rounded-md border p-0.5"
                  role="group"
                  aria-label={t("Kiểu hiển thị", "View")}
                >
                  {(
                    [
                      ["tree", "Tree View", ListTree],
                      ["table", "Table View", Table2],
                    ] as const
                  ).map(([k, label, Icon]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={view === k}
                      onClick={() => setView(k)}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold",
                        view === k
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {p.showRefresh !== false && (
                <Button variant="outline" onClick={refresh} aria-label="Refresh">
                  <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
              )}
            </div>
          </div>

          {/* One chip per applied condition; × removes it, "Clear all" removes them all. */}
          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pl-2.5 pr-1 font-medium text-accent-foreground"
                >
                  {c.label}
                  <button
                    type="button"
                    onClick={c.onRemove}
                    className="rounded-full p-0.5 hover:bg-primary/15"
                    aria-label={t(`Bỏ lọc ${c.label}`, `Remove filter ${c.label}`)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => clearAll(false)}
              >
                {t("Xoá tất cả lọc", "Clear all")}
              </button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm">
              <span className="font-semibold text-accent-foreground">
                {t("Đã chọn", "Selected")} {selected.size}
              </span>
              {importExport && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void doExport(sortedSelection(), "selected rows")}
                >
                  <Download className="h-4 w-4" />
                  {t("Export đã chọn", "Export selected")}
                </Button>
              )}
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
                {t("Bỏ chọn", "Clear selection")}
              </Button>
            </div>
          )}

          <DataTable
            columns={tableCols}
            rows={treeOn ? treeRows.map((x) => x.row) : pageRows}
            totalRows={treeOn ? treeRows.length : filtered.length}
            page={treeOn ? 1 : Math.min(page, pages)}
            pageSize={treeOn ? Math.max(1, treeRows.length) : pageSize}
            hidePager={treeOn}
            onPage={setPage}
            onPageSize={setPageSize}
            sort={sort}
            onSort={setSort}
            widths={pref.widths}
            onResize={(k, w) => setPref((x) => ({ ...x, widths: { ...x.widths, [k]: w } }))}
            onReorder={reorderColumn}
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
                  title={t(`Chưa có dữ liệu ${p.entityLabel}`, `No ${p.entityLabel} yet`)}
                  description={
                    p.onAdd
                      ? t(
                          `Bấm "${p.addLabel ?? t("Thêm mới", "Add")}" hoặc import từ Excel.`,
                          `Click "${p.addLabel ?? "Add"}" or import from Excel.`,
                        )
                      : undefined
                  }
                  action={
                    p.onAdd ? (
                      <Button size="sm" onClick={p.onAdd}>
                        <Plus className="h-4 w-4" />
                        {p.addLabel ?? t("Thêm mới", "Add")}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState
                  icon={<SearchX className="h-8 w-8" />}
                  title={t("Không có bản ghi phù hợp", "No matching records")}
                  description={t(
                    "Thử từ khoá khác hoặc xoá bộ lọc.",
                    "Try another keyword or clear the filters.",
                  )}
                  action={
                    <Button size="sm" variant="outline" onClick={() => clearAll(true)}>
                      {t("Xoá bộ lọc", "Clear filters")}
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
          />
        )}
        {crud && (
          <AuditHistoryDrawer
            open={!!auditRow}
            onOpenChange={(o) => !o && setAuditRow(null)}
            entityType={auditRow && p.entityTypeOf ? p.entityTypeOf(auditRow) : p.entityType}
            entityId={auditRow?.id}
            title={auditRow ? crud.labelOf(auditRow) : ""}
            {...(lang === "en" ? { english: true } : {})}
          />
        )}
      </div>
    </ListLangProvider>
  );
}
