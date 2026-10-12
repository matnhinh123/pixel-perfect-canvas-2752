import { Link } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/movex/common";
import { useT } from "@/lib/i18n";

/** Menu entries that exist in the product but are outside this demo's scope. */
export function OutOfScope({ title, description }: { title: string; description: string }) {
  const { t } = useT();
  return (
    <div>
      <PageHeader crumbs={[{ label: title }]} title={title} />
      <Panel title={title}>
        <EmptyState
          icon={<Construction className="h-10 w-10" />}
          title={t("Ngoài phạm vi demo", "Outside the demo scope")}
          description={description}
          action={
            <Button asChild size="sm">
              <Link to="/routing">{t("Đi tới Routing", "Go to Routing")}</Link>
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

/** Menu entries that are planned but not built yet (shown with the same chrome as a list page). */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Cost" }, { label: title }]}
        title={title}
        subtitle={description}
      />
      <Panel>
        <EmptyState
          icon={<Construction className="h-10 w-10" />}
          title="Coming soon"
          description={`${title} is on the roadmap and will be available in a later release.`}
          action={
            <Button asChild size="sm">
              <Link to="/cost">Go to Cost</Link>
            </Button>
          }
        />
      </Panel>
    </div>
  );
}
