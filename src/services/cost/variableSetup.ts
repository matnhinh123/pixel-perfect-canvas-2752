// Variable Cost setups, each under its own code: Salary Range (driver salary tiers of a vehicle type and
// how they are read) and Fuel Cost (fuel of a vehicle type). A COGS reads the ones of its vehicle type.
import type {
  CalcRule,
  FuelCostRecord,
  SalaryRangeRecord,
  SalaryTier,
  VariableCostMappingRecord,
} from "@/types";
import {
  cogsRepository,
  costItemRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  uid,
  variableCostMappingRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import type { Collection } from "@/repositories/storage";
import type { BaseRecord, EntityType } from "@/types";
import { cogsVehicleTypes } from "./cogsVehicle";
import { ruleOf, validateTiers } from "./salaryRange";
import { setupsFor } from "./cogsBuild";
import { routeTotals } from "./costMath";

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
  vehicleTypes: string[];
  tiers: SalaryTier[];
  reeferPct: number;
  rule: CalcRule;
  remark: string;
  status: "Active" | "Inactive";
}

/** The Salary Range a vehicle type is in already (each vehicle type is in one), other than `exceptId`. */
export const salaryRangeOfVehicle = (vehicleType: string, exceptId?: string) =>
  salaryRangeRepository
    .all()
    .find((r) => !r.deleted && r.id !== exceptId && r.vehicleTypes.includes(vehicleType));

export function validateSalaryRange(d: SalaryRangeDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = codeError(salaryRangeRepository, d.code, "Salary Range", id);
  if (code) e["code"] = code;
  if (!d.name.trim()) e["name"] = "Salary Range Name is required.";
  if (!d.vehicleTypes.length) e["vehicleTypes"] = "Add at least one Vehicle Type.";
  for (const [i, key] of d.vehicleTypes.entries()) {
    const v = vehicleError(key);
    const dup = v ? undefined : salaryRangeOfVehicle(key, id);
    const msg = v
      ? v
      : d.vehicleTypes.indexOf(key) !== i
        ? `${key} is listed twice.`
        : dup
          ? `${key} already has a Salary Range: ${dup.code}.`
          : "";
    if (msg) {
      e["vehicleTypes"] = `Vehicle Type row ${i + 1}: ${msg}`;
      break;
    }
  }
  const t = validateTiers(d.tiers);
  if (!t.ok) e["tiers"] = t.message;
  if (!(d.reeferPct >= 0)) e["reeferPct"] = "CNTR lạnh %: a number of 0 or more.";
  if (!(d.rule.roundStep >= 0)) e["roundStep"] = "Round up to must be a number of 0 or more.";
  if (d.rule.regionOn && !(d.rule.regionAmount >= 0))
    e["regionAmount"] = "Highland surcharge must be a number of 0 or more.";
  return e;
}

/** Variable Cost Mappings that read a setup (it cannot be deleted while they do; it can be deactivated). */
const refReason = (id: string) => {
  const n = variableCostMappingRepository
    .all()
    .filter((m) => !m.deleted && (m.salaryRangeId === id || m.fuelCostId === id)).length;
  return n ? `is used by ${n} Variable Cost Mapping${n === 1 ? "" : "s"}` : null;
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
        vehicleTypes: d.vehicleTypes,
        tiers: d.tiers,
        reeferPct: d.reeferPct,
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

// ---------------------------------------------------------------- Variable Cost Mapping

export interface VariableCostMappingDraft {
  routeId: string;
  vehicleType: string;
  salaryRangeId: string;
  fuelCostId: string;
  assignCostId: string;
  remark: string;
  status: "Active" | "Inactive";
}

/** Fare Codes of the Fixed Cost Mappings: not offered for a variable cost. */
export const fixedFareIds = () =>
  new Set(
    fixedCostSummaryRepository
      .all()
      .filter((m) => !m.deleted)
      .map((m) => m.assignCostId),
  );

const fareCodeOf = (id: string) => costItemRepository.get(id)?.code ?? id;

export function validateVariableCostMapping(
  d: VariableCostMappingDraft,
  id?: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  const route = d.routeId ? routeRepository.get(d.routeId) : undefined;
  if (!route || route.deleted) e["routeId"] = "Route is required.";
  else if (!routeTotals(route).calculated)
    e["routeId"] = "This route has not been calculated: open it and click Calculate Route.";
  const v = vehicleError(d.vehicleType);
  if (v) e["vehicleType"] = v;
  if (route && !v) {
    const dup = variableCostMappingRepository
      .all()
      .find(
        (m) =>
          !m.deleted && m.id !== id && m.routeId === d.routeId && m.vehicleType === d.vehicleType,
      );
    if (dup)
      e["routeId"] = `${route.code} · ${d.vehicleType} is mapped already: edit that mapping.`;
    if (
      !setupsFor(salaryRangeRepository.all(), d.vehicleType).some((r) => r.id === d.salaryRangeId)
    )
      e["salaryRangeId"] =
        `Pick the Salary Range of ${d.vehicleType} (add one first if there is none).`;
    if (!setupsFor(fuelCostRepository.all(), d.vehicleType).some((r) => r.id === d.fuelCostId))
      e["fuelCostId"] = `Pick the Fuel Cost of ${d.vehicleType} (add one first if there is none).`;
  }
  if (!d.assignCostId) e["assignCost"] = "Fare Code is required.";
  else if (fixedFareIds().has(d.assignCostId))
    e["assignCost"] = `${fareCodeOf(d.assignCostId)} is a Fixed Cost Fare Code: pick another one.`;
  return e;
}

/** COGS that read a mapping (it cannot be deleted while they do; it can be deactivated). */
const mappingRefReason = (id: string) => {
  const by = cogsRepository
    .all()
    .filter((c) => !c.deleted && c.variableMappingId === id)
    .map((c) => c.code);
  return by.length ? `is used by COGS ${by.join(", ")}` : null;
};
const mappingLabel = (m: Pick<VariableCostMappingRecord, "routeId" | "vehicleType">) =>
  `${routeRepository.get(m.routeId)?.code ?? m.routeId} · ${m.vehicleType}`;

export const variableCostMappingCrud = makeCrud<VariableCostMappingRecord>({
  entityType: "Variable Cost Mapping",
  repo: variableCostMappingRepository,
  labelOf: mappingLabel,
  references: (m) => mappingRefReason(m.id),
});

export const variableCostMappingService = {
  save(d: VariableCostMappingDraft, id?: string): VariableCostMappingRecord {
    const errors = validateVariableCostMapping(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const body = {
      routeId: d.routeId,
      vehicleType: d.vehicleType,
      salaryRangeId: d.salaryRangeId,
      fuelCostId: d.fuelCostId,
      assignCostId: d.assignCostId,
      remark: d.remark.trim(),
      status: d.status,
    };
    const existing = id ? variableCostMappingRepository.get(id) : undefined;
    if (!existing) {
      const rec: VariableCostMappingRecord = { id: uid("VM-"), ...body, ...stampCreate() };
      variableCostMappingRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Variable Cost Mapping",
        entityId: rec.id,
        entityLabel: mappingLabel(rec),
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...body });
    variableCostMappingRepository.update(existing.id, () => next);
    auditService.log({
      action: "UPDATE",
      entityType: "Variable Cost Mapping",
      entityId: next.id,
      entityLabel: mappingLabel(next),
    });
    return next;
  },
};
