// List pieces shared by the Cost and Cost Group pages.
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { formatDateTime } from "@/lib/format";

export const statusFilter: QuickFilter = {
  key: "status",
  allLabel: "All statuses",
  options: ["Active", "Inactive"].map((v) => ({
    label: v,
    conditions: [{ field: "status", operator: "eq", value: v }],
  })),
};

export const updatedAtColumn = <T extends { updatedAt: string }>(): ListColumn<T> => ({
  key: "updatedAt",
  label: "Updated At",
  type: "date",
  value: (r) => r.updatedAt,
  render: (r) => (
    <span className="text-xs text-muted-foreground">{formatDateTime(r.updatedAt)}</span>
  ),
});
