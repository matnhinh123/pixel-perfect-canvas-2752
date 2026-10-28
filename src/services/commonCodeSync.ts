// Common Code → records: records store the option NAME, so renaming an option rewrites every stored
// value that uses it. Only Customizable lists can be renamed (Fixed lists and locked options carry
// system rules), so only those are registered here.
import {
  businessPartnerRepository,
  cogsRepository,
  commonCodeRepository,
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  variableCostMappingRepository,
  vehicleMasterRepository,
} from "@/repositories";
import type { Collection } from "@/repositories/storage";
import { CC } from "@/mock-data/commonCodes";

type AnyRepo = Collection<{ id: string }>;

/**
 * Where the option names of each list are stored: repository + property paths. "a.b[]" walks into
 * the array b; the leaf is a string or a string[].
 */
const CODE_FIELDS: Record<string, { repo: AnyRepo; paths: string[] }[]> = {
  [CC.BUSINESS_CATEGORY]: [
    { repo: businessPartnerRepository as AnyRepo, paths: ["businessCategory"] },
  ],
  [CC.INVOICING_LANGUAGE]: [
    { repo: businessPartnerRepository as AnyRepo, paths: ["invoiceLanguage"] },
  ],
  [CC.CONTACT_ROLE]: [
    {
      repo: businessPartnerRepository as AnyRepo,
      paths: ["customer.contacts[].contactRole", "vendor.contacts[].contactRole"],
    },
  ],
  [CC.GENDER]: [
    {
      repo: businessPartnerRepository as AnyRepo,
      paths: ["customer.contacts[].gender", "vendor.contacts[].gender"],
    },
  ],
  [CC.PAYMENT_TERM]: [
    {
      repo: businessPartnerRepository as AnyRepo,
      paths: ["customer.creditTerms[].creditTerm", "vendor.paymentTerms[].paymentTerm"],
    },
  ],
  [CC.APPROVER]: [
    { repo: businessPartnerRepository as AnyRepo, paths: ["customer.creditTerms[].approvedBy"] },
  ],
  [CC.DOCUMENT_TYPE]: [
    { repo: businessPartnerRepository as AnyRepo, paths: ["documents[].docType"] },
  ],
  [CC.VEHICLE_TYPE]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["vehicleType"] }],
  [CC.TRAILER_SIZE]: [
    {
      repo: vehicleMasterRepository as AnyRepo,
      paths: ["trailerSize", "containerMappings[].trailerType"],
    },
  ],
  [CC.TRAILER_TYPE]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["trailerType"] }],
  [CC.TRUCK_TYPE]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["truckType"] }],
  [CC.VEHICLE_GROUP]: [
    {
      repo: vehicleMasterRepository as AnyRepo,
      paths: ["vehicleGroup", "containerMappings[].vehicleGroup"],
    },
  ],
  [CC.FUEL_TYPE]: [
    { repo: vehicleMasterRepository as AnyRepo, paths: ["fuelType"] },
    { repo: fuelCostRepository as AnyRepo, paths: ["fuelType"] },
  ],
  [CC.TRADE_MARK]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["tradeMark"] }],
  [CC.TAX_EVIDENCE]: [{ repo: costItemRepository as AnyRepo, paths: ["taxEvidence"] }],
  [CC.TAX_TARIFF]: [{ repo: costItemRepository as AnyRepo, paths: ["taxTariff"] }],
};

/** Lists whose names are parts of the vehicle-type keys ("TRUCK · 5 tấn · HINO", "HEADER · 40 ft"). */
const VEHICLE_KEY_TYPES: string[] = [CC.TRUCK_TYPE, CC.TRAILER_SIZE, CC.TRADE_MARK];

/** Lists whose option names are stored on records (renaming rewrites them). */
export const SYNCED_CODE_TYPES = [
  ...new Set([...Object.keys(CODE_FIELDS), ...VEHICLE_KEY_TYPES, CC.CONTAINER_TYPE]),
];

/** Updates the records `f` returns a new value for; returns how many. */
function rewrite<T extends { id: string }>(repo: Collection<T>, f: (r: T) => T | null): number {
  let n = 0;
  for (const r of repo.all()) {
    const next = f(r);
    if (next) {
      repo.update(r.id, () => next);
      n++;
    }
  }
  return n;
}

/**
 * Vehicle-type keys of the cost setups, mappings and COGS follow a renamed Truck Type / Trailer Size /
 * Brand (each " · " part of a key is renamed), and so does the Truck Type picked on a route.
 */
function renameVehicleKeys(typeCode: string, map: Map<string, string>): number {
  const key = (k: string) =>
    k
      .split(" · ")
      .map((p) => map.get(p) ?? p)
      .join(" · ");
  const one = <T extends { id: string; vehicleType: string }>(r: T) =>
    r.vehicleType && key(r.vehicleType) !== r.vehicleType
      ? { ...r, vehicleType: key(r.vehicleType) }
      : null;
  let n = 0;
  n += rewrite(salaryRangeRepository, one);
  n += rewrite(cogsRepository, one);
  n += rewrite(fixedCostSummaryRepository, one);
  n += rewrite(variableCostMappingRepository, (r) => {
    const next = r.vehicleTypes.map(key);
    return next.join("|") !== r.vehicleTypes.join("|") ? { ...r, vehicleTypes: next } : null;
  });
  if (typeCode === CC.TRUCK_TYPE)
    n += rewrite(routeRepository, (r) =>
      r.truckType && map.has(r.truckType) ? { ...r, truckType: map.get(r.truckType)! } : null,
    );
  return n;
}

/** Container columns of the Salary Ranges (and their rates in the tiers) follow a renamed Container Type. */
function renameContainerTypes(map: Map<string, string>): number {
  return rewrite(salaryRangeRepository, (r) => {
    if (!r.containers?.some((c) => map.has(c.container))) return null;
    const to = (c: string) => map.get(c) ?? c;
    return {
      ...r,
      containers: r.containers.map((c) => ({ ...c, container: to(c.container) })),
      tiers: r.tiers.map((t) =>
        t.containerRates
          ? {
              ...t,
              containerRates: Object.fromEntries(
                Object.entries(t.containerRates).map(([k, v]) => [to(k), v]),
              ),
            }
          : t,
      ),
    };
  });
}

/** Rewrites the names found at `path` (immutably); returns the new value and how many changed. */
function renameAt(value: unknown, path: string[], map: Map<string, string>): [unknown, number] {
  if (value === null || value === undefined) return [value, 0];
  if (path.length === 0) {
    if (typeof value === "string") return map.has(value) ? [map.get(value), 1] : [value, 0];
    if (Array.isArray(value)) {
      let n = 0;
      const next = value.map((v) => {
        if (typeof v === "string" && map.has(v)) {
          n++;
          return map.get(v);
        }
        return v;
      });
      return n ? [next, n] : [value, 0];
    }
    return [value, 0];
  }
  const [head, ...rest] = path;
  const isArray = head!.endsWith("[]");
  const key = isArray ? head!.slice(0, -2) : head!;
  if (typeof value !== "object") return [value, 0];
  const obj = value as Record<string, unknown>;
  const child = obj[key];
  if (isArray) {
    if (!Array.isArray(child)) return [value, 0];
    let n = 0;
    const items = child.map((item) => {
      const [v, c] = renameAt(item, rest, map);
      n += c;
      return v;
    });
    return n ? [{ ...obj, [key]: items }, n] : [value, 0];
  }
  const [v, c] = renameAt(child, rest, map);
  return c ? [{ ...obj, [key]: v }, c] : [value, 0];
}

/**
 * Applies option renames (old name → new name) of one Common Code type to every stored record.
 * Returns the number of records updated.
 */
export function propagateRenames(typeCode: string, renames: [string, string][]): number {
  const map = new Map(renames.filter(([a, b]) => a && b && a !== b));
  if (!map.size) return 0;
  let records = 0;
  for (const { repo, paths } of CODE_FIELDS[typeCode] ?? []) {
    for (const rec of repo.all()) {
      let next: unknown = rec;
      let changed = 0;
      for (const p of paths) {
        const [v, c] = renameAt(next, p.split("."), map);
        next = v;
        changed += c;
      }
      if (changed) {
        repo.update(rec.id, () => next as { id: string });
        records++;
      }
    }
  }
  if (VEHICLE_KEY_TYPES.includes(typeCode)) records += renameVehicleKeys(typeCode, map);
  if (typeCode === CC.CONTAINER_TYPE)
    records += renameContainerTypes(map) + renameVehicleKeys(typeCode, map);
  // A UoM belongs to its category through the option's attribute: keep that link too.
  if (typeCode === CC.UOM_CATEGORY) {
    const uom = commonCodeRepository.get(CC.UOM);
    if (uom?.options.some((o) => map.has(o.attribute)))
      commonCodeRepository.update(uom.id, (p) => ({
        ...p,
        options: p.options.map((o) =>
          map.has(o.attribute) ? { ...o, attribute: map.get(o.attribute)! } : o,
        ),
      }));
  }
  return records;
}
