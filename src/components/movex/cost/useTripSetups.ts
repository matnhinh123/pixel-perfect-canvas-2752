import { useMemo } from "react";
import { useCollection } from "@/hooks/use-store";
import { fuelCostRepository, salaryRangeRepository, tollStationRepository } from "@/repositories";

/** Everything a trip's variable cost is read from (Salary Ranges, Fuel Costs, Toll Stations), kept fresh. */
export function useTripSetups() {
  const salaryRanges = useCollection(salaryRangeRepository);
  const fuelCosts = useCollection(fuelCostRepository);
  const tollAll = useCollection(tollStationRepository);
  const tollMasters = useMemo(() => tollAll.filter((t) => !t.deleted), [tollAll]);
  return useMemo(
    () => ({ salaryRanges, fuelCosts, tollMasters }),
    [salaryRanges, fuelCosts, tollMasters],
  );
}
