import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { treeOrder } from "@/services/serviceCatalogService";
import type { ServiceRecord } from "@/types";
import { cn } from "@/lib/utils";

type CheckState = "checked" | "indeterminate" | "none";

/**
 * Service picker for the Cost form: the whole service tree on the left (search, expand, tick a
 * group to tick everything under it) and a live "Selected" list on the right.
 * `value` holds every ticked service id; a group is ticked exactly when all its children are.
 */
export function ServiceMultiTree({
  services,
  value,
  onChange,
  disabled,
}: {
  services: ServiceRecord[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const ordered = useMemo(() => treeOrder(services), [services]);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const children = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of ordered) {
      if (!s.parentId || !byId.has(s.parentId)) continue;
      m.set(s.parentId, [...(m.get(s.parentId) ?? []), s.id]);
    }
    return m;
  }, [ordered, byId]);
  const parentOf = (id: string) => {
    const p = byId.get(id)?.parentId;
    return p && byId.has(p) ? p : null;
  };
  const depthOf = (id: string) => {
    let d = 0;
    for (let p = parentOf(id); p; p = parentOf(p)) d++;
    return d;
  };
  const descendants = (id: string): string[] =>
    (children.get(id) ?? []).flatMap((c) => [c, ...descendants(c)]);

  /** Leaves are the source of truth; a group counts as ticked only when all its leaves are. */
  const derive = (leaves: Set<string>) => {
    const out = new Set(leaves);
    const settle = (id: string): boolean => {
      const kids = children.get(id);
      if (!kids?.length) return leaves.has(id);
      const all = kids.map(settle).every(Boolean);
      if (all) out.add(id);
      return all;
    };
    for (const s of ordered) if (!parentOf(s.id)) settle(s.id);
    return out;
  };
  const picked = useMemo(
    () => derive(new Set(value.filter((id) => byId.has(id) && !children.has(id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, byId, children],
  );
  const leavesUnder = (id: string): string[] => {
    const d = descendants(id);
    return d.length ? d.filter((x) => !children.has(x)) : [id];
  };
  const stateOf = (id: string): CheckState => {
    const leaves = leavesUnder(id);
    const n = leaves.filter((l) => picked.has(l)).length;
    return n === 0 ? "none" : n === leaves.length ? "checked" : "indeterminate";
  };

  const commit = (leaves: Set<string>) => {
    const out = derive(leaves);
    onChange(ordered.filter((s) => out.has(s.id)).map((s) => s.id));
  };
  const leafSet = () => new Set([...picked].filter((id) => !children.has(id)));

  const toggle = (id: string) => {
    if (disabled) return;
    const leaves = leafSet();
    const targets = leavesUnder(id);
    if (stateOf(id) === "checked") targets.forEach((l) => leaves.delete(l));
    else targets.forEach((l) => leaves.add(l));
    commit(leaves);
  };
  const clearAll = () => !disabled && onChange([]);
  const selectAll = () =>
    !disabled && commit(new Set(ordered.filter((s) => !children.has(s.id)).map((s) => s.id)));

  // ---- search: keep a node when it or any descendant matches
  const q = query.trim().toLowerCase();
  const matches = (id: string) => {
    const s = byId.get(id)!;
    return `${s.code} ${s.name}`.toLowerCase().includes(q);
  };
  const visible = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    for (const s of ordered) {
      if (!matches(s.id)) continue;
      keep.add(s.id);
      for (let p = parentOf(s.id); p; p = parentOf(p)) keep.add(p);
    }
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ordered]);

  const rows = ordered.filter((s) => {
    if (visible && !visible.has(s.id)) return false;
    if (visible) return true; // searching: everything that matches is shown expanded
    for (let p = parentOf(s.id); p; p = parentOf(p)) if (collapsed.has(p)) return false;
    return true;
  });

  const parents = ordered.filter((s) => children.has(s.id)).map((s) => s.id);
  const toggleOpen = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ---- selected summary: topmost fully-ticked nodes ("Freight — all 3")
  const chips = ordered.filter(
    (s) => picked.has(s.id) && !(parentOf(s.id) && picked.has(parentOf(s.id)!)),
  );
  const leafCount = [...picked].filter((id) => !children.has(id)).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ---------- tree ---------- */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-2.5">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search service code or name…"
              className="h-10 pl-9"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(parents))}
          >
            {collapsed.size ? "Expand all" : "Collapse all"}
          </Button>
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
              Select all
            </Button>
          )}
        </div>
        <div className="max-h-80 min-h-40 overflow-y-auto p-1.5" role="tree">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No service matches “{query}”.
            </p>
          )}
          {rows.map((s) => {
            const st = stateOf(s.id);
            const hasKids = children.has(s.id);
            const open = !collapsed.has(s.id) || !!visible;
            const total = hasKids ? leavesUnder(s.id).length : 0;
            const got = hasKids ? leavesUnder(s.id).filter((l) => picked.has(l)).length : 0;
            return (
              <div
                key={s.id}
                role="treeitem"
                aria-selected={st === "checked"}
                aria-expanded={hasKids ? open : undefined}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg py-1 pr-2 transition-colors",
                  disabled ? "cursor-default" : "cursor-pointer hover:bg-accent/60",
                  st === "checked" && "bg-primary/5",
                )}
                style={{ paddingLeft: 6 + depthOf(s.id) * 22 }}
                onClick={() => toggle(s.id)}
              >
                {hasKids ? (
                  <button
                    type="button"
                    aria-label={open ? "Collapse" : "Expand"}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOpen(s.id);
                    }}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" />
                )}
                <Checkbox
                  checked={
                    st === "checked" ? true : st === "indeterminate" ? "indeterminate" : false
                  }
                  disabled={!!disabled}
                  tabIndex={-1}
                  aria-label={`Select ${s.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggle(s.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{s.code}</span>
                  <span className={cn(hasKids && "font-semibold")}>{s.name}</span>
                </span>
                {hasKids && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                      got ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {got}/{total}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- selected ---------- */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between border-b bg-muted/30 px-3.5 py-2.5">
          <span className="text-sm font-semibold">
            Selected
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {leafCount}
            </span>
          </span>
          {!disabled && chips.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          )}
        </div>
        <div className="max-h-80 min-h-40 flex-1 overflow-y-auto p-2.5">
          {chips.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No service selected yet.
              {!disabled && <> Tick a service — or a whole group — on the left.</>}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {chips.map((s) => {
                const n = descendants(s.id).filter((d) => !children.has(d)).length;
                const trail: string[] = [];
                for (let p = parentOf(s.id); p; p = parentOf(p)) trail.unshift(byId.get(p)!.name);
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                          {s.code}
                        </span>
                        {s.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {trail.length ? trail.join(" › ") : "Service group"}
                        {n > 0 && ` · all ${n} services`}
                      </span>
                    </span>
                    {!disabled && (
                      <button
                        type="button"
                        aria-label={`Remove ${s.name}`}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => toggle(s.id)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
