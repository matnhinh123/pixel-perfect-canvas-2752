import type { VehicleRecord } from "@/types";
import { tollClassIndex, tollClassLabel } from "@/services/routing/RouteProvider";

/**
 * Vehicle type master data — routes pick a vehicle type, not a specific truck (no plates).
 * Routing derives group, reference weight, routing profile and toll class from it.
 */
export const VEHICLES: VehicleRecord[] = [
  {
    id: "VT-VAN",
    name: "Xe Van / bán tải",
    group: "Van / Pickup",
    weightKg: 1500,
    profile: "Truck",
  },
  {
    id: "VT-LIGHT",
    name: "Xe tải nhẹ 2.5T",
    group: "Light Truck",
    weightKg: 2500,
    profile: "Truck",
  },
  {
    id: "VT-MEDIUM",
    name: "Xe tải trung 8T",
    group: "Medium Truck",
    weightKg: 8000,
    profile: "Truck",
  },
  {
    id: "VT-HEAVY",
    name: "Xe tải nặng 15T",
    group: "Heavy Truck",
    weightKg: 15000,
    profile: "Truck",
  },
  {
    id: "VT-CONTAINER",
    name: "Đầu kéo container 40FT",
    group: "Tractor / Container Truck",
    weightKg: 18000,
    profile: "Container",
  },
];

/** Routes saved when a specific truck was picked resolve to that truck's type. */
const LEGACY_VEHICLE_IDS: Record<string, string> = {
  "V-51D12345": "VT-HEAVY",
  "V-51C67890": "VT-MEDIUM",
  "V-50H24680": "VT-LIGHT",
  "V-51R88888": "VT-CONTAINER",
  "V-29H13579": "VT-MEDIUM",
};

export const findVehicle = (id: string | undefined) => {
  if (!id) return undefined;
  const typeId = LEGACY_VEHICLE_IDS[id] ?? id;
  return VEHICLES.find((v) => v.id === typeId);
};

export const vehicleLabel = (v: VehicleRecord) => v.name;

/** Toll classification ("Nhóm 1..5") — derived, never edited by the user. */
export const vehicleTollClass = (v: VehicleRecord) =>
  tollClassLabel(tollClassIndex(v.profile, v.weightKg));

/** Fields a route copies from the selected vehicle type (used by Cost / list screens and the routing request). */
export const routeVehicleFields = (v: VehicleRecord) => ({
  vehicleId: v.id,
  vehicleProfile: v.profile,
  vehicleGroup: v.group,
  capacityKg: v.weightKg,
});
