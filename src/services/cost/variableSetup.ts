// Variable Cost setups, each under its own code: Salary Range (driver salary tiers of a vehicle type and
// how they are read) and Fuel Cost (price of a fuel type). A COGS reads the ones of its vehicle type.
import type {
  CalcRule,
  ContainerColumn,
  FuelCostRecord,
  SalaryRangeRecord,
  SalaryTier,
  VariableComponent,
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
import type { BaseRecord, EntityType, Status } from "@/types";
import { cogsVehicleTypes, parseVehicleKey, salaryVehicleChoices } from "./cogsVehicle";
import { liveContainerTypes } from "./containerTypes";
import { codeOptions } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { FUEL_TYPES } from "@/mock-data/vehicleMaster";

/** Vehicle types of the current Vehicle master and Container Types. */
const currentTypes = () => cogsVehicleTypes(vehicleMasterRepository.all(), liveContainerTypes());
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
    : currentTypes().some((t) => t.key === key)
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
  containers: ContainerColumn[];
  rule: CalcRule;
  remark: string;
  status: Status;
}

const isHeader = (key: string) => parseVehicleKey(key)?.kind === "HEADER";

/** The Salary Range a vehicle type has already (one per vehicle type; Drafts aside), other than `exceptId`. */
export const salaryRangeOfVehicle = (vehicleType: string, exceptId?: string) =>
  salaryRangeRepository
    .all()
    .find(
      (r) =>
        !r.deleted &&
        r.status !== "Draft" &&
        r.id !== exceptId &&
        !!vehicleType &&
        r.vehicleType === vehicleType,
    );

/** Vehicle Type of a Salary Range: Truck + Truck Type, or Header; required unless Draft. */
function salaryVehicleError(key: string, status: Status) {
  if (!key)
    return status === "Draft" ? null : "Vehicle Type is required (a Draft can leave it empty).";
  return salaryVehicleChoices(currentTypes()).includes(key)
    ? null
    : `No active vehicle of type ${key} in Vehicle.`;
}

export function validateSalaryRange(d: SalaryRangeDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = codeError(salaryRangeRepository, d.code, "Salary Range", id);
  if (code) e["code"] = code;
  if (!d.name.trim()) e["name"] = "Salary Range Name is required.";
  const v = salaryVehicleError(d.vehicleType, d.status);
  const dup = v || d.status === "Draft" ? undefined : salaryRangeOfVehicle(d.vehicleType, id);
  if (v) e["vehicleType"] = v;
  else if (dup) e["vehicleType"] = `${d.vehicleType} already has a Salary Range: ${dup.code}.`;
  const t = validateTiers(d.tiers);
  if (!t.ok) e["tiers"] = t.message;
  if (isHeader(d.vehicleType))
    for (const [i, c] of d.containers.entries()) {
      const msg = !c.container
        ? "pick a Container Type"
        : d.containers.findIndex((x) => x.container === c.container) !== i
          ? `${c.container} has two columns`
          : !(c.pct >= 0)
            ? "the % must be a number of 0 or more"
            : "";
      if (msg) {
        e["containers"] = `Container column ${i + 1}: ${msg}.`;
        break;
      }
    }
  if (!(d.rule.roundStep >= 0)) e["roundStep"] = "Round up to must be a number of 0 or more.";
  if (d.rule.regionOn && !(d.rule.regionAmount >= 0))
    e["regionAmount"] = "Other terrain surcharge must be a number of 0 or more.";
  return e;
}

const salaryRangeBase = makeCrud<SalaryRangeRecord>({
  entityType: "Salary Range",
  repo: salaryRangeRepository,
  labelOf: (r) => r.code,
  references: () => null,
});
/** As the base, but a Draft without a vehicle type (or with one taken) is not activated from the list. */
export const salaryRangeCrud: typeof salaryRangeBase = {
  ...salaryRangeBase,
  setStatus(ids, status) {
    const ok =
      status === "Active"
        ? ids.filter((id) => {
            const r = salaryRangeRepository.get(id);
            return !!r?.vehicleType && !salaryRangeOfVehicle(r.vehicleType, r.id);
          })
        : ids;
    return salaryRangeBase.setStatus(ok, status);
  },
};

/** A free code for a copy: CODE-COPY, CODE-COPY2… (max 20 characters). */
function copyCode(code: string) {
  const taken = new Set(
    salaryRangeRepository
      .all()
      .filter((r) => !r.deleted)
      .map((r) => r.code.toUpperCase()),
  );
  for (let n = 1; ; n++) {
    const tail = `-COPY${n === 1 ? "" : n}`;
    const c = `${code.slice(0, 20 - tail.length)}${tail}`;
    if (!taken.has(c)) return c;
  }
}

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
        // Container columns are a Header's only; a tier keeps the rates of the columns there are.
        containers: isHeader(d.vehicleType) ? d.containers : [],
        tiers: d.tiers.map(({ containerRates, ...t }) => {
          const keep = isHeader(d.vehicleType)
            ? d.containers.filter((c) => containerRates && c.container in containerRates)
            : [];
          return keep.length
            ? {
                ...t,
                containerRates: Object.fromEntries(
                  keep.map((c) => [c.container, containerRates![c.container]!]),
                ),
              }
            : t;
        }),
        rule: ruleOf(d.rule),
        remark: d.remark.trim(),
        status: d.status,
      },
      id,
    );
  },
  /**
   * A copy of a Salary Range to set up for another vehicle type: Draft (not used anywhere until it is
   * made Active) and no vehicle type; tiers, container columns, rule and remark copied.
   */
  duplicate(id: string): SalaryRangeRecord {
    const src = salaryRangeRepository.get(id);
    if (!src || src.deleted) throw new BusinessRuleError("Salary Range not found.");
    return saveRecord<SalaryRangeRecord>(salaryRangeRepository, "Salary Range", "SR-", {
      code: copyCode(src.code),
      name: `${src.name} (copy)`.slice(0, 200),
      vehicleType: "",
      tiers: src.tiers.map((t) => ({
        ...t,
        ...(t.containerRates ? { containerRates: { ...t.containerRates } } : {}),
      })),
      containers: (src.containers ?? []).map((c) => ({ ...c })),
      rule: ruleOf(src.rule),
      remark: src.remark,
      status: "Draft",
    });
  },
};

// ---------------------------------------------------------------- Fuel Cost

export interface FuelCostDraft {
  fuelType: string;
  fuelPrice: number;
  remark: string;
  status: "Active" | "Inactive";
}

/** Fuel Types that can be priced: Common Code › Fuel Type (the list Vehicle › Fuel Type picks from). */
export const fuelTypeChoices = () => codeOptions(CC.FUEL_TYPE, FUEL_TYPES);
/** "FU-DIESEL": the code of a Fuel Type's price. */
export const fuelCodeOf = (fuelType: string) => sanitizeSetupCode(`FU-${fuelType}`);

/** One price per Fuel Type, of a fuel the vehicles run on. */
export function validateFuelCost(d: FuelCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.fuelType) e["fuelType"] = "Fuel Type is required.";
  else if (!fuelTypeChoices().includes(d.fuelType))
    e["fuelType"] = `${d.fuelType} is not a Fuel Type of Common Code.`;
  else if (
    fuelCostRepository.all().some((r) => !r.deleted && r.id !== id && r.fuelType === d.fuelType)
  )
    e["fuelType"] = `${d.fuelType} has a Fuel Cost already — edit that one.`;
  if (!(d.fuelPrice > 0)) e["fuelPrice"] = "Fuel Price must be above 0.";
  return e;
}

export const fuelCostCrud = makeCrud<FuelCostRecord>({
  entityType: "Fuel Cost",
  repo: fuelCostRepository,
  labelOf: (r) => r.code,
  references: () => null,
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
        code: fuelCodeOf(d.fuelType),
        fuelType: d.fuelType,
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
  assignCostId: string;
  vehicleTypes: string[];
  component: VariableComponent;
}

/** The other live mappings of the same vehicle type holding a variable cost. */
export const mappingsHolding = (
  vehicleType: string,
  component: VariableComponent,
  exceptId?: string,
) =>
  variableCostMappingRepository
    .all()
    .filter(
      (m) =>
        !m.deleted &&
        m.id !== exceptId &&
        m.vehicleTypes.includes(vehicleType) &&
        m.component === component,
    );

const fareLabel = (id: string) => costItemRepository.get(id)?.code ?? id;

/**
 * One mapping per Fare Code, one variable cost per mapping; a variable cost of a vehicle type is booked to
 * one Fare Code only (it would be counted twice).
 */
export function validateVariableCostMapping(
  d: VariableCostMappingDraft,
  id?: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.assignCostId) e["assignCost"] = "Fare Code is required.";
  else if (
    variableCostMappingRepository
      .all()
      .some((m) => !m.deleted && m.id !== id && m.assignCostId === d.assignCostId)
  )
    e["assignCost"] =
      `${fareLabel(d.assignCostId)} already has a Variable Cost Mapping — edit that one.`;
  if (!d.vehicleTypes.length) e["vehicleTypes"] = "Add at least one Vehicle Type.";
  for (const [i, key] of d.vehicleTypes.entries()) {
    const msg =
      vehicleError(key) ?? (d.vehicleTypes.indexOf(key) !== i ? `${key} is listed twice.` : "");
    if (msg) {
      e["vehicleTypes"] = `Vehicle Type row ${i + 1}: ${msg}`;
      break;
    }
  }
  if (!d.component) e["component"] = "Variable Cost is required.";
  else
    for (const key of d.vehicleTypes) {
      const other = mappingsHolding(key, d.component, id)[0];
      if (other) {
        const fare = costItemRepository.get(other.assignCostId)?.code ?? "another Fare Code";
        e["vehicleTypes"] = `${d.component} of ${key} is already mapped to ${fare} — remove it.`;
        break;
      }
    }
  return e;
}

export const variableCostMappingCrud = makeCrud<VariableCostMappingRecord>({
  entityType: "Variable Cost Mapping",
  repo: variableCostMappingRepository,
  labelOf: (m) => `${fareLabel(m.assignCostId)} · ${m.component}`,
  references: () => null,
});

export const variableCostMappingService = {
  save(d: VariableCostMappingDraft, id?: string): VariableCostMappingRecord {
    const errors = validateVariableCostMapping(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const existing = id ? variableCostMappingRepository.get(id) : undefined;
    const label = `${fareLabel(d.assignCostId)} · ${d.component}`;
    if (!existing) {
      const rec: VariableCostMappingRecord = {
        id: uid("VM-"),
        ...d,
        status: "Active",
        ...stampCreate(),
      };
      variableCostMappingRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Variable Cost Mapping",
        entityId: rec.id,
        entityLabel: label,
        note: d.vehicleTypes.join(", "),
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...d });
    variableCostMappingRepository.update(existing.id, () => next);
    const base = {
      action: "UPDATE" as const,
      entityType: "Variable Cost Mapping" as const,
      entityId: next.id,
      entityLabel: label,
    };
    const out: Parameters<typeof auditService.logMany>[0] = [];
    if (existing.assignCostId !== next.assignCostId)
      out.push({
        ...base,
        field: "Fare Code",
        oldValue: fareLabel(existing.assignCostId),
        newValue: fareLabel(next.assignCostId),
      });
    if (existing.vehicleTypes.join(", ") !== next.vehicleTypes.join(", "))
      out.push({
        ...base,
        field: "Vehicle Types",
        oldValue: existing.vehicleTypes.join(", ") || "—",
        newValue: next.vehicleTypes.join(", ") || "—",
      });
    if (existing.component !== next.component)
      out.push({
        ...base,
        field: "Variable Cost",
        oldValue: existing.component,
        newValue: next.component,
      });
    auditService.logMany(out);
    return next;
  },
};
