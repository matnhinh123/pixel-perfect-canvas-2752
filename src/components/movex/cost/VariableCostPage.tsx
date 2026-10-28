// Variable Cost: Salary Range · Fuel Cost · Variable Cost Mapping · Reference Trip Salary — each a page with the tabs above it,
// as on Fixed Cost. Vehicle types come from Master Data › Vehicle.
import { SalaryRangeTab } from "@/components/movex/cost/SalaryRangeTab";
import { FuelCostTab } from "@/components/movex/cost/FuelCostTab";
import { ReferenceTripTab } from "@/components/movex/cost/ReferenceTripTab";
import { VariableMappingTab } from "@/components/movex/cost/VariableMappingTab";
import type { VariableCostTab } from "@/components/movex/cost/VariableCostTabs";

export function VariableCostPage({ tab }: { tab: VariableCostTab }) {
  if (tab === "fuel") return <FuelCostTab />;
  if (tab === "mapping") return <VariableMappingTab />;
  if (tab === "reference") return <ReferenceTripTab />;
  return <SalaryRangeTab />;
}
