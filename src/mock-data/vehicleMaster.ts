import { VEHICLE_MASTER_TYPES, type VehicleMasterRecord, type VehicleMasterType } from "@/types";

/** Tractor / Trailer / Truck (kept here for existing imports). */
export const VEHICLE_TYPES: readonly VehicleMasterType[] = VEHICLE_MASTER_TYPES;
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
  | "vehicleGroup"
  | "modelCode"
  | "productionCountry"
  | "chassisNumber"
  | "engineNumber"
  | "inspectionExpiry"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
> = {
  status: "Active",
  ownership: "Own",
  ownerId: "",
  authorizedPayload: "",
  productionYear: "",
  fuelRate: "",
  fuelCapacity: "",
  inspectionNo: "",
  insuranceExpiry: "",
  badgeExpiry: "",
  lifetimeLimit: "",
  policyNumber: "",
  tradeMark: "",
  buyingDate: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  rfidTag: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  contractNumber: "",
  inspectionReportNo: "",
  liabilityInsuranceNumber: "",
  fuelType: "",
  engineDisplacement: "",
  renovated: false,
  transportationBusiness: true,
  tachograph: false,
  telematics: false,
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
  group: string,
  model: string,
  country: string,
  vin: string,
  engine: string,
  inspectionExpiry: string,
  createdAt: string,
  createdBy: string,
  updatedBy: string,
  extra: Partial<VehicleMasterRecord> = {},
): VehicleMasterRecord => ({
  ...BLANK,
  id: `VH-${plate.replace(/[^A-Z0-9]/g, "")}`,
  plateNumber: plate,
  vehicleType: type,
  vehicleGroup: group,
  modelCode: model,
  productionCountry: country,
  chassisNumber: vin,
  engineNumber: engine,
  inspectionExpiry,
  createdAt,
  createdBy,
  updatedAt: createdAt,
  updatedBy,
  ...extra,
});

// Owners BP-2 (NPA) and BP-3 (HPLAL) are seeded Business Partners with the Vendor role.
export const seedVehicleMasters = (): VehicleMasterRecord[] => [
  v(
    "51D-34234",
    "Trailer",
    "Tractor / Container Truck",
    "HINO-XZU730L",
    "",
    "RLHFCMF6PNV846323",
    "",
    "2027-07-08",
    "2026-07-09T03:37:38",
    "Thuy Vu",
    "Lan Anh",
    {
      ownership: "Outsourced",
      ownerId: "BP-2",
      insuranceExpiry: inDays(12),
      badgeExpiry: "2027-07-08",
    },
  ),
  v(
    "51R-902.45",
    "Trailer",
    "Tractor / Container Truck",
    "THACO-SM940RM",
    "Vietnam",
    "RLHTRL6PNV902450",
    "",
    "2027-10-24",
    "2026-07-03T18:04:00",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "THACO", insuranceExpiry: "2027-03-31", badgeExpiry: "2027-10-24" },
  ),
  v(
    "29H-574.20",
    "Tractor",
    "Tractor / Container Truck",
    "HYUNDAI-HD1000",
    "Vietnam",
    "RLHHEAD6RNV574200",
    "",
    inDays(20),
    "2026-07-03T17:58:15",
    "Thuy Vu",
    "Thuy Vu",
    {
      tradeMark: "HYUNDAI",
      authorizedPayload: "38000",
      insuranceExpiry: "2027-05-15",
      badgeExpiry: "2027-12-17",
    },
  ),
  v(
    "51H-326.81",
    "Tractor",
    "Tractor / Container Truck",
    "HINO-FG8JT7A",
    "Vietnam",
    "RLHHEAD6PNV326810",
    "J08E-WE32681",
    "2027-11-20",
    "2026-07-03T17:53:39",
    "Thuy Vu",
    "Thuy Vu",
    {
      tradeMark: "HINO",
      fuelType: "Diesel",
      authorizedPayload: "30000",
      ownership: "Outsourced",
      ownerId: "BP-3",
      insuranceExpiry: "2027-11-20",
      badgeExpiry: inDays(-3),
    },
  ),
  v(
    "51D-846.32",
    "Truck",
    "Medium Truck",
    "HINO-XZU730L",
    "Vietnam",
    "RLHFCMF6PNV846320",
    "N04C-WL84632",
    "2027-11-19",
    "2026-07-03T17:38:43",
    "Thuy Vu",
    "Thuy Vu",
    {
      tradeMark: "HINO",
      fuelType: "Diesel",
      authorizedPayload: "5000",
      insuranceExpiry: "2027-06-30",
      badgeExpiry: "2027-11-19",
    },
  ),
  v(
    "51D-739.24",
    "Truck",
    "Medium Truck",
    "HINO-XZU730L",
    "Vietnam",
    "RLHFCMF6PNV739240",
    "N04C-WL73924",
    "2027-08-19",
    "2026-07-03T17:20:21",
    "Thuy Vu",
    "Thuy Vu",
    {
      tradeMark: "HINO",
      fuelType: "Diesel",
      authorizedPayload: "5000",
      insuranceExpiry: "2027-08-19",
      badgeExpiry: "2027-08-19",
    },
  ),
  v(
    "51C-789.45",
    "Truck",
    "Light Truck",
    "THACO-FD500-2023",
    "Vietnam",
    "RL4C3H70XPC12345A",
    "ENG4DB178945",
    "2027-06-29",
    "2026-07-02T17:22:07",
    "Thuy Vu",
    "Thuy Vu",
    {
      tradeMark: "THACO",
      fuelType: "Diesel",
      authorizedPayload: "2500",
      insuranceExpiry: "2027-06-29",
      badgeExpiry: "2027-06-29",
    },
  ),
];
