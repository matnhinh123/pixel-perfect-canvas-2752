// Variable Cost: Salary Range (with its calculation rule) · Fuel Cost · Variable Cost Mapping.
// Vehicle types come from Master Data › Vehicle.
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/movex/common";
import { SalaryRangeTab } from "@/components/movex/cost/SalaryRangeTab";
import { FuelCostTab } from "@/components/movex/cost/FuelCostTab";
import { VariableMappingTab } from "@/components/movex/cost/VariableMappingTab";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";

const TABS = [
  ["salary", "Salary Range"],
  ["fuel", "Fuel Cost"],
  ["mapping", "Variable Cost Mapping"],
] as const;

export type VariableCostTab = (typeof TABS)[number][0];

export function VariableCostPage({
  tab,
  onTab,
}: {
  tab: VariableCostTab;
  onTab: (tab: VariableCostTab) => void;
}) {
  const types = useVehicleTypes();
  return (
    <div>
      <PageHeader crumbs={[{ label: "Variable Cost" }]} title="Variable Cost" />
      {types.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            No active vehicles in Master Data › Vehicle yet — add a truck or a header there to get
            vehicle types.{" "}
            <Link to="/vehicle" className="font-semibold text-primary hover:underline">
              Open Vehicle
            </Link>
          </span>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => onTab(v as VariableCostTab)}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-3 rounded-none border-b bg-transparent p-0">
          {TABS.map(([k, label]) => (
            <TabsTrigger
              key={k}
              value={k}
              className="rounded-none border-b-2 border-transparent py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="salary">
          <SalaryRangeTab />
        </TabsContent>
        <TabsContent value="fuel">
          <FuelCostTab />
        </TabsContent>
        <TabsContent value="mapping">
          <VariableMappingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
