import { useMemo } from "react";
import { useCollection } from "@/hooks/use-store";
import { vehicleMasterRepository } from "@/repositories";
import { cogsVehicleTypes, type CogsVehicleType } from "@/services/cost/cogsVehicle";

/** Vehicle types of the active vehicles in Master Data › Vehicle. */
export function useVehicleTypes(): CogsVehicleType[] {
  const all = useCollection(vehicleMasterRepository);
  return useMemo(() => cogsVehicleTypes(all), [all]);
}
