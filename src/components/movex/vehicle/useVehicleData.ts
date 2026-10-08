import { useMemo, useSyncExternalStore } from "react";
import { useCollection } from "@/hooks/use-store";
import { vehicleMasterRepository } from "@/repositories";
import { subscribeKey } from "@/repositories/storage";
import {
  DEFAULT_ALERT_DAYS,
  getAlertDays,
  listVehicles,
  VEHICLE_ALERT_DAYS_KEY,
  vehicleExpiryAlerts,
  type VehicleExpiryAlert,
} from "@/services/vehicleMasterService";
import type { VehicleMasterRecord } from "@/types";

const subscribeAlertDays = (cb: () => void) => subscribeKey(VEHICLE_ALERT_DAYS_KEY, cb);

/** Expiry alert threshold in days (localStorage, default 30). Live across components. */
export function useVehicleAlertDays(): number {
  return useSyncExternalStore(subscribeAlertDays, getAlertDays, () => DEFAULT_ALERT_DAYS);
}

/** Non-deleted vehicles, with records stored by older app versions normalized. */
export function useVehicles(): VehicleMasterRecord[] {
  const all = useCollection(vehicleMasterRepository);
  return useMemo(() => listVehicles(all), [all]);
}

/** Registration / insurance / badge documents expired or expiring within the threshold. */
export function useVehicleExpiryAlerts(): VehicleExpiryAlert[] {
  const all = useCollection(vehicleMasterRepository);
  const days = useVehicleAlertDays();
  return useMemo(() => vehicleExpiryAlerts(all, days), [all, days]);
}

/** Number of documents expired / expiring within the threshold (for the notifications badge). */
export function useExpiringDocumentCount(): number {
  return useVehicleExpiryAlerts().length;
}
