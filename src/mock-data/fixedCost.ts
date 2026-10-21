// Demo seed for Master Data > Cost > Fixed Cost.
import type { FixedCostRecord, FixedCostSummaryRecord, LoanTerms } from "@/types";
import { loanSchedule } from "@/services/loanMath";

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

/** Financial cost of an asset: 6.8 %/year on its full value for 60 months (interest only). */
const financing = (amount: number): LoanTerms => ({
  amount,
  ratePct: 6.8,
  termMonths: 60,
  method: "Interest Only",
});
const interestOf = (l: LoanTerms) => Math.round(loanSchedule(l).totalInterest);
const HEAD = 1_300_000_000;
const TRAILER = 280_000_000;

const fc = (
  id: string,
  costDetailId: string,
  code: string,
  name: string,
  costValue: number,
  allocationBase: number,
  allocationUnit: FixedCostRecord["allocationUnit"],
  extra: Partial<FixedCostRecord> = {},
): FixedCostRecord => ({
  id,
  costDetailId,
  code,
  name,
  localName: LOCAL_NAMES[id] ?? "",
  costType: "Allocation",
  costValue,
  currency: "VND",
  exchangeRate: 1,
  allocationBase,
  allocationUnit,
  allocationDays: 26,
  loan: null,
  status: "Active",
  ...meta,
  ...extra,
});

export const seedFixedCosts = (): FixedCostRecord[] => [
  fc("FC-DEP-TRK", "CI-DEP", "FC_DEPRECIATION", "Truck depreciation", 1_200_000_000, 8, "Year"),
  // Operating cost of a header + 40 ft trailer per day: depreciation 60 months over 26 days a month,
  // financial cost 6.8 %/year over 360 days a year (30 a month), management 200,000 a day.
  fc("FC-DEP-HEAD", "CI-DEP", "FC_DEP_HEAD", "Header depreciation", HEAD, 60, "Month"),
  fc("FC-DEP-TRL", "CI-ADP", "FC_DEP_TRAILER", "Trailer depreciation", TRAILER, 60, "Month"),
  fc(
    "FC-FIN-HEAD",
    "CI-FIN",
    "FC_FIN_HEAD",
    "Header financial cost",
    interestOf(financing(HEAD)),
    60,
    "Month",
    { costType: "Loan Interest", loan: financing(HEAD), allocationDays: 30 },
  ),
  fc(
    "FC-FIN-TRL",
    "CI-FIN",
    "FC_FIN_TRAILER",
    "Trailer financial cost",
    interestOf(financing(TRAILER)),
    60,
    "Month",
    { costType: "Loan Interest", loan: financing(TRAILER), allocationDays: 30 },
  ),
  fc("FC-MGMT", "CI-MGT", "FC_MANAGEMENT", "Management cost", 200_000, 1, "Day", {
    costType: "Other",
  }),
  fc("FC-INS", "CI-INU", "FC_INSURANCE", "Vehicle insurance", 36_000_000, 1, "Year"),
  fc("FC-GPS", "CI-GPS", "FC_GPS", "GPS & camera subscription", 150_000, 1, "Month"),
  fc("FC-LICENSE", "CI-IFR", "FC_LICENSE", "Operating license fee", 450_000, 1, "Day"),
  fc("FC-OLD", "CI-DEP", "FC_TARP", "Tarpaulin set (retired)", 6_000_000, 1, "Year", {
    status: "Inactive",
  }),
];

/** Fare Code mappings: the fixed costs booked to a Fare Code and the vehicles they apply to. */
const sm = (
  id: string,
  assignCostId: string,
  fixedCostIds: string[],
  vehicleTypes: string[],
  remark = "",
): FixedCostSummaryRecord => ({
  id,
  assignCostId,
  fixedCostIds,
  vehicleTypes,
  remark,
  status: "Active",
  ...meta,
});

export const seedFixedCostSummaries = (): FixedCostSummaryRecord[] => [
  sm(
    "FS-DEP-TRK",
    "CI-DEP",
    ["FC-DEP-TRK"],
    ["TRUCK · 5 tấn", "TRUCK · 8 tấn"],
    "Truck depreciation",
  ),
  sm("FS-DEP-HEAD", "CI-DEP", ["FC-DEP-HEAD"], ["HEADER"], "Header depreciation"),
  sm("FS-ADP", "CI-ADP", ["FC-DEP-TRL"], ["TRAILER · 40 ft"]),
  sm("FS-FIN", "CI-FIN", ["FC-FIN-HEAD", "FC-FIN-TRL"], ["HEADER", "TRAILER · 40 ft"]),
  sm("FS-MGT", "CI-MGT", ["FC-MGMT"], ["HEADER"]),
  sm("FS-INU", "CI-INU", ["FC-INS"], ["TRUCK · 2 tấn", "TRUCK · 5 tấn", "TRUCK · 8 tấn"]),
  sm("FS-GPS", "CI-GPS", ["FC-GPS"], ["TRUCK · 5 tấn", "TRUCK · 8 tấn"]),
  sm("FS-IFR", "CI-IFR", ["FC-LICENSE"], ["TRUCK · 8 tấn · HINO"]),
];
