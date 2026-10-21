// Demo seed for Master Data > Cost > Fixed Cost.
import type { FixedCostRecord, FixedCostSummaryRecord } from "@/types";

/** Rate to VND. */
export const FIXED_COST_RATES: Record<string, number> = { VND: 1, USD: 25400 };

const meta = {
  createdAt: "2026-09-12T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-09-12T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

/** Vietnamese names of the demo fixed costs. */
const LOCAL_NAMES: Record<string, string> = {
  "FC-DEP-TRK": "Khấu hao xe tải",
  "FC-DEP-HEAD": "Khấu hao đầu kéo",
  "FC-DEP-TRL": "Khấu hao rơ moóc",
  "FC-FIN-HEAD": "Chi phí tài chính đầu kéo",
  "FC-FIN-TRL": "Chi phí tài chính rơ moóc",
  "FC-MGMT": "Chi phí quản lý",
  "FC-INS": "Bảo hiểm xe",
  "FC-GPS": "Phí GPS & camera",
  "FC-LICENSE": "Phí giấy phép kinh doanh vận tải",
  "FC-OLD": "Bộ bạt phủ (ngưng dùng)",
};

/** Financial cost of an asset: 6.8 %/year on its full value for 5 years (60 months). */
const interestOf = (value: number) => Math.round(value * 0.068 * 5);
const HEAD = 1_300_000_000;
const TRAILER = 280_000_000;

const fc = (
  id: string,
  code: string,
  name: string,
  costValue: number,
  allocationBase: number,
  allocationUnit: FixedCostRecord["allocationUnit"],
  extra: Partial<FixedCostRecord> = {},
): FixedCostRecord => ({
  id,
  code,
  name,
  localName: LOCAL_NAMES[id] ?? "",
  costType: "Asset",
  costValue,
  currency: "VND",
  exchangeRate: 1,
  allocationBase,
  allocationUnit,
  allocationDays: 26,
  status: "Active",
  ...meta,
  ...extra,
});

export const seedFixedCosts = (): FixedCostRecord[] => [
  fc("FC-DEP-TRK", "FC_DEPRECIATION", "Truck depreciation", 1_200_000_000, 8, "Year"),
  // Operating cost of a header + 40 ft trailer per day: depreciation 60 months over 26 days a month,
  // financial cost 6.8 %/year over 360 days a year (30 a month), management 200,000 a day.
  fc("FC-DEP-HEAD", "FC_DEP_HEAD", "Header depreciation", HEAD, 60, "Month"),
  fc("FC-DEP-TRL", "FC_DEP_TRAILER", "Trailer depreciation", TRAILER, 60, "Month"),
  fc("FC-FIN-HEAD", "FC_FIN_HEAD", "Header financial cost", interestOf(HEAD), 60, "Month", {
    costType: "Non Asset",
    allocationDays: 30,
  }),
  fc("FC-FIN-TRL", "FC_FIN_TRAILER", "Trailer financial cost", interestOf(TRAILER), 60, "Month", {
    costType: "Non Asset",
    allocationDays: 30,
  }),
  fc("FC-MGMT", "FC_MANAGEMENT", "Management cost", 200_000, 1, "Day", {
    costType: "Non Asset",
  }),
  fc("FC-INS", "FC_INSURANCE", "Vehicle insurance", 36_000_000, 1, "Year", {
    costType: "Non Asset",
  }),
  fc("FC-GPS", "FC_GPS", "GPS & camera subscription", 150_000, 1, "Month", {
    costType: "Non Asset",
  }),
  fc("FC-LICENSE", "FC_LICENSE", "Operating license fee", 450_000, 1, "Day", {
    costType: "Non Asset",
  }),
  fc("FC-OLD", "FC_TARP", "Tarpaulin set (retired)", 6_000_000, 1, "Year", {
    status: "Inactive",
  }),
];

/** Fare Code mappings: the fixed costs booked to a Fare Code and the vehicles they apply to. */
const sm = (
  id: string,
  assignCostId: string,
  fixedCostIds: string[],
  vehicleType: string,
): FixedCostSummaryRecord => ({
  id,
  assignCostId,
  fixedCostIds,
  vehicleType,
  status: "Active",
  ...meta,
});

/** One vehicle type per mapping. */
export const seedFixedCostSummaries = (): FixedCostSummaryRecord[] => [
  sm("FS-DEP-5T", "CI-DEP", ["FC-DEP-TRK"], "TRUCK · 5 tấn"),
  sm("FS-DEP-8T", "CI-DEP", ["FC-DEP-TRK"], "TRUCK · 8 tấn"),
  sm("FS-DEP-HEAD", "CI-DEP", ["FC-DEP-HEAD"], "HEADER"),
  sm("FS-ADP-40", "CI-ADP", ["FC-DEP-TRL"], "TRAILER · 40 ft"),
  sm("FS-FIN-HEAD", "CI-FIN", ["FC-FIN-HEAD"], "HEADER"),
  sm("FS-FIN-40", "CI-FIN", ["FC-FIN-TRL"], "TRAILER · 40 ft"),
  sm("FS-MGT-HEAD", "CI-MGT", ["FC-MGMT"], "HEADER"),
  sm("FS-INU-2T", "CI-INU", ["FC-INS"], "TRUCK · 2 tấn"),
  sm("FS-INU-5T", "CI-INU", ["FC-INS"], "TRUCK · 5 tấn"),
  sm("FS-INU-8T", "CI-INU", ["FC-INS"], "TRUCK · 8 tấn"),
  sm("FS-GPS-5T", "CI-GPS", ["FC-GPS"], "TRUCK · 5 tấn"),
  sm("FS-GPS-8T", "CI-GPS", ["FC-GPS"], "TRUCK · 8 tấn"),
  sm("FS-IFR-8T", "CI-IFR", ["FC-LICENSE"], "TRUCK · 8 tấn · HINO"),
];
