// Master Data > Cost > Fixed Cost: fixed-cost lines + the per-vehicle-type Summary.
import type { FixedCostRecord, FixedCostSummaryRecord } from "@/types";
import {
  costGroupRepository,
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  uid,
} from "@/repositories";
import { FIXED_COST_RATES } from "@/mock-data/fixedCost";
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
  | "costValue"
  | "exchangeRate"
  | "allocationBase"
  | "allocationUnit"
  | "allocationDays"
  | "utilContainer"
  | "utilDay"
  | "applyUtilization"
>;

/** Allocation chain of a fixed cost (values in VND). */
export const calcFixedCost = (f: Calcable): AllocationResult =>
  allocate({
    value: f.costValue * f.exchangeRate,
    base: f.allocationBase,
    unit: f.allocationUnit,
    days: f.allocationDays,
    utilContainer: f.utilContainer,
    utilDay: f.utilDay,
    apply: f.applyUtilization,
  });

export type FixedCostDraft = Omit<
  FixedCostRecord,
  "id" | "deleted" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;

export const newFixedCostDraft = (): FixedCostDraft => ({
  costGroupId: "",
  costTypeCode: "",
  code: "",
  name: "",
  costValue: 0,
  currency: "VND",
  exchangeRate: 1,
  allocationBase: 1,
  allocationUnit: "Year",
  vehicleTypes: [],
  utilContainer: 1,
  utilDay: 1,
  applyUtilization: true,
  allocationDays: 30,
  status: "Active",
});

export const draftOfFixedCost = (f: FixedCostRecord): FixedCostDraft => {
  const { id, deleted, createdAt, createdBy, updatedAt, updatedBy, ...d } = f;
  void [id, deleted, createdAt, createdBy, updatedAt, updatedBy];
  return d;
};

export function validateFixedCost(d: FixedCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!d.costGroupId) e["costGroupId"] = "Cost Group is required.";
  if (!d.costTypeCode) e["costTypeCode"] = "Cost Type Code is required.";
  if (!code) e["code"] = "Fixed Cost Code is required.";
  else if (!/^[A-Z0-9_-]{2,30}$/.test(code))
    e["code"] = "Use 2–30 characters: letters, digits, - or _.";
  else if (all().some((f) => f.id !== id && f.code.toUpperCase() === code))
    e["code"] = `Fixed Cost Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Fixed Cost Name is required.";
  if (!(d.costValue > 0)) e["costValue"] = "Cost Value must be greater than 0.";
  if (!(d.allocationBase > 0)) e["allocationBase"] = "Allocation Base must be greater than 0.";
  if (!d.allocationUnit) e["allocationUnit"] = "Allocation Base Unit is required.";
  if (d.allocationUnit !== "Trip") {
    if (!(d.allocationDays > 0)) e["allocationDays"] = "Allocation Days must be greater than 0.";
    if (d.applyUtilization) {
      if (!(d.utilContainer > 0)) e["utilContainer"] = "Must be greater than 0.";
      if (!(d.utilDay > 0)) e["utilDay"] = "Must be greater than 0.";
    }
  }
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
    upd("Fixed Cost Name", existing.name, next.name);
    upd("Cost Group", existing.costGroupId, next.costGroupId);
    upd("Cost Type", existing.costTypeCode, next.costTypeCode);
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
    upd(
      "Utilization",
      `${existing.applyUtilization ? `${existing.utilContainer}/${existing.utilDay}` : "off"}`,
      `${next.applyUtilization ? `${next.utilContainer}/${next.utilDay}` : "off"}`,
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

export const costGroupLabel = (id: string) => {
  const g = costGroupRepository.get(id);
  return g ? g.name : "";
};

// ---------------------------------------------------------------- Summary

export const summaryOf = (vehicleType: string) =>
  fixedCostSummaryRepository.all().find((s) => s.vehicleType === vehicleType && !s.deleted);

export const totalFixedCost = (ids: string[]) =>
  ids.reduce((sum, id) => {
    const f = fixedCostRepository.get(id);
    return sum + (f ? (calcFixedCost(f).trip ?? 0) : 0);
  }, 0);

export const activeCostItems = () =>
  costItemRepository.all().filter((c) => !c.deleted && c.status === "Active");

export const fixedCostSummaryService = {
  /** `lines` holds fixed-cost ids; blank = an empty line the user has not filled in. */
  save(vehicleType: string, assignCostId: string, lines: string[]): FixedCostSummaryRecord {
    const errors: Record<string, string> = {};
    if (!vehicleType) errors["vehicleType"] = "Vehicle Type is required.";
    if (!assignCostId) errors["assignCost"] = "Assign Cost Code is required.";
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
