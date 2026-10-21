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
import { tenantCountries } from "@/mock-data/offices";
import { COST_CURRENCIES } from "@/mock-data/costMaster";
import { CC } from "@/mock-data/commonCodes";
import { codeOptions } from "./commonCodeService";
import { fcVehicleErrors } from "./fixedCostVehicle";
import { draftImportConfig, numCell, pick } from "./importExportService";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { allocate, type AllocationResult } from "./fixedCostMath";

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
  code: "",
  country: tenantCountries()[0] ?? "",
  name: "",
  localName: "",
  costType: "Asset",
  costValue: 0,
  currency: "VND",
  exchangeRate: 1,
  allocationBase: 1,
  allocationUnit: "Year",
  allocationDays: 30,
  status: "Active",
});

export const draftOfFixedCost = (f: FixedCostRecord): FixedCostDraft => {
  const { id, deleted, createdAt, createdBy, updatedAt, updatedBy, ...d } = f;
  void [id, deleted, createdAt, createdBy, updatedAt, updatedBy];
  return {
    ...d,
    localName: d.localName ?? "",
    country: d.country ?? "",
    costType: FIXED_COST_TYPES.includes(d.costType) ? d.costType : "Asset",
  };
};

export function validateFixedCost(d: FixedCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Code is required.";
  else if (!/^[A-Z0-9_-]{2,30}$/.test(code))
    e["code"] = "Use 2–30 characters: letters, digits, - or _.";
  else if (all().some((f) => f.id !== id && f.code.toUpperCase() === code))
    e["code"] = `Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "English Name is required.";
  if (!d.country) e["country"] = "Country is required.";
  if (!FIXED_COST_TYPES.includes(d.costType)) e["costType"] = "Fee Type is required.";
  if (!(d.costValue > 0)) e["costValue"] = "Cost Value must be greater than 0.";
  if (!(d.allocationBase > 0)) e["allocationBase"] = "Allocation Base must be greater than 0.";
  if (!d.allocationUnit) e["allocationUnit"] = "Allocation Base Unit is required.";
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
      ...d,
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
    upd("English Name", existing.name, next.name);
    upd("Local Name", existing.localName ?? "", next.localName);
    upd("Country", existing.country ?? "", next.country);
    upd("Fee Type", existing.costType ?? "", next.costType);
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

export interface FixedCostPeriods {
  year: number;
  month: number;
  day: number;
}
/**
 * A fixed cost per year, month and day, whatever unit it was entered in: units above the
 * Allocation Base Unit are scaled up (Day × Allocation Days → Month, Month × 12 → Year).
 */
export const periodsOf = (f: FixedCostRecord): FixedCostPeriods => {
  const c = calcFixedCost(f);
  const day = c.day ?? 0;
  const month = c.month ?? day * (f.allocationDays || 30);
  return { day, month, year: c.year ?? month * 12 };
};
export const sumPeriods = (list: FixedCostRecord[]): FixedCostPeriods =>
  list.reduce(
    (t, f) => {
      const p = periodsOf(f);
      return { year: t.year + p.year, month: t.month + p.month, day: t.day + p.day };
    },
    { year: 0, month: 0, day: 0 },
  );

/** Fixed cost per day of a list of fixed costs. */
export const totalFixedCost = (ids: string[]) =>
  ids.reduce((sum, id) => {
    const f = fixedCostRepository.get(id);
    return sum + (f ? (calcFixedCost(f).day ?? 0) : 0);
  }, 0);

export const activeCostItems = () =>
  costItemRepository.all().filter((c) => !c.deleted && c.status === "Active");

export interface FixedCostSummaryDraft {
  country: string;
  assignCostId: string;
  fixedCostIds: string[];
  vehicleType: string;
}

/** No limit on how many fixed costs a Fare Code maps, nor on how many mappings use a fixed cost. */
export function validateFixedCostSummary(d: FixedCostSummaryDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.country) e["country"] = "Country is required.";
  if (!d.assignCostId) e["assignCost"] = "Fare Code is required.";
  const other = d.fixedCostIds
    .map((id) => fixedCostRepository.get(id))
    .find((f) => f && d.country && f.country !== d.country);
  if (other) e["lines"] = `${other.code} belongs to ${other.country}, not ${d.country}.`;
  if (!d.vehicleType) e["vehicleType"] = "Vehicle Type is required.";
  else {
    const vErr = fcVehicleErrors([d.vehicleType], vehicleMasterRepository.all());
    if (vErr) e["vehicleType"] = vErr.replace("Vehicle Type row 1: ", "");
  }
  if (!d.fixedCostIds.length) e["lines"] = "Pick at least one Internal Cost.";
  else if (d.fixedCostIds.some((l) => fixedCostRepository.get(l)?.status !== "Active"))
    e["lines"] = "Only active Internal Costs can be mapped — remove the others.";
  return e;
}

/** List actions of the mappings (delete / status / history), as on the other lists. */
export const fixedCostSummaryCrud = makeCrud<FixedCostSummaryRecord>({
  entityType: "Fixed Cost Summary",
  repo: fixedCostSummaryRepository,
  labelOf: (s) => `${costDetailLabel(s.assignCostId) || s.assignCostId} · ${s.vehicleType}`,
  references: () => null,
});

export const fixedCostSummaryService = {
  save(d: FixedCostSummaryDraft, id?: string): FixedCostSummaryRecord {
    const errors = validateFixedCostSummary(d);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const body = { ...d };
    const existing = id ? fixedCostSummaryRepository.get(id) : undefined;
    if (!existing) {
      const rec: FixedCostSummaryRecord = {
        id: uid("FS-"),
        ...body,
        status: "Active",
        ...stampCreate(),
      };
      fixedCostSummaryRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Fixed Cost Summary",
        entityId: rec.id,
        entityLabel: costDetailLabel(rec.assignCostId),
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...body });
    fixedCostSummaryRepository.update(existing.id, () => next);
    const names = (ids: string[]) =>
      ids.map((i) => fixedCostRepository.get(i)?.code ?? i).join(", ");
    const base = {
      action: "UPDATE" as const,
      entityType: "Fixed Cost Summary" as const,
      entityId: next.id,
      entityLabel: costDetailLabel(next.assignCostId),
    };
    const out: AuditInput[] = [];
    if (existing.assignCostId !== next.assignCostId)
      out.push({
        ...base,
        field: "Fare Code",
        oldValue: costDetailLabel(existing.assignCostId) || "—",
        newValue: costDetailLabel(next.assignCostId) || "—",
      });
    if (names(existing.fixedCostIds) !== names(next.fixedCostIds))
      out.push({
        ...base,
        field: "Internal Costs",
        oldValue: names(existing.fixedCostIds) || "—",
        newValue: names(next.fixedCostIds) || "—",
      });
    if ((existing.country ?? "") !== next.country)
      out.push({
        ...base,
        field: "Country",
        oldValue: existing.country || "—",
        newValue: next.country || "—",
      });
    if ((existing.vehicleType ?? "") !== next.vehicleType)
      out.push({
        ...base,
        field: "Vehicle Type",
        oldValue: existing.vehicleType || "—",
        newValue: next.vehicleType || "—",
      });
    auditService.logMany(out);
    return next;
  },
  remove(id: string) {
    const s = fixedCostSummaryRepository.get(id);
    if (!s) return;
    fixedCostSummaryRepository.update(id, (x) => ({ ...x, deleted: true }));
    auditService.log({
      action: "DELETE",
      entityType: "Fixed Cost Summary",
      entityId: id,
      entityLabel: costDetailLabel(s.assignCostId),
    });
  },
};

// ---------------------------------------------------------------- Import

const STATUSES = ["Active", "Inactive"] as const;
const choices = () => ({
  unit: codeOptions(CC.ALLOCATION_UNIT, ALLOCATION_UNITS) as AllocationUnit[],
  currency: COST_CURRENCIES,
});
/** "8" (+ unit column) or "8 Year" (as exported). */
const baseOf = (r: Record<string, string>) => {
  const m = /^\s*([\d.,]+)\s*([A-Za-z]*)\s*$/.exec(r["allocationBase"] ?? "");
  return { base: m ? numCell(m[1]) : NaN, unit: (r["allocationUnit"] || m?.[2] || "").trim() };
};
const numOr = (v: string | undefined, dflt: number) => {
  const n = numCell(v);
  return Number.isNaN(n) ? dflt : n;
};

const fixedCostDraftOfRow = (r: Record<string, string>): FixedCostDraft => {
  const c = choices();
  const { base, unit } = baseOf(r);
  const currency = pick(r["currency"], c.currency) || "VND";
  return {
    code: (r["code"] ?? "").trim().toUpperCase(),
    name: (r["name"] ?? "").trim(),
    localName: (r["localName"] ?? "").trim(),
    country: pick(r["country"], tenantCountries()) || "",
    costType: pick(r["costType"], FIXED_COST_TYPES) || "Asset",
    costValue: numOr(r["costValue"], 0),
    currency,
    exchangeRate: rateOf(currency),
    allocationBase: Number.isNaN(base) ? 0 : base,
    allocationUnit: pick(unit, c.unit) || "Year",
    allocationDays: numOr(r["allocationDays"], 30),
    status: pick(r["status"], STATUSES) || "Active",
  };
};

/** Headers = the list's column labels (plus the form-only fields), so an export imports back. */
export const fixedCostImportConfig = draftImportConfig<FixedCostDraft>({
  entityType: "Fixed Cost",
  screen: "fixed-cost",
  keyColumn: "code",
  columns: [
    {
      key: "code",
      header: "Code",
      required: true,
      aliases: ["Internal Cost Code", "Fixed Cost Code"],
      example: "FC_DEP_5T",
    },
    {
      key: "name",
      header: "English Name",
      required: true,
      example: "5T truck depreciation",
      aliases: ["Internal Cost Name (EN)", "Fixed Cost Name (EN)", "Fixed Cost Name"],
    },
    {
      key: "localName",
      header: "Local Name",
      aliases: ["Internal Cost Name (Local)", "Fixed Cost Name (Local)"],
      example: "Khấu hao xe 5 tấn",
    },
    { key: "country", header: "Country", required: true, example: "Vietnam" },
    { key: "costType", header: "Fee Type", example: "Asset", aliases: ["Cost Type"] },
    { key: "costValue", header: "Cost Value", example: "900000000" },
    { key: "currency", header: "Currency", example: "VND" },
    { key: "allocationBase", header: "Allocation Base", required: true, example: "8" },
    { key: "allocationUnit", header: "Allocation Base Unit", example: "Year" },
    { key: "allocationDays", header: "Allocation Days", example: "30" },
    { key: "status", header: "Status", example: "Active" },
  ],
  existingKeys: () => new Set(all().map((f) => f.code.toLowerCase())),
  parseCheck: (r) => {
    const c = choices();
    const e: { field: string; error: string }[] = [];
    if (r["country"] && pick(r["country"], tenantCountries()) === undefined)
      e.push({
        field: "country",
        error: `Use a country of a tenant office: ${tenantCountries().join(", ")}`,
      });
    if (pick(r["costType"], FIXED_COST_TYPES) === undefined)
      e.push({ field: "costType", error: `Use one of: ${FIXED_COST_TYPES.join(", ")}` });
    if (pick(r["currency"], c.currency) === undefined)
      e.push({ field: "currency", error: `Use one of: ${c.currency.join(", ")}` });
    const { base, unit } = baseOf(r);
    if (r["allocationBase"] && Number.isNaN(base))
      e.push({ field: "allocationBase", error: "Must be a number (e.g. 8)" });
    if (unit && pick(unit, c.unit) === undefined)
      e.push({ field: "allocationUnit", error: `Use one of: ${c.unit.join(", ")}` });
    for (const k of ["costValue", "allocationDays"])
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
    const plan: [string, string, string, string][] = [
      // fare, value, base, unit
      ["DEP", "900000000", "8", "Year"],
      ["INU", "24000000", "1", "Year"],
      ["FIN", "12000000", "1", "Month"],
      ["GPS", "120000", "1", "Month"],
      ["IFR", "450000", "1", "Day"],
    ];
    const rows = Array.from({ length: 20 }, (_, i) => {
      const [fare, value, base, unit] = plan[i % plan.length]!;
      const n = String(i + 1).padStart(2, "0");
      return [
        `FC_IMP_${n}`,
        `Imported internal cost ${n}`,
        `Chi phí cố định nhập mẫu ${n}`,
        "Vietnam",
        fare === "DEP" ? "Asset" : "Non Asset",
        value,
        "VND",
        base,
        unit,
        "26",
        "Active",
      ];
    });
    rows[3]![0] = "FC_IMP_01"; // duplicate in the file
    rows[11]![4] = "Lease"; // unknown Fee Type
    return rows;
  },
});
