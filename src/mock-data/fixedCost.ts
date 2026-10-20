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
  "FC-DEP-CONT": "Khấu hao đầu kéo & rơ moóc",
  "FC-INS": "Bảo hiểm xe",
  "FC-LOAN": "Lãi vay mua xe",
  "FC-GPS": "Phí GPS & camera",
  "FC-LICENSE": "Phí giấy phép kinh doanh vận tải",
  "FC-PERMIT": "Phí vào cảng",
  "FC-OLD": "Bộ bạt phủ (ngưng dùng)",
};

/** Header + trailer bought on credit: 70% of 2.4 billion over 5 years. */
const HEADER_LOAN: LoanTerms = {
  amount: 1_680_000_000,
  ratePct: 10.5,
  termMonths: 60,
  method: "Annuity",
};

const fc = (
  id: string,
  costDetailId: string,
  code: string,
  name: string,
  costValue: number,
  allocationBase: number,
  allocationUnit: FixedCostRecord["allocationUnit"],
  vehicleTypes: string[],
  extra: Partial<FixedCostRecord> = {},
): FixedCostRecord => ({
  id,
  costDetailId,
  code,
  name,
  localName: LOCAL_NAMES[id] ?? "",
  costValue,
  currency: "VND",
  exchangeRate: 1,
  allocationBase,
  allocationUnit,
  vehicleTypes,
  utilContainer: 1,
  utilDay: 1,
  applyUtilization: true,
  allocationDays: 30,
  loan: null,
  status: "Active",
  ...meta,
  ...extra,
});

export const seedFixedCosts = (): FixedCostRecord[] => [
  fc(
    "FC-DEP-TRK",
    "CI-DEP",
    "FC_DEPRECIATION",
    "Truck depreciation",
    1_200_000_000,
    8,
    "Year",
    ["TRUCK · 5 tấn", "TRUCK · 8 tấn"],
    { utilContainer: 20, utilDay: 30 },
  ),
  fc(
    "FC-DEP-CONT",
    "CI-ADP",
    "FC_DEP_CONT",
    "Tractor & trailer depreciation",
    2_400_000_000,
    10,
    "Year",
    ["HEADER", "TRAILER · 20 ft", "TRAILER · 40 ft"],
    { utilContainer: 24, utilDay: 30 },
  ),
  fc(
    "FC-INS",
    "CI-INU",
    "FC_INSURANCE",
    "Vehicle insurance",
    36_000_000,
    1,
    "Year",
    ["TRUCK · 2 tấn", "TRUCK · 5 tấn", "TRUCK · 8 tấn", "HEADER"],
    { utilContainer: 20, utilDay: 30 },
  ),
  fc(
    "FC-LOAN",
    "CI-FIN",
    "FC_LOAN_INTEREST",
    "Loan interest",
    Math.round(loanSchedule(HEADER_LOAN).totalInterest),
    HEADER_LOAN.termMonths,
    "Month",
    ["HEADER · HYUNDAI"],
    { utilContainer: 24, utilDay: 30, loan: HEADER_LOAN },
  ),
  fc(
    "FC-GPS",
    "CI-GPS",
    "FC_GPS",
    "GPS & camera subscription",
    150_000,
    1,
    "Month",
    ["TRUCK · 5 tấn", "TRUCK · 8 tấn", "HEADER"],
    { applyUtilization: false },
  ),
  fc(
    "FC-LICENSE",
    "CI-IFR",
    "FC_LICENSE",
    "Operating license fee",
    450_000,
    1,
    "Day",
    ["TRUCK · 8 tấn · HINO"],
    { utilContainer: 1, utilDay: 1 },
  ),
  fc("FC-PERMIT", "CI-CBD", "FC_PERMIT", "Port entry permit", 25, 1, "Trip", ["HEADER"], {
    currency: "USD",
    exchangeRate: 25400,
  }),
  fc("FC-OLD", "CI-DEP", "FC_TARP", "Tarpaulin set (retired)", 6_000_000, 1, "Year", [], {
    status: "Inactive",
  }),
];

export const seedFixedCostSummaries = (): FixedCostSummaryRecord[] => [
  {
    id: "FS-8T",
    vehicleType: "TRUCK · 8 tấn",
    assignCostId: "CI-TOL",
    fixedCostIds: ["FC-DEP-TRK", "FC-INS", "FC-GPS"],
    status: "Active",
    ...meta,
  },
  {
    id: "FS-40DC",
    vehicleType: "HEADER",
    assignCostId: "CI-FUE",
    fixedCostIds: ["FC-DEP-CONT", "FC-INS", "FC-LOAN", "FC-PERMIT"],
    status: "Active",
    ...meta,
  },
];
