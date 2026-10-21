// Master Data > Cost > Fixed Cost: fixed-cost lines + the per-vehicle-type Summary.
import {
  ALLOCATION_UNITS,
  FIXED_COST_TYPES,
  type AllocationUnit,
  type FixedCostType,
  type FixedCostRecord,
  type FixedCostSummaryRecord,
} from "@/types";
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { FIXED_COST_RATES } from "@/mock-data/fixedCost";
import { COST_CURRENCIES } from "@/mock-data/costMaster";
import { CC } from "@/mock-data/commonCodes";
import { codeOptions } from "./commonCodeService";
import { fcVehicleErrors, parseFcVehicle, fcVehicleLabel } from "./fixedCostVehicle";
import { draftImportConfig, listCell, numCell, pick } from "./importExportService";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { allocate, type AllocationResult } from "./fixedCostMath";
import { loanSchedule, REPAYMENT_METHODS, type LoanTerms } from "./loanMath";

const all = () => fixedCostRepository.all().filter((f) => !f.deleted);

export const fixedCostCrud = makeCrud<FixedCostRecord>({
  entityType: "Fixed Cost",
  repo: fixedCostRepository,
  labelOf: (f) => f.code,
  references: (f) => {
    const n = fixedCostSummaryRepository.all().filter((s) => s.fixedCostIds.includes(f.id)).length;
    return n ? `is used in ${n} summar${n > 1 ? "ies" : "y"}` : null;
  },
});

export const rateOf = (currency: string) => FIXED_COST_RATES[currency] ?? 1;

type Calcable = Pick<
  FixedCostRecord,
  "costValue" | "exchangeRate" | "allocationBase" | "allocationUnit" | "allocationDays"
>;

/** Allocation chain of a fixed cost (values in VND). */
export const calcFixedCost = (f: Calcable): AllocationResult =>
  allocate({
    value: f.costValue * f.exchangeRate,
    base: f.allocationBase,
    unit: f.allocationUnit,
    days: f.allocationDays,
  });

export type FixedCostDraft = Omit<
  FixedCostRecord,
  "id" | "deleted" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export const newFixedCostDraft = (): FixedCostDraft => ({
  costDetailId: "",
  code: "",
  name: "",
  localName: "",
  costType: "Allocation",
  costValue: 0,
  currency: "VND",
  exchangeRate: 1,
  allocationBase: 1,
  allocationUnit: "Year",
  vehicleTypes: [],
  allocationDays: 30,
  loan: null,
  status: "Active",
});

export const draftOfFixedCost = (f: FixedCostRecord): FixedCostDraft => {
  const { id, deleted, createdAt, createdBy, updatedAt, updatedBy, ...d } = f;
  void [id, deleted, createdAt, createdBy, updatedAt, updatedBy];
  return {
    ...d,
    localName: d.localName ?? "",
    costType: d.costType ?? (d.loan ? "Loan Interest" : "Allocation"),
    loan: d.loan ? { ...d.loan } : null,
  };
};

/**
 * Fields that follow the Cost Type. Loan Interest: Cost Value = total interest of the loan, spread
 * over its term in months. Other: the value is an amount per day. Allocation: no loan.
 */
export const applyCostType = <T extends FixedCostDraft>(d: T): T =>
  d.costType === "Loan Interest" && d.loan
    ? {
        ...d,
        costValue: Math.round(loanSchedule(d.loan).totalInterest),
        allocationBase: d.loan.termMonths,
        allocationUnit: "Month",
      }
    : d.costType === "Other"
      ? { ...d, loan: null, allocationBase: 1, allocationUnit: "Day" }
      : { ...d, loan: null };

export const loanLabel = (l: LoanTerms | null | undefined) =>
  l
    ? `${l.amount.toLocaleString("vi-VN")} · ${l.ratePct}%/year · ${l.termMonths} months · ${l.method}`
    : "";

export function validateFixedCost(d: FixedCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!d.costDetailId) e["costDetailId"] = "Fare Code is required.";
  if (!code) e["code"] = "Fixed Cost Code is required.";
  else if (!/^[A-Z0-9_-]{2,30}$/.test(code))
    e["code"] = "Use 2–30 characters: letters, digits, - or _.";
  else if (all().some((f) => f.id !== id && f.code.toUpperCase() === code))
    e["code"] = `Fixed Cost Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Fixed Cost Name is required.";
  const vErr = fcVehicleErrors(d.vehicleTypes, vehicleMasterRepository.all());
  if (vErr) e["vehicleTypes"] = vErr;
  if (d.costType === "Loan Interest") {
    if (!(d.loan && d.loan.amount > 0)) e["loanAmount"] = "Loan Amount must be greater than 0.";
  }
  if (d.costType === "Loan Interest" && d.loan) {
    if (!(d.loan.ratePct > 0 && d.loan.ratePct <= 100))
      e["loanRate"] = "Interest Rate must be above 0 and at most 100 %/year.";
    if (!(
      Number.isInteger(d.loan.termMonths) &&
      d.loan.termMonths >= 1 &&
      d.loan.termMonths <= 360
    ))
      e["loanTerm"] = "Loan Term must be 1 – 360 months.";
  } else if (d.costType !== "Loan Interest" && !(d.costValue > 0))
    e["costValue"] =
      d.costType === "Other"
        ? "Value must be greater than 0."
        : "Cost Value must be greater than 0.";
  if (d.costType === "Allocation") {
    if (!(d.allocationBase > 0)) e["allocationBase"] = "Allocation Base must be greater than 0.";
    if (!d.allocationUnit) e["allocationUnit"] = "Allocation Base Unit is required.";
  }
  if (d.allocationUnit !== "Day" && !(d.allocationDays > 0))
    e["allocationDays"] = "Allocation Days must be greater than 0.";
  return e;
}

export const fixedCostService = {
  save(d: FixedCostDraft, id?: string): FixedCostRecord {
    const errors = validateFixedCost(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const clean: FixedCostDraft = {
      ...applyCostType(d),
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      localName: d.localName.trim(),
      exchangeRate: rateOf(d.currency),
    };
    const existing = id ? fixedCostRepository.get(id) : undefined;
    if (!existing) {
      const rec: FixedCostRecord = { ...clean, id: uid("FC-"), ...stampCreate() };
      fixedCostRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Fixed Cost",
        entityId: rec.id,
        entityLabel: rec.code,
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    fixedCostRepository.update(existing.id, () => next);
    const base = { entityType: "Fixed Cost" as const, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    const upd = (field: string, a: string, b: string) =>
      a !== b &&
      out.push({ ...base, action: "UPDATE", field, oldValue: a || "—", newValue: b || "—" });
    upd("Fixed Cost Name (EN)", existing.name, next.name);
    upd("Fixed Cost Name (Local)", existing.localName ?? "", next.localName);
    upd("Cost Type", existing.costType ?? "Allocation", next.costType);
    upd("Loan", loanLabel(existing.loan), loanLabel(next.loan));
    upd("Fare Code", existing.costDetailId, next.costDetailId);
    upd(
      "Cost Value",
      `${existing.costValue} ${existing.currency}`,
      `${next.costValue} ${next.currency}`,
    );
    upd(
      "Allocation Base",
      `${existing.allocationBase} ${existing.allocationUnit}`,
      `${next.allocationBase} ${next.allocationUnit}`,
    );
    upd("Vehicle Types", existing.vehicleTypes.join(", "), next.vehicleTypes.join(", "));
    upd("Allocation Days", String(existing.allocationDays), String(next.allocationDays));
    if (existing.status !== next.status)
      out.push({
        ...base,
        action: next.status === "Active" ? "ACTIVATE" : "DEACTIVATE",
        field: "Status",
        oldValue: existing.status,
        newValue: next.status,
      });
    auditService.logMany(out);
    return next;
  },
};

export const costDetailLabel = (id: string) => {
  const c = costItemRepository.get(id);
  return c ? `${c.code} · ${c.name}` : "";
};

// ---------------------------------------------------------------- Summary

export const summaryOf = (vehicleType: string) =>
  fixedCostSummaryRepository.all().find((s) => s.vehicleType === vehicleType && !s.deleted);

export const totalFixedCost = (ids: string[]) =>
  ids.reduce((sum, id) => {
    const f = fixedCostRepository.get(id);
    return sum + (f ? (calcFixedCost(f).day ?? 0) : 0);
  }, 0);

export const activeCostItems = () =>
  costItemRepository.all().filter((c) => !c.deleted && c.status === "Active");

export const fixedCostSummaryService = {
  /** `lines` holds fixed-cost ids; blank = an empty line the user has not filled in. */
  save(vehicleType: string, assignCostId: string, lines: string[]): FixedCostSummaryRecord {
    const errors: Record<string, string> = {};
    if (!vehicleType) errors["vehicleType"] = "Vehicle Type is required.";
    if (!assignCostId) errors["assignCost"] = "Fare Code is required.";
    if (lines.some((l) => !l))
      errors["lines"] = "Every line needs a Fixed Cost — fill or remove it.";
    else if (new Set(lines).size !== lines.length)
      errors["lines"] = "The same Fixed Cost cannot be added twice.";
    else if (lines.some((l) => fixedCostRepository.get(l)?.status === "Inactive"))
      errors["lines"] = "Inactive Fixed Costs cannot be used — remove them.";
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);

    const existing = summaryOf(vehicleType);
    if (!existing) {
      const rec: FixedCostSummaryRecord = {
        id: uid("FS-"),
        vehicleType,
        assignCostId,
        fixedCostIds: lines,
        status: "Active",
        ...stampCreate(),
      };
      fixedCostSummaryRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Fixed Cost Summary",
        entityId: rec.id,
        entityLabel: vehicleType,
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, assignCostId, fixedCostIds: lines });
    fixedCostSummaryRepository.update(existing.id, () => next);
    const names = (ids: string[]) =>
      ids.map((i) => fixedCostRepository.get(i)?.code ?? i).join(", ");
    auditService.log({
      action: "UPDATE",
      entityType: "Fixed Cost Summary",
      entityId: next.id,
      entityLabel: vehicleType,
      field: "Lines",
      oldValue: names(existing.fixedCostIds) || "—",
      newValue: names(lines) || "—",
    });
    return next;
  },
};

// ---------------------------------------------------------------- Import

const STATUSES = ["Active", "Inactive"] as const;
const choices = () => ({
  unit: codeOptions(CC.ALLOCATION_UNIT, ALLOCATION_UNITS) as AllocationUnit[],
  currency: COST_CURRENCIES,
});
/** "DEP" or "DEP · Asset depreciation" (as exported) → the Fare Code record id. */
const fareIdOf = (cell: string | undefined) => {
  const code = (cell ?? "").split("·")[0]!.trim().toLowerCase();
  return code
    ? costItemRepository.all().find((c) => !c.deleted && c.code.toLowerCase() === code)?.id
    : undefined;
};
/** "8" (+ unit column) or "8 Year" (as exported). */
const baseOf = (r: Record<string, string>) => {
  const m = /^\s*([\d.,]+)\s*([A-Za-z]*)\s*$/.exec(r["allocationBase"] ?? "");
  return { base: m ? numCell(m[1]) : NaN, unit: (r["allocationUnit"] || m?.[2] || "").trim() };
};
const numOr = (v: string | undefined, dflt: number) => {
  const n = numCell(v);
  return Number.isNaN(n) ? dflt : n;
};

const loanOfRow = (r: Record<string, string>): LoanTerms | null =>
  (r["loanAmount"] ?? "").trim()
    ? {
        amount: numOr(r["loanAmount"], 0),
        ratePct: numOr(r["loanRate"], 0),
        termMonths: numOr(r["loanTerm"], 0),
        method: pick(r["repaymentMethod"], REPAYMENT_METHODS) || "Annuity",
      }
    : null;

/** Cost Type column, or Loan Interest when a loan amount is given, else Allocation. */
const costTypeOfRow = (r: Record<string, string>): FixedCostType =>
  pick(r["costType"], FIXED_COST_TYPES) ||
  ((r["loanAmount"] ?? "").trim() ? "Loan Interest" : "Allocation");
const fixedCostDraftOfRow = (r: Record<string, string>): FixedCostDraft =>
  applyCostType(rowDraft(r));
const rowDraft = (r: Record<string, string>): FixedCostDraft => {
  const c = choices();
  const { base, unit } = baseOf(r);
  const currency = pick(r["currency"], c.currency) || "VND";
  return {
    costDetailId: fareIdOf(r["costDetail"]) ?? "",
    code: (r["code"] ?? "").trim().toUpperCase(),
    name: (r["name"] ?? "").trim(),
    localName: (r["localName"] ?? "").trim(),
    costType: costTypeOfRow(r),
    costValue: numOr(r["costValue"], 0),
    currency,
    exchangeRate: rateOf(currency),
    allocationBase: Number.isNaN(base) ? 0 : base,
    allocationUnit: pick(unit, c.unit) || "Year",
    vehicleTypes: listCell(r["vehicleTypes"]).map((v) => {
      const x = parseFcVehicle(v);
      return x ? fcVehicleLabel(x) : v;
    }),
    allocationDays: numOr(r["allocationDays"], 30),
    loan: costTypeOfRow(r) === "Loan Interest" ? loanOfRow(r) : null,
    status: pick(r["status"], STATUSES) || "Active",
  };
};

/** Headers = the list's column labels (plus the form-only fields), so an export imports back. */
export const fixedCostImportConfig = draftImportConfig<FixedCostDraft>({
  entityType: "Fixed Cost",
  screen: "fixed-cost",
  keyColumn: "code",
  columns: [
    { key: "costDetail", header: "Fare Code", required: true, example: "DEP" },
    { key: "code", header: "Fixed Cost Code", required: true, example: "FC_DEP_5T" },
    {
      key: "name",
      header: "Fixed Cost Name (EN)",
      required: true,
      example: "5T truck depreciation",
      aliases: ["Fixed Cost Name"],
    },
    { key: "localName", header: "Fixed Cost Name (Local)", example: "Khấu hao xe 5 tấn" },
    { key: "costType", header: "Cost Type", example: "Allocation" },
    { key: "costValue", header: "Cost Value", example: "900000000" },
    { key: "currency", header: "Currency", example: "VND" },
    { key: "allocationBase", header: "Allocation Base", required: true, example: "8" },
    { key: "allocationUnit", header: "Allocation Base Unit", example: "Year" },
    {
      key: "vehicleTypes",
      header: "Vehicle Type",
      example: "TRUCK · 5 tấn; HEADER · HINO",
    },
    { key: "allocationDays", header: "Allocation Days", example: "30" },
    { key: "loanAmount", header: "Loan Amount", example: "" },
    { key: "loanRate", header: "Interest Rate (%/year)", example: "" },
    { key: "loanTerm", header: "Loan Term (months)", example: "" },
    { key: "repaymentMethod", header: "Repayment Method", example: "" },
    { key: "status", header: "Status", example: "Active" },
  ],
  existingKeys: () => new Set(all().map((f) => f.code.toLowerCase())),
  parseCheck: (r) => {
    const c = choices();
    const e: { field: string; error: string }[] = [];
    if (r["costDetail"] && !fareIdOf(r["costDetail"]))
      e.push({ field: "costDetail", error: "Fare Code not found in Fare Code Management" });
    if (pick(r["costType"], FIXED_COST_TYPES) === undefined)
      e.push({ field: "costType", error: `Use one of: ${FIXED_COST_TYPES.join(", ")}` });
    if (pick(r["currency"], c.currency) === undefined)
      e.push({ field: "currency", error: `Use one of: ${c.currency.join(", ")}` });
    const { base, unit } = baseOf(r);
    if (r["allocationBase"] && Number.isNaN(base))
      e.push({ field: "allocationBase", error: "Must be a number (e.g. 8)" });
    if (unit && pick(unit, c.unit) === undefined)
      e.push({ field: "allocationUnit", error: `Use one of: ${c.unit.join(", ")}` });
    if (pick(r["repaymentMethod"], REPAYMENT_METHODS) === undefined)
      e.push({ field: "repaymentMethod", error: `Use one of: ${REPAYMENT_METHODS.join(", ")}` });
    for (const k of ["costValue", "allocationDays", "loanAmount", "loanRate", "loanTerm"])
      if (r[k] && Number.isNaN(numCell(r[k]))) e.push({ field: k, error: "Must be a number" });
    if (pick(r["status"], STATUSES) === undefined)
      e.push({ field: "status", error: "Active or Inactive (empty = Active)" });
    return e;
  },
  toDraft: fixedCostDraftOfRow,
  validate: (d) => validateFixedCost(d),
  save: (d) => fixedCostService.save(d),
  rollback: (ids) => fixedCostCrud.removeMany(ids),
  sampleRows: () => {
    const plan: [string, string, string, string, string][] = [
      // fare, value, base, unit, vehicle types
      ["DEP", "900000000", "8", "Year", "TRUCK · 5 tấn"],
      ["INU", "24000000", "1", "Year", "TRUCK · 2 tấn; TRUCK · 5 tấn · HINO"],
      ["FIN", "12000000", "1", "Month", "HEADER; TRAILER · 40 ft"],
      ["GPS", "120000", "1", "Month", "TRUCK · 8 tấn"],
      ["IFR", "450000", "1", "Day", "HEADER · HYUNDAI"],
    ];
    const rows = Array.from({ length: 20 }, (_, i) => {
      const [fare, value, base, unit, vts] = plan[i % plan.length]!;
      const n = String(i + 1).padStart(2, "0");
      return [
        fare,
        `FC_IMP_${n}`,
        `Imported fixed cost ${n}`,
        `Chi phí cố định nhập mẫu ${n}`,
        fare === "FIN" ? "Loan Interest" : "Allocation",
        value,
        "VND",
        base,
        unit,
        vts,
        "26",
        ...(fare === "FIN" ? ["1680000000", "10.5", "60", "Annuity"] : ["", "", "", ""]),
        "Active",
      ];
    });
    rows[3]![1] = "FC_IMP_01"; // duplicate in the file
    rows[11]![0] = "NOPE"; // Fare Code not found
    return rows;
  },
});
