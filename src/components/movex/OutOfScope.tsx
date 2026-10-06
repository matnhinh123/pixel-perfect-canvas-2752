import { Link } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/movex/common";

/** Menu entries that exist in the product but are outside this demo's scope. */
export function OutOfScope({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader crumbs={[{ label: title }]} title={title} />
      <Panel title={title}>
        <EmptyState
          icon={<Construction className="h-10 w-10" />}
          title="Ngoài phạm vi demo"
          description={description}
          action={
            <Button asChild size="sm">
              <Link to="/routing">Đi tới Routing</Link>
            </Button>
          }
        />
      </Panel>
    </div>
  );
}

/** Adds the BaseRecord fields so read-only master data can reuse EntityListPage. */
export const asReadOnlyRecord = <T extends object>(row: T) => ({
  ...row,
  status: "Active" as const,
  createdAt: "",
  createdBy: "",
  updatedAt: "",
  updatedBy: "",
});
