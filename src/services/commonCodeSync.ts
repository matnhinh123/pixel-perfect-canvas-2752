// Common Code → records: records store the option NAME, so renaming an option rewrites every stored
// value that uses it. Only Customizable lists can be renamed (Fixed lists and locked options carry
// system rules), so only those are registered here.
import {
  businessPartnerRepository,
  commonCodeRepository,
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
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
  [CC.FUEL_TYPE]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["fuelType"] }],
  [CC.TRADE_MARK]: [{ repo: vehicleMasterRepository as AnyRepo, paths: ["tradeMark"] }],
  [CC.TAX_EVIDENCE]: [{ repo: costItemRepository as AnyRepo, paths: ["taxEvidence"] }],
  [CC.TAX_TARIFF]: [{ repo: costItemRepository as AnyRepo, paths: ["taxTariff"] }],
  [CC.FIXED_COST_TYPE]: [{ repo: fixedCostRepository as AnyRepo, paths: ["costTypeCode"] }],
  [CC.FIXED_COST_VEHICLE_TYPE]: [
    { repo: fixedCostRepository as AnyRepo, paths: ["vehicleTypes"] },
    { repo: fixedCostSummaryRepository as AnyRepo, paths: ["vehicleType"] },
  ],
};

/** Lists whose option names are stored on records (renaming rewrites them). */
export const SYNCED_CODE_TYPES = Object.keys(CODE_FIELDS);

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
