import type { VehicleMasterRecord } from "@/types";

export const VEHICLE_TYPES = ["TRUCK", "HEAD", "TRAILER", "5T", "VAN"];
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
  | "registrationExpiry"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "updatedBy"
> = {
  status: "Active",
  productionYear: "",
  fuelRate: "",
  fuelCapacity: "",
  inspectionNo: "",
  inspectionExpiry: "",
  lifetimeLimit: "",
  policyNumber: "",
  tradeMark: "",
  buyingDate: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  authorizedPayload: "",
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

const v = (
  plate: string,
  type: string,
  group: string,
  model: string,
  country: string,
  vin: string,
  engine: string,
  regExpiry: string,
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
  registrationExpiry: regExpiry,
  createdAt,
  createdBy,
  updatedAt: createdAt,
  updatedBy,
  ...extra,
});

export const seedVehicleMasters = (): VehicleMasterRecord[] => [
  v(
    "51D-34234",
    "TRAILER",
    "",
    "HINO-XZU730L",
    "",
    "RLHFCMF6PNV846323",
    "",
    "2027-07-08",
    "2026-07-09T03:37:38",
    "Thuy Vu",
    "Lan Anh",
  ),
  v(
    "51R-902.45",
    "TRAILER",
    "DEFAULT",
    "THACO-SM940RM",
    "Vietnam",
    "RLHTRL6PNV902450",
    "",
    "2027-10-24",
    "2026-07-03T18:04:00",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "THACO" },
  ),
  v(
    "29H-574.20",
    "HEAD",
    "DEFAULT",
    "HYUNDAI-HD1000",
    "Vietnam",
    "RLHHEAD6RNV574200",
    "",
    "2027-12-17",
    "2026-07-03T17:58:15",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "HYUNDAI" },
  ),
  v(
    "51H-326.81",
    "HEAD",
    "DEFAULT",
    "HINO-FG8JT7A",
    "Vietnam",
    "RLHHEAD6PNV326810",
    "J08E-WE32681",
    "2027-11-20",
    "2026-07-03T17:53:39",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "HINO", fuelType: "Diesel" },
  ),
  v(
    "51D-846.32",
    "TRUCK",
    "DEFAULT",
    "HINO-XZU730L",
    "Vietnam",
    "RLHFCMF6PNV846320",
    "N04C-WL84632",
    "2027-11-19",
    "2026-07-03T17:38:43",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "HINO", fuelType: "Diesel", authorizedPayload: "5000" },
  ),
  v(
    "51D-739.24",
    "TRUCK",
    "DEFAULT",
    "HINO-XZU730L",
    "Vietnam",
    "RLHFCMF6PNV739240",
    "N04C-WL73924",
    "2027-08-19",
    "2026-07-03T17:20:21",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "HINO", fuelType: "Diesel", authorizedPayload: "5000" },
  ),
  v(
    "51C-789.45",
    "5T",
    "DEFAULT",
    "THACO-FD500-2023",
    "Vietnam",
    "RL4C3H70XPC12345A",
    "ENG4DB178945",
    "2027-06-29",
    "2026-07-02T17:22:07",
    "Thuy Vu",
    "Thuy Vu",
    { tradeMark: "THACO", fuelType: "Diesel", authorizedPayload: "5000" },
  ),
];
