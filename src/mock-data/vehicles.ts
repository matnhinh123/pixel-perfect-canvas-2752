import type { VehicleRecord } from "@/types";
import { tr } from "@/lib/i18n";
import { tollClassIndex, tollClassLabel } from "@/services/routing/RouteProvider";

/** Vehicle master data. Routing derives group, weight, routing profile and toll class from it. */
export const VEHICLES: VehicleRecord[] = [
  {
    id: "V-51D12345",
    plate: "51D-12345",
    name: "Hino 15T",
    group: "Heavy Truck",
    weightKg: 15000,
    profile: "Truck",
  },
  {
    id: "V-51C67890",
    plate: "51C-67890",
    name: "Isuzu 5T",
    group: "Medium Truck",
    weightKg: 5000,
    profile: "Truck",
  },
  {
    id: "V-50H24680",
    plate: "50H-24680",
    name: "Hyundai 2.5T",
    group: "Light Truck",
    weightKg: 2500,
    profile: "Truck",
  },
  {
    id: "V-51R88888",
    plate: "51R-88888",
    name: "Đầu kéo Container 40FT",
    nameEn: "Container Tractor 40FT",
    group: "Tractor / Container Truck",
    weightKg: 18000,
    profile: "Container",
  },
  {
    id: "V-29H13579",
    plate: "29H-13579",
    name: "Hino 8T",
    group: "Medium Truck",
    weightKg: 8000,
    profile: "Truck",
  },
];

export const findVehicle = (id: string | undefined) =>
  id ? VEHICLES.find((v) => v.id === id) : undefined;

export const vehicleName = (v: VehicleRecord) => (v.nameEn ? tr(v.name, v.nameEn) : v.name);

export const vehicleLabel = (v: VehicleRecord) => `${v.plate} — ${vehicleName(v)}`;

/** Toll classification ("Nhóm 1..5") — derived, never edited by the user. */
export const vehicleTollClass = (v: VehicleRecord) =>
  tollClassLabel(tollClassIndex(v.profile, v.weightKg));

/** Fields a route copies from the selected vehicle (used by Cost / list screens and the routing request). */
export const routeVehicleFields = (v: VehicleRecord) => ({
  vehicleId: v.id,
  vehicleProfile: v.profile,
  vehicleGroup: v.group,
  capacityKg: v.weightKg,
});
