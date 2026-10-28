// COGS run by themselves: whenever a setup they are built from changes (routes, vehicles, internal costs
// and their mappings, salary ranges, fuel costs, variable cost mappings, fare codes, toll stations), the
// missing COGS are created and every COGS is worked out again (debounced).
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollStationRepository,
  variableCostMappingRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { subscribeKey } from "@/repositories/storage";
import { syncAllCogs } from "./cogsService";

const SOURCES = [
  routeRepository,
  vehicleMasterRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  salaryRangeRepository,
  fuelCostRepository,
  variableCostMappingRepository,
  costItemRepository,
  tollStationRepository,
];

/** Starts the automatic COGS sync (once now, then on every change of a source); returns the stop. */
export function startCogsAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        syncAllCogs();
      } catch (e) {
        console.error("COGS auto sync failed", e);
      }
    }, 300);
  };
  const offs = SOURCES.map((r) => subscribeKey(r.key, run));
  run();
  return () => {
    clearTimeout(timer);
    offs.forEach((off) => off());
  };
}
