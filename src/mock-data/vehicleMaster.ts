import { VEHICLE_TYPE_NAMES, type VehicleMasterRecord } from "@/types";

/** TRUCK / HEADER / TRAILER: the system Vehicle Types (Common Code may add more). */
export const VEHICLE_TYPES: readonly string[] = VEHICLE_TYPE_NAMES;
/** Vehicle Group catalog (neutral codes); on a vehicle it applies to TRUCK only. */
export const VEHICLE_MASTER_GROUPS = ["Group 01", "Group 02", "Group 03", "Group 04", "Group 05"];
/** Common Code TRUCK_TYPE: commercial load class of a truck. */
export const TRUCK_TYPES = ["1 tấn", "2 tấn", "5 tấn", "8 tấn", "10 tấn", "15 tấn", "20 tấn"];
/** Common Code TRADE_MARK: vehicle manufacturer. */
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
/** Common Code TRAILER_TYPE: body type of a trailer (its size is Trailer Size: 20 ft / 40 ft). */
export const TRAILER_BODY_TYPES = [
  "Skeletal",
  "Flatbed",
  "Low Bed",
  "Side Wall",
  "Box",
  "Dump",
  "Tank",
];
export const FUEL_TYPES = ["Diesel", "Gasoline", "CNG", "LPG", "Electric", "Hybrid"];
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
  trailerSize: "",
  trailerAxles: "",
  engineNumber: "",
  tradeMark: "",
  modelCode: "",
  productionYear: "",
  fuelType: "",
  fuelRate: "",
  fuelCapacity: "",
  registrationExpiry: "",
  inspectionNo: "",
  inspectionExpiry: "",
  lifetimeLimit: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  authorizedPayload: "",
  authorizedTowedMass: "",
  policyNumber: "",
  liabilityInsuranceNumber: "",
  buyingDate: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  contractNumber: "",
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
  type: string,
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
    engineNumber: "D6CB1234567",
    inspectionNo: "VN-1234567",
    tradeMark: "HYUNDAI",
    modelCode: "HD210-2018",
    kerbMass: "8500",
    overallDimension: "8100×2500×3200",
    policyNumber: "BV-VC-2026-001245",
    liabilityInsuranceNumber: "BV-TNDS-2026-008812",
    contractNumber: "HD-MUA-2019-015",
    vehicleGroup: "Group 03",
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
    buyingDate: "2019-05-20",
    acquisitionCost: "980000000",
  }),
  v("51D-846.32", "TRUCK", "RLHFCMF6PNV846320", "KD-2024-000812", "2026-07-03T17:38:43", {
    engineNumber: "N04C-WL84632",
    tradeMark: "HINO",
    modelCode: "HINO-XZU730L",
    vehicleGroup: "Group 03",
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
  }),
  v("51C-789.45", "TRUCK", "RL4C3H70XPC12345A", "KD-2023-004512", "2026-07-03T17:20:21", {
    engineNumber: "ENG4DB178945",
    tradeMark: "THACO",
    modelCode: "THACO-FD500-2023",
    vehicleGroup: "Group 02",
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
  v("51R-001.23", "HEADER", "JHDHEAD6RNV001230", "KD-2024-001023", "2026-07-03T17:58:15", {
    engineNumber: "D6AC0012300",
    tradeMark: "HYUNDAI",
    modelCode: "HD1000",
    productionYear: "2020",
    fuelType: "Diesel",
    fuelRate: "38",
    fuelCapacity: "400",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    lifetimeLimit: "2045-12-31",
    authorizedTowedMass: "32000",
  }),
  v("29H-574.20", "HEADER", "RLHHEAD6RNV574200", "KD-2024-001187", "2026-07-03T17:53:39", {
    engineNumber: "J08E-WE32681",
    tradeMark: "HINO",
    productionYear: "2022",
    fuelType: "Diesel",
    fuelRate: "35",
    fuelCapacity: "350",
    registrationExpiry: "2027-11-20",
    inspectionExpiry: inDays(12),
    lifetimeLimit: "2047-12-31",
    authorizedTowedMass: "30000",
  }),
  v("51R-045.67", "TRAILER", "TRL40CMF6PNV04567", "KD-2024-002045", "2026-07-03T18:04:00", {
    tradeMark: "THACO",
    trailerType: "Skeletal",
    trailerSize: "40 ft",
    trailerAxles: "3",
    productionYear: "2021",
    registrationExpiry: "2027-06-30",
    inspectionExpiry: "2027-03-01",
    authorizedPayload: "30500",
  }),
  v("51R-078.90", "TRAILER", "TRL20CMF6PNV07890", "KD-2024-002078", "2026-07-09T03:37:38", {
    trailerType: "Flatbed",
    trailerSize: "20 ft",
    trailerAxles: "2",
    registrationExpiry: "2027-07-08",
    inspectionExpiry: "2027-07-08",
    authorizedPayload: "26000",
  }),
];

/** Demo fleet: 15 five-ton trucks (made-up but valid data), added after the first seed. */
export const seedFiveTonTrucks = (): VehicleMasterRecord[] => {
  const brands: [string, string, string, string][] = [
    // brand, model, engine prefix, VIN prefix
    ["HINO", "HINO-FC9JLTC", "J05E-", "JHHFC9JL"],
    ["ISUZU", "ISUZU-NQR75ME4", "4HK1-", "JAANQR75"],
    ["HYUNDAI", "HD120SL-2022", "D4GA-", "KMFGA17B"],
    ["THACO", "THACO-OLLIN720", "4D30-", "RLLOL720"],
    ["FUSO", "FUSO-CANTER-TF85", "4P10-", "JLFTF85C"],
  ];
  const provinces = ["51D", "51C", "50H", "61C", "60C"];
  return Array.from({ length: 15 }, (_, i) => {
    const [brand, model, eng, vinPre] = brands[i % brands.length]!;
    const n = 201 + i * 7;
    const plate = `${provinces[i % provinces.length]}-${String(n).padStart(3, "0")}.${String(10 + ((i * 13) % 90)).padStart(2, "0")}`;
    const year = 2018 + (i % 7);
    const month = String((i % 12) + 1).padStart(2, "0");
    return v(
      plate,
      "TRUCK",
      `${vinPre}${String(100000000 + i * 37919).slice(-9)}`,
      `KD-2026-${String(2100 + i)}`,
      `2026-08-${String(1 + i).padStart(2, "0")}T08:${String(10 + i).padStart(2, "0")}:00`,
      {
        vehicleGroup: "Group 03",
        truckType: "5 tấn",
        engineNumber: `${eng}${String(500000 + i * 1373)}`,
        tradeMark: brand,
        modelCode: model,
        productionYear: String(year),
        fuelType: "Diesel",
        fuelRate: String(14 + (i % 5)),
        fuelCapacity: String(i % 2 ? 150 : 200),
        // A few documents due soon / expired so the alerts have something to show.
        registrationExpiry: i === 4 ? inDays(-10) : `2027-${month}-28`,
        inspectionNo: `${provinces[i % provinces.length]!.slice(0, 2)}0${(i % 9) + 1}D-${String(10234 + i * 41)}`,
        inspectionExpiry: i === 7 ? inDays(15) : i === 11 ? inDays(-2) : `2027-${month}-15`,
        lifetimeLimit: `${year + 25}-12-31`,
        liabilityInsuranceNumber: `TNDS-2026-${String(30500 + i)}`,
        policyNumber: i % 2 ? "" : `VCX-2026-${String(80100 + i)}`,
        overallDimension: "6950×2250×3150",
        containerDimension: "5200×2100×2050",
        kerbMass: String(4200 + (i % 4) * 150),
        authorizedPayload: String(4950 + (i % 3) * 50),
        buyingDate: `${year}-${month}-10`,
        acquisitionCost: String(620000000 + (i % 5) * 35000000),
        contractNumber: `HD-MUA-${year}-${String(40 + i)}`,
        status: i === 14 ? "Inactive" : "Active",
      },
    );
  });
};
