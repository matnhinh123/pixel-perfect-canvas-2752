import { VEHICLE_MASTER_TYPES, type VehicleMasterRecord, type VehicleMasterType } from "@/types";

/** TRUCK / HEAD / TRAILER (kept here for existing imports). */
export const VEHICLE_TYPES: readonly VehicleMasterType[] = VEHICLE_MASTER_TYPES;
export const VEHICLE_TYPE_LABELS: Record<VehicleMasterType, string> = {
  TRUCK: "VH022 — TRUCK",
  HEAD: "VH023 — HEAD",
  TRAILER: "VH024 — TRAILER",
};
/** Vehicle Group catalog (neutral codes); on a vehicle it applies to TRUCK only. */
export const VEHICLE_MASTER_GROUPS = ["Group 01", "Group 02", "Group 03", "Group 04", "Group 05"];
/** Common Code TRUCK_TYPE: commercial load class of a truck. */
export const TRUCK_TYPES = ["1 tấn", "2 tấn", "5 tấn", "8 tấn", "10 tấn", "15 tấn", "20 tấn"];
export const FUEL_TYPES = ["Diesel", "Gasoline", "CNG", "LPG", "Electric", "Hybrid"];
export const ACQUISITION_CURRENCIES = ["VND", "USD", "EUR", "JPY"];

const BLANK: Omit<
  VehicleMasterRecord,
  | "id"
  | "plateNumber"
  | "vehicleType"
  | "chassisNumber"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
> = {
  status: "Active",
  vehicleGroup: "",
  truckType: "",
  trailerType: "",
  productionYear: "",
  fuelType: "",
  fuelRate: "",
  fuelCapacity: "",
  registrationExpiry: "",
  inspectionExpiry: "",
  lifetimeLimit: "",
  containerDimension: "",
  authorizedPayload: "",
  authorizedTowedMass: "",
  rfidTag: "",
  telematics: true,
  buyingDate: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  containerMappings: [],
};

/** YYYY-MM-DD `n` days from today, so the demo always has a few documents about to expire. */
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const v = (
  plate: string,
  type: VehicleMasterType,
  vin: string,
  createdAt: string,
  extra: Partial<VehicleMasterRecord> = {},
): VehicleMasterRecord => ({
  ...BLANK,
  id: `VH-${plate.replace(/[^A-Z0-9]/g, "")}`,
  plateNumber: plate,
  vehicleType: type,
  chassisNumber: vin,
  createdAt,
  createdBy: "Thuy Vu",
  updatedAt: createdAt,
  updatedBy: "Thuy Vu",
  ...extra,
});

export const seedVehicleMasters = (): VehicleMasterRecord[] => [
  v("51C-123.45", "TRUCK", "RLHPC1234M5678901", "2026-07-02T17:22:07", {
    vehicleGroup: "Group 01",
    truckType: "5 tấn",
    productionYear: "2019",
    fuelType: "Diesel",
    fuelRate: "22",
    fuelCapacity: "200",
    registrationExpiry: "2026-12-31",
    inspectionExpiry: inDays(20),
    lifetimeLimit: "2044-12-31",
    containerDimension: "6200×2350×2400",
    authorizedPayload: "5000",
    rfidTag: "VETC-3401-0012345",
    buyingDate: "2019-05-20",
    acquisitionCost: "980000000",
  }),
  v("51D-846.32", "TRUCK", "RLHFCMF6PNV846320", "2026-07-03T17:38:43", {
    vehicleGroup: "Group 02",
    truckType: "8 tấn",
    productionYear: "2021",
    fuelType: "Diesel",
    fuelRate: "18",
    fuelCapacity: "160",
    registrationExpiry: "2027-11-19",
    inspectionExpiry: "2027-06-30",
    lifetimeLimit: "2046-12-31",
    containerDimension: "7400×2350×2500",
    authorizedPayload: "8000",
    rfidTag: "VETC-3401-0018463",
  }),
  v("51C-789.45", "TRUCK", "RL4C3H70XPC12345A", "2026-07-03T17:20:21", {
    vehicleGroup: "Group 01",
    truckType: "2 tấn",
    productionYear: "2023",
    fuelType: "Diesel",
    fuelRate: "12",
    fuelCapacity: "100",
    registrationExpiry: inDays(-3),
    inspectionExpiry: "2027-06-29",
    lifetimeLimit: "2048-12-31",
    containerDimension: "4300×1850×1900",
    authorizedPayload: "2500",
  }),
  v("51R-001.23", "HEAD", "JHDHEAD6RNV001230", "2026-07-03T17:58:15", {
    productionYear: "2020",
    fuelType: "Diesel",
    fuelRate: "38",
    fuelCapacity: "400",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    lifetimeLimit: "2045-12-31",
    authorizedTowedMass: "32000",
    rfidTag: "EPASS-0791-0001230",
    containerMappings: [
      { rid: "m1", trailerType: "20 ft", vehicleGroup: "Group 02" },
      { rid: "m2", trailerType: "40 ft", vehicleGroup: "Group 04" },
    ],
  }),
  v("29H-574.20", "HEAD", "RLHHEAD6RNV574200", "2026-07-03T17:53:39", {
    productionYear: "2022",
    fuelType: "Diesel",
    fuelRate: "35",
    fuelCapacity: "350",
    registrationExpiry: "2027-11-20",
    inspectionExpiry: inDays(12),
    lifetimeLimit: "2047-12-31",
    authorizedTowedMass: "30000",
    containerMappings: [{ rid: "m1", trailerType: "40 ft", vehicleGroup: "Group 04" }],
  }),
  v("51R-045.67", "TRAILER", "TRL40CMF6PNV04567", "2026-07-03T18:04:00", {
    trailerType: "40 ft",
    productionYear: "2021",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    authorizedPayload: "30500",
    telematics: false,
  }),
  v("51R-078.90", "TRAILER", "TRL20CMF6PNV07890", "2026-07-09T03:37:38", {
    trailerType: "20 ft",
    registrationExpiry: "2027-07-08",
    inspectionExpiry: "2027-07-08",
    authorizedPayload: "26000",
    telematics: false,
  }),
];
