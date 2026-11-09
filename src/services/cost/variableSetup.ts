// Variable Cost setups, each under its own code: Salary Range (driver salary tiers of a vehicle type and
// how they are read) and Fuel Cost (price of a fuel type). A COGS reads the ones of its vehicle type.
import type {
  CalcRule,
  ContainerColumn,
  FuelCostRecord,
  FuelVehicleRate,
  SalaryRangeRecord,
  SalaryTier,
  VariableComponent,
} from "@/types";
import {
  cogsRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import type { Collection } from "@/repositories/storage";
import type { BaseRecord, EntityType, Status } from "@/types";
import {
  cogsVehicleTypes,
  parseVehicleKey,
  salaryVehicleChoices,
  salaryVehiclesOf,
} from "./cogsVehicle";
import { liveContainerTypes } from "./containerTypes";
import { fareIdOf } from "./fareCode";
import { codeOptions } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { FUEL_TYPES } from "@/mock-data/vehicleMaster";

/** Vehicle types of the current Vehicle master and Container Types. */
const currentTypes = () => cogsVehicleTypes(vehicleMasterRepository.all(), liveContainerTypes());
import { ruleOf, validateTiers } from "./salaryRange";
import { setupsFor } from "./cogsBuild";
import { routeTotals } from "./costMath";
import { fuelVehiclesOf } from "./fuelRates";

/** A–Z, 0–9, dot, hyphen, underscore; max 20 (as the COGS Code). */
const SETUP_CODE = /^[A-Z0-9._-]{1,20}$/;
export const sanitizeSetupCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);

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
/** JSON with the keys of every object sorted: equal values give equal text. */
function stableJson(v: unknown): string {
  return (
    JSON.stringify(v, (_k, x: unknown) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
            Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
          )
        : x,
    ) ?? ""
  );
}

function saveRecord<T extends BaseRecord & { code: string }>(
  repo: Collection<T>,
  entityType: EntityType,
  prefix: string,
  body: Omit<T, "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">,
  id?: string,
  /** Keep versions: 1 when created; a save that changes something adds 1 and keeps the one before. */
  versioned = false,
  /** Older records in today's shape, so that a save changing nothing is not a new version. */
  normalize?: (r: T) => T,
): T {
  const existing = id ? repo.get(id) : undefined;
  if (!existing) {
    const rec = {
      id: uid(prefix),
      ...body,
      ...(versioned ? { version: 1, history: [] } : {}),
      ...stampCreate(),
    } as unknown as T;
    repo.insert(rec);
    auditService.log({ action: "CREATE", entityType, entityId: rec.id, entityLabel: rec.code });
    return rec;
  }
  const keys = Object.keys(body) as (keyof typeof body & keyof T)[];
  const was = (normalize ? normalize(existing) : existing) as unknown as Record<string, unknown>;
  const changed = keys.some(
    (k) =>
      stableJson(was[k as string]) !== stableJson((body as Record<string, unknown>)[k as string]),
  );
  // A new version keeps the one before (its content, and when / by whom it was saved).
  const version = (was["version"] as number | undefined) ?? 1;
  const bump =
    versioned && changed
      ? {
          version: version + 1,
          history: [
            ...((was["history"] as unknown[] | undefined) ?? []),
            {
              version,
              savedAt: existing.updatedAt || existing.createdAt,
              savedBy: existing.updatedBy || existing.createdBy,
              data: Object.fromEntries(keys.map((k) => [k, was[k as string]])),
            },
          ],
        }
      : {};
  const next = stampUpdate({ ...existing, ...body, ...bump } as T);
  repo.update(existing.id, () => next);
  auditService.log({ action: "UPDATE", entityType, entityId: next.id, entityLabel: next.code });
  return next;
}

// ---------------------------------------------------------------- Salary Range

export interface SalaryRangeDraft {
  code: string;
  name: string;
  /** One or more Truck Types, or "HEADER" alone; empty on a Draft. */
  vehicleTypes: string[];
  tiers: SalaryTier[];
  containers: ContainerColumn[];
  rule: CalcRule;
  /** Code of the Fare Code its Trip Salary is booked to (empty: none yet). */
  fareCode: string;
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
        salaryVehiclesOf(r).includes(vehicleType),
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
  const fare = fareIdOf(d.fareCode).error;
  if (fare) e["fareCode"] = fare;
  // One or more Truck Types, or Header alone; each vehicle type in one Salary Range only.
  const keys = d.vehicleTypes;
  const v = !keys.length
    ? salaryVehicleError("", d.status)
    : keys.some(isHeader) && keys.length > 1
      ? "A Header Salary Range pays the headers only: no Truck Type with it."
      : new Set(keys).size !== keys.length
        ? "A vehicle type is picked twice."
        : (keys.map((k) => salaryVehicleError(k, d.status)).find(Boolean) ?? null);
  const taken =
    v || d.status === "Draft"
      ? undefined
      : keys.map((k) => ({ k, r: salaryRangeOfVehicle(k, id) })).find((x) => x.r);
  if (v) e["vehicleType"] = v;
  else if (taken) e["vehicleType"] = `${taken.k} already has a Salary Range: ${taken.r!.code}.`;
  const t = validateTiers(d.tiers);
  if (!t.ok) e["tiers"] = t.message;
  if (d.vehicleTypes.some(isHeader))
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
            const keys = r ? salaryVehiclesOf(r) : [];
            return keys.length > 0 && keys.every((k) => !salaryRangeOfVehicle(k, r!.id));
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
    const header = d.vehicleTypes.some(isHeader);
    return saveRecord<SalaryRangeRecord>(
      salaryRangeRepository,
      "Salary Range",
      "SR-",
      {
        code: d.code.trim().toUpperCase(),
        name: d.name.trim(),
        vehicleType: d.vehicleTypes[0] ?? "",
        vehicleTypes: [...d.vehicleTypes],
        // Container columns are a Header's only; a tier keeps the rates of the columns there are.
        containers: header ? d.containers : [],
        tiers: d.tiers.map(({ containerRates, ...t }) => {
          const keep = header
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
        fareCostId: fareIdOf(d.fareCode).id,
        remark: d.remark.trim(),
        status: d.status,
      },
      id,
      true,
      // An older Salary Range: its one vehicle type as the list.
      (r) => ({ ...r, vehicleTypes: salaryVehiclesOf(r) }),
    );
  },
  /**
   * A copy of a Salary Range to set up for another vehicle type: Draft (not used anywhere until it is
   * made Active) and no vehicle type; tiers, container columns, rule and remark copied.
   */
  duplicate(id: string): SalaryRangeRecord {
    const src = salaryRangeRepository.get(id);
    if (!src || src.deleted) throw new BusinessRuleError("Salary Range not found.");
    return saveRecord<SalaryRangeRecord>(
      salaryRangeRepository,
      "Salary Range",
      "SR-",
      {
        code: copyCode(src.code),
        name: `${src.name} (copy)`.slice(0, 200),
        vehicleType: "",
        vehicleTypes: [],
        tiers: src.tiers.map((t) => ({
          ...t,
          ...(t.containerRates ? { containerRates: { ...t.containerRates } } : {}),
        })),
        containers: (src.containers ?? []).map((c) => ({ ...c })),
        rule: ruleOf(src.rule),
        fareCostId: src.fareCostId,
        remark: src.remark,
        status: "Draft",
      },
      undefined,
      true,
    );
  },
};

// ---------------------------------------------------------------- Fuel Cost

export interface FuelCostDraft {
  /** Its own code; a new one starts from the Fuel Type ("FU-DIESEL"). */
  code: string;
  name: string;
  fuelType: string;
  fuelPrice: number;
  /** Its vehicle types (and brands), each with the Fuel Rate set, or null: its vehicles' average. */
  vehicles: FuelVehicleRate[];
  /** Code of the Fare Code it is booked to (empty: none yet). */
  fareCode: string;
  remark: string;
  status: "Active" | "Inactive";
}

/** Fuel Types that can be priced: Common Code › Fuel Type (the list Vehicle › Fuel Type picks from). */
export const fuelTypeChoices = () => codeOptions(CC.FUEL_TYPE, FUEL_TYPES);
/** "FU-DIESEL": the code a new Fuel Cost starts with (it can be changed). */
export const fuelCodeOf = (fuelType: string) => sanitizeSetupCode(`FU-${fuelType}`);

/** One price per Fuel Type, of a fuel the vehicles run on. */
/** Name of a Fuel Cost (older ones, without a name: "<Fuel Type> Fuel Cost"). */
export const fuelCostNameOf = (r: Pick<FuelCostRecord, "name" | "fuelType">) =>
  r.name || `${r.fuelType} Fuel Cost`;

export function validateFuelCost(d: FuelCostDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = codeError(fuelCostRepository, d.code, "Fuel Cost", id);
  if (code) e["code"] = code;
  if (!d.fuelType) e["fuelType"] = "Fuel Type is required.";
  else if (!fuelTypeChoices().includes(d.fuelType))
    e["fuelType"] = `${d.fuelType} is not a Fuel Type of Common Code.`;
  else if (
    fuelCostRepository.all().some((r) => !r.deleted && r.id !== id && r.fuelType === d.fuelType)
  )
    e["fuelType"] = `${d.fuelType} has a Fuel Cost already — edit that one.`;
  if (!(d.fuelPrice > 0)) e["fuelPrice"] = "Fuel Price must be above 0.";
  if (!d.name.trim()) e["name"] = "Fuel Cost Name is required.";
  const fare = fareIdOf(d.fareCode).error;
  if (fare) e["fareCode"] = fare;
  const seen = new Set<string>();
  for (const v of d.vehicles) {
    if (seen.has(v.vehicleType)) e[`vehicles.${v.vehicleType}`] = "Listed twice.";
    seen.add(v.vehicleType);
    for (const [k, r] of [
      ["K1", v.rate],
      ["K2", v.rateLoaded ?? null],
    ] as const)
      if (r !== null && (!(r > 0) || r >= 1000))
        e[`vehicles.${v.vehicleType}`] = `${k} must be above 0 and below 1,000 per 100 km.`;
  }
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
        code: d.code.trim().toUpperCase(),
        name: d.name.trim(),
        fuelType: d.fuelType,
        fuelPrice: d.fuelPrice,
        vehicles: d.vehicles.map((v) => ({
          vehicleType: v.vehicleType,
          rate: v.rate,
          rateLoaded: v.rateLoaded ?? null,
        })),
        fareCostId: fareIdOf(d.fareCode).id,
        remark: d.remark.trim(),
        status: d.status,
      },
      id,
      true,
      // An older Fuel Cost without its list: every vehicle type running on the fuel.
      (r) => ({ ...r, name: fuelCostNameOf(r), vehicles: fuelVehiclesOf(r, currentTypes()) }),
    );
  },
};
