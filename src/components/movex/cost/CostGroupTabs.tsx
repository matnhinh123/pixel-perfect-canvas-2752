import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CostGroupRecord, CostItemRecord } from "@/types";
import { cn } from "@/lib/utils";
import { costGroupTabs } from "@/services/costMasterService";
import { OverflowList, type OverflowItem } from "./OverflowList";

const ALL = "__all__";

/**
 * Cost list header: one tab per Cost Group (with its Cost Code count), on a single row — tabs that
 * do not fit go under "More". Groups are added / edited from here (drawer); a group's Parent Cost
 * Group is only shown in that drawer.
 */
export function CostGroupTabs({
  groups,
  items,
  selected,
  onSelect,
  onAdd,
  onEdit,
}: {
  groups: CostGroupRecord[];
  items: CostItemRecord[];
  selected: CostGroupRecord | null;
  onSelect: (g: CostGroupRecord | null) => void;
  onAdd: () => void;
  onEdit: (g: CostGroupRecord) => void;
}) {
  const tabs = costGroupTabs(groups, items);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const inactive = new Set(groups.filter((g) => g.status !== "Active").map((g) => g.id));

  const tabItems: OverflowItem[] = [
    { key: ALL, label: "All", count: items.length },
    ...tabs.map((g) => ({
      key: g.id,
      label: g.name,
      count: items.filter((c) => c.groupId === g.id).length,
    })),
  ];

  const tabClass = (on: boolean) =>
    cn(
      "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
      on
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mb-4 flex items-end gap-1 border-b">
      <OverflowList
        ariaLabel="Cost Group"
        items={tabItems}
        selectedKey={selected?.id ?? ALL}
        onSelect={(k) => onSelect(byId.get(k) ?? null)}
        moreLabel={(n) => `More (${n})`}
        moreClassName={(active) => tabClass(active)}
        renderItem={(i, on) => {
          const g = byId.get(i.key);
          return (
            <button
              type="button"
              role="tab"
              aria-selected={on}
              title={g ? `${g.code} · ${g.name}` : undefined}
              className={tabClass(on)}
              onClick={() => onSelect(g ?? null)}
            >
              {i.label}
              {inactive.has(i.key) && (
                <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">
                  Inactive
                </span>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i.count}
              </span>
            </button>
          );
        }}
      />
      {selected && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 shrink-0"
          title={`Edit ${selected.name}`}
          onClick={() => onEdit(selected)}
        >
          <Pencil className="h-4 w-4" />
          Edit group
        </Button>
      )}
      <Button variant="ghost" size="sm" className="mb-1 shrink-0 text-primary" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add group
      </Button>
    </div>
  );
}
