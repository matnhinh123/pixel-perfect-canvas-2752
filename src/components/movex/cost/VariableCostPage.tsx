// Variable Cost: Salary Range · Fuel Cost · Toll Fee · Reference Trip Salary — each a page with the tabs above it,
// as on Fixed Cost. Vehicle types come from Master Data › Vehicle. The Fare Code of each variable cost is set
// on its own setup (Salary Range, Fuel Cost, Toll Fee).
import { SalaryRangeTab } from "@/components/movex/cost/SalaryRangeTab";
import { FuelCostTab } from "@/components/movex/cost/FuelCostTab";
import { ReferenceTripTab } from "@/components/movex/cost/ReferenceTripTab";
import { TollFeeTab } from "@/components/movex/cost/TollFeeTab";
import type { VariableCostTab } from "@/components/movex/cost/VariableCostTabs";

export function VariableCostPage({ tab }: { tab: VariableCostTab }) {
  if (tab === "fuel") return <FuelCostTab />;
  if (tab === "toll") return <TollFeeTab />;
  if (tab === "reference") return <ReferenceTripTab />;
  return <SalaryRangeTab />;
}
