// Variable Cost setups, each under its own code: Salary Range (driver salary tiers of a vehicle type and
// how they are read) and Fuel Cost (fuel of a vehicle type). A COGS reads the ones of its vehicle type.
import type { CalcRule, FuelCostRecord, SalaryRangeRecord, SalaryTier } from "@/types";
import {
  cogsRepository,
  fuelCostRepository,
  salaryRangeRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import type { Collection } from "@/repositories/storage";
import type { BaseRecord, EntityType } from "@/types";
import { cogsVehicleTypes } from "./cogsVehicle";
import { ruleOf, validateTiers } from "./salaryRange";

/** A–Z, 0–9, dot, hyphen, underscore; max 20 (as the COGS Code). */
const SETUP_CODE = /^[A-Z0-9._-]{1,20}$/;
export const sanitizeSetupCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);

const vehicleError = (key: string) =>
  !key
    ? "Vehicle Type is required."
    : cogsVehicleTypes(vehicleMasterRepository.all()).some((t) => t.key === key)
      ? null
      : `No active vehicle of type ${key} in Vehicle.`;

/** Code: required, format, unique among the live records of the collection. */
function codeError<T extends { id: string; code: string; deleted?: boolean }>(
  repo: Collection<T>,
  code: string,
  label: string,
  id?: string,
) {
  const c = code.trim().toUpperCase();
  if (!c) return `${label} Code is required.`;
  if (!SETUP_CODE.test(c))
    return `${label} Code may only contain A–Z, 0–9, dot (.), hyphen (-), underscore (_), max 20 characters.`;
  const dup = repo.all().find((r) => !r.deleted && r.id !== id && r.code.toUpperCase() === c);
  return dup ? `${label} Code ${c} is already used.` : null;
}

/** Create / update a coded setup with its audit line. */
function saveRecord<T extends BaseRecord & { code: string }>(
  repo: Collection<T>,
  entityType: EntityType,
  prefix: string,
  body: Omit<T, "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">,
  id?: string,
): T {
  const existing = id ? repo.get(id) : undefined;
  if (!existing) {
    const rec = { id: uid(prefix), ...body, ...stampCreate() } as unknown as T;
    repo.insert(rec);
    auditService.log({ action: "CREATE", entityType, entityId: rec.id, entityLabel: rec.code });
    return rec;
  }
  const next = stampUpdate({ ...existing, ...body } as T);
  repo.update(existing.id, () => next);
  auditService.log({ action: "UPDATE", entityType, entityId: next.id, entityLabel: next.code });
  return next;
}

// ---------------------------------------------------------------- Salary Range

export interface SalaryRangeDraft {
  code: string;
  name: string;
  vehicleType: string;
  tiers: SalaryTier[];
  rule: CalcRule;
  remark: string;
  status: "Active" | "Inactive";
}

export function validateSalaryRange(d: SalaryRangeDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = codeError(salaryRangeRepository, d.code, "Salary Range", id);
  if (code) e["code"] = code;
  if (!d.name.trim()) e["name"] = "Salary Range Name is required.";
  const v = vehicleError(d.vehicleType);
  if (v) e["vehicleType"] = v;
  const t = validateTiers(d.tiers);
  if (!t.ok) e["tiers"] = t.message;
  if (!(d.rule.roundStep >= 0)) e["roundStep"] = "Round up to must be a number of 0 or more.";
  if (d.rule.regionOn && !(d.rule.regionAmount >= 0))
    e["regionAmount"] = "Highland surcharge must be a number of 0 or more.";
  return e;
}

/** COGS that read a setup (it cannot be deleted while they do; it can be deactivated). */
const refReason = (id: string) => {
  const by = cogsRepository
    .all()
    .filter((c) => !c.deleted && (c.salaryRangeId === id || c.fuelCostId === id))
    .map((c) => c.code);
  return by.length ? `is used by COGS ${by.join(", ")}` : null;
};

export const salaryRangeCrud = makeCrud<SalaryRangeRecord>({
  entityType: "Salary Range",
  repo: salaryRangeRepository,
  labelOf: (r) => r.code,
  references: (r) => refReason(r.id),
});

export const salaryRangeService = {
  save(d: SalaryRangeDraft, id?: string): SalaryRangeRecord {
    const errors = validateSalaryRange(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    return saveRecord<SalaryRangeRecord>(
      salaryRangeRepository,
      "Salary Range",
      "SR-",
      {
        code: d.code.trim().toUpperCase(),
        name: d.name.trim(),
        vehicleType: d.vehicleType,
        tiers: d.tiers,
        rule: ruleOf(d.rule),
        remark: d.remark.trim(),
        status: d.status,
      },
      id,
    );
  },
};

// ---------------------------------------------------------------- Fuel Cost

export interface FuelCostDraft {
  code: string;
  name: string;
  vehicleType: string;
  fuelType: string;
  fuelRate: number;
  fuelPrice: number;
  remark: string;
  status: "Active" | "Inactive";
}

/** Fuel Types the vehicles of a vehicle type run on (Vehicle › Fuel). */
export const fuelTypesOf = (key: string) =>
  cogsVehicleTypes(vehicleMasterRepository.all()).find((t) => t.key === key)?.fuelTypes ?? [];

export function validateFuelCost(d: FuelCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = codeError(fuelCostRepository, d.code, "Fuel Cost", id);
  if (code) e["code"] = code;
  if (!d.name.trim()) e["name"] = "Fuel Cost Name is required.";
  const v = vehicleError(d.vehicleType);
  if (v) e["vehicleType"] = v;
  if (!v) {
    const types = fuelTypesOf(d.vehicleType);
    if (!types.length)
      e["fuelType"] =
        `No Fuel Type on the vehicles of ${d.vehicleType} in Vehicle: set it there first.`;
    else if (!d.fuelType) e["fuelType"] = "Fuel Type is required.";
    else if (!types.includes(d.fuelType))
      e["fuelType"] = `No vehicle of ${d.vehicleType} runs on ${d.fuelType} in Vehicle.`;
  }
  if (!(d.fuelRate > 0)) e["fuelRate"] = "Fuel Rate must be above 0.";
  if (!(d.fuelPrice > 0)) e["fuelPrice"] = "Fuel Price must be above 0.";
  return e;
}

export const fuelCostCrud = makeCrud<FuelCostRecord>({
  entityType: "Fuel Cost",
  repo: fuelCostRepository,
  labelOf: (r) => r.code,
  references: (r) => refReason(r.id),
});

export const fuelCostService = {
  save(d: FuelCostDraft, id?: string): FuelCostRecord {
    const errors = validateFuelCost(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    return saveRecord<FuelCostRecord>(
      fuelCostRepository,
      "Fuel Cost",
      "FU-",
      {
        code: d.code.trim().toUpperCase(),
        name: d.name.trim(),
        vehicleType: d.vehicleType,
        fuelType: d.fuelType,
        fuelRate: d.fuelRate,
        fuelPrice: d.fuelPrice,
        remark: d.remark.trim(),
        status: d.status,
      },
      id,
    );
  },
};
