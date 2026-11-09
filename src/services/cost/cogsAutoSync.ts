// COGS run by themselves: whenever a setup they are built from changes (routes, vehicles, internal costs
// and their mappings, salary ranges, fuel costs, toll fees, fare codes, toll stations), the missing
// Toll Fees and COGS are created and every COGS is worked out again (debounced).
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollStationRepository,
  tollFeeRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { subscribeKey } from "@/repositories/storage";
import { syncAllCogs } from "./cogsService";
import { syncTollFees } from "./tollFee";

const SOURCES = [
  routeRepository,
  vehicleMasterRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  salaryRangeRepository,
  fuelCostRepository,
  tollFeeRepository,
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
        // Every route has its Toll Fee (a new route gets one) before the COGS are worked out.
        syncTollFees();
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
