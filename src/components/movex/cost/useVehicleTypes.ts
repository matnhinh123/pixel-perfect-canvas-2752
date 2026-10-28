import { useMemo } from "react";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository, vehicleMasterRepository } from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import { cogsVehicleTypes, type CogsVehicleType } from "@/services/cost/cogsVehicle";
import { containerChoicesOf } from "@/services/cost/containerTypes";

/**
 * Vehicle types of the active vehicles in Master Data › Vehicle: Truck Types, and the Container Types
 * (Common Code) a header can pull.
 */
export function useVehicleTypes(): CogsVehicleType[] {
  const all = useCollection(vehicleMasterRepository);
  const codes = useCollection(commonCodeRepository);
  const containers = useMemo(
    () => containerChoicesOf(codes.find((r) => r.id === CC.CONTAINER_TYPE)),
    [codes],
  );
  return useMemo(() => cogsVehicleTypes(all, containers), [all, containers]);
}
