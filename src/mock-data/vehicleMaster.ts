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
export const TRADE_MARKS = [
  "HINO",
  "ISUZU",
  "HYUNDAI",
  "THACO",
  "FUSO",
  "HOWO",
  "DONGFENG",
  "VOLVO",
];
export const FUEL_TYPES = ["Diesel", "Gasoline", "CNG", "LPG", "Electric", "Hybrid"];
export const PRODUCTION_COUNTRIES = [
  "Vietnam",
  "Japan",
  "Korea",
  "China",
  "Thailand",
  "Germany",
  "USA",
];
export const ACQUISITION_CURRENCIES = ["VND", "USD", "EUR", "JPY"];

const BLANK: Omit<
  VehicleMasterRecord,
  | "id"
  | "plateNumber"
  | "vehicleType"
  | "chassisNumber"
  | "inspectionReportNo"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
> = {
  status: "Active",
  vehicleGroup: "",
  truckType: "",
  trailerType: "",
  engineNumber: "",
  productionYear: "",
  fuelRate: "",
  fuelCapacity: "",
  registrationExpiry: "",
  inspectionNo: "",
  inspectionExpiry: "",
  lifetimeLimit: "",
  policyNumber: "",
  tradeMark: "",
  modelCode: "",
  buyingDate: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  authorizedPayload: "",
  rfidTag: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  contractNumber: "",
  liabilityInsuranceNumber: "",
  fuelType: "",
  engineDisplacement: "",
  authorizedTowedMass: "",
  productionCountry: "",
  renovated: false,
  transportationBusiness: true,
  tachograph: true,
  telematics: false,
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
  inspectionReportNo: string,
  createdAt: string,
  extra: Partial<VehicleMasterRecord> = {},
): VehicleMasterRecord => ({
  ...BLANK,
  id: `VH-${plate.replace(/[^A-Z0-9]/g, "")}`,
  plateNumber: plate,
  vehicleType: type,
  chassisNumber: vin,
  inspectionReportNo,
  createdAt,
  createdBy: "Thuy Vu",
  updatedAt: createdAt,
  updatedBy: "Thuy Vu",
  ...extra,
});

export const seedVehicleMasters = (): VehicleMasterRecord[] => [
  v("51C-123.45", "TRUCK", "RLHPC1234M5678901", "KD-2024-000789", "2026-07-02T17:22:07", {
    vehicleGroup: "Group 01",
    truckType: "5 tấn",
    engineNumber: "D6CB1234567",
    productionYear: "2019",
    fuelRate: "22",
    fuelCapacity: "200",
    registrationExpiry: "2026-12-31",
    inspectionNo: "VN-1234567",
    inspectionExpiry: inDays(20),
    tradeMark: "HYUNDAI",
    modelCode: "HD210-2018",
    fuelType: "Diesel",
    authorizedPayload: "5000",
    kerbMass: "8500",
    productionCountry: "Korea",
  }),
  v("51D-846.32", "TRUCK", "RLHFCMF6PNV846320", "KD-2024-000812", "2026-07-03T17:38:43", {
    vehicleGroup: "Group 02",
    truckType: "8 tấn",
    engineNumber: "N04C-WL84632",
    productionYear: "2021",
    fuelRate: "18",
    fuelCapacity: "160",
    registrationExpiry: "2027-11-19",
    inspectionExpiry: "2027-06-30",
    tradeMark: "HINO",
    modelCode: "HINO-XZU730L",
    fuelType: "Diesel",
    authorizedPayload: "8000",
  }),
  v("51C-789.45", "TRUCK", "RL4C3H70XPC12345A", "KD-2023-004512", "2026-07-03T17:20:21", {
    vehicleGroup: "Group 01",
    truckType: "2 tấn",
    engineNumber: "ENG4DB178945",
    productionYear: "2023",
    fuelRate: "12",
    fuelCapacity: "100",
    registrationExpiry: inDays(-3),
    inspectionExpiry: "2027-06-29",
    tradeMark: "THACO",
    modelCode: "THACO-FD500-2023",
    fuelType: "Diesel",
    authorizedPayload: "2500",
  }),
  v("51R-001.23", "HEAD", "JHDHEAD6RNV001230", "KD-2024-001023", "2026-07-03T17:58:15", {
    engineNumber: "D6AC0012300",
    productionYear: "2020",
    fuelRate: "38",
    fuelCapacity: "400",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    tradeMark: "HYUNDAI",
    modelCode: "HD1000",
    fuelType: "Diesel",
    authorizedTowedMass: "32000",
    containerMappings: [
      { rid: "m1", trailerType: "20 ft", vehicleGroup: "Group 02" },
      { rid: "m2", trailerType: "40 ft", vehicleGroup: "Group 04" },
    ],
  }),
  v("29H-574.20", "HEAD", "RLHHEAD6RNV574200", "KD-2024-001187", "2026-07-03T17:53:39", {
    engineNumber: "J08E-WE32681",
    productionYear: "2022",
    fuelRate: "35",
    fuelCapacity: "350",
    registrationExpiry: "2027-11-20",
    inspectionExpiry: inDays(12),
    tradeMark: "HINO",
    fuelType: "Diesel",
    authorizedTowedMass: "30000",
    containerMappings: [{ rid: "m1", trailerType: "40 ft", vehicleGroup: "Group 04" }],
  }),
  v("51R-045.67", "TRAILER", "TRL40CMF6PNV04567", "KD-2024-002045", "2026-07-03T18:04:00", {
    trailerType: "40 ft",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    tradeMark: "THACO",
    modelCode: "THACO-SM940RM",
  }),
  v("51R-078.90", "TRAILER", "TRL20CMF6PNV07890", "KD-2024-002078", "2026-07-09T03:37:38", {
    trailerType: "20 ft",
    registrationExpiry: "2027-07-08",
    inspectionExpiry: "2027-07-08",
  }),
];
