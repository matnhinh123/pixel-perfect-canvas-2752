// One repository per entity, all built on the same generic Collection. Swap storage.ts for an API
// client later; services and UI keep working against the same surface.
import type {
  CommonCodeRecord,
  AuditEvent,
  BusinessPartnerRecord,
  CostGroupRecord,
  CostItemRecord,
  CostRecord,
  FixedCostRecord,
  FixedCostSummaryRecord,
  ImportBatch,
  RouteRecord,
  ServiceAssignment,
  ServiceRecord,
  VehicleMasterRecord,
  TenantTemplateConfig,
} from "@/types";
import {
  seedAudit,
  seedCosts,
  seedImportHistory,
  seedRoutes,
  seedServiceAssignments,
  seedServices,
  seedTemplateConfig,
} from "@/mock-data/seed";
import { seedCostGroups, seedCostItems } from "@/mock-data/costMaster";
import { seedFixedCosts, seedFixedCostSummaries } from "@/mock-data/fixedCost";
import { seedTollStations, type TollGateRecord } from "@/mock-data/tollCatalog";
import { seedFiveTonTrucks, seedVehicleMasters } from "@/mock-data/vehicleMaster";
import { seedBusinessPartners, seedPetrolimexTienGiang } from "@/mock-data/businessPartners";
import {
  SEED_CODE_FIXES,
  seedLocations,
  seedStandardLocations,
  type LocationMasterRecord,
} from "@/mock-data/locations";
import { CC, seedCommonCodes } from "@/mock-data/commonCodes";
import { createCollection, readJson, subscribeKey, writeJson } from "./storage";

export const routeRepository = createCollection<RouteRecord>("routes", seedRoutes);
// ".v2": the service tree / form fields were reworked — load the new demo seed without touching routes.
export const serviceRepository = createCollection<ServiceRecord>("services.v3", seedServices);
export const serviceAssignmentRepository = createCollection<ServiceAssignment>(
  "service-assignments.v3",
  seedServiceAssignments,
);
export const costRepository = createCollection<CostRecord>("costs", () => seedCosts(seedRoutes()));
// Master Data > Cost: cost groups and cost items (master data only).
export const costGroupRepository = createCollection<CostGroupRecord>("cost-groups", seedCostGroups);
export const costItemRepository = createCollection<CostItemRecord>("cost-items.v3", seedCostItems);
// ".v2": vehicle types became codes (TRUCK, 5T, 20DC…) — load the new demo seed.
export const fixedCostRepository = createCollection<FixedCostRecord>(
  "fixed-costs.v2",
  seedFixedCosts,
);
export const fixedCostSummaryRepository = createCollection<FixedCostSummaryRecord>(
  "fixed-cost-summaries.v2",
  seedFixedCostSummaries,
);
/** Location master; Routing stop pickers read active locations from it. */
export const locationRepository = createCollection<LocationMasterRecord>(
  "locations",
  seedLocations,
);
// Real UN/LOCODE / IATA seed points: added once when missing; seed points still carrying their old
// code get the real UN/LOCODE (a code the user changed is left alone).
{
  const have = new Set(locationRepository.all().map((l) => l.id));
  const add = seedStandardLocations().filter((l) => !have.has(l.id));
  if (add.length) locationRepository.insertMany(add);
  const codes = new Set(locationRepository.all().map((l) => l.code));
  for (const [id, fix] of Object.entries(SEED_CODE_FIXES)) {
    const l = locationRepository.get(id);
    if (l && l.code === fix.from && !codes.has(fix.to))
      locationRepository.update(id, (p) => ({ ...p, code: fix.to }));
  }
}
/** Toll Station master; Routing matches gates on the route against it. */
export const tollStationRepository = createCollection<TollGateRecord>(
  // ".v2": Vietmap ID / Source / Location / Remark were added to the toll station model.
  "toll-stations.v2",
  seedTollStations,
);
/** Vehicle master (one row per physical vehicle). */
export const vehicleMasterRepository = createCollection<VehicleMasterRecord>(
  // ".v5": registration / insurance / identification fields are back — reload the demo seed.
  "vehicle-masters.v5",
  seedVehicleMasters,
);
// Demo fleet of 5-ton trucks: added once when missing (a deleted one stays deleted).
{
  const have = new Set(vehicleMasterRepository.all().map((v) => v.id));
  const add = seedFiveTonTrucks().filter((v) => !have.has(v.id));
  if (add.length) vehicleMasterRepository.insertMany(add);
}
/** Business Partner master (customers and vendors — one partner, several roles). */
export const businessPartnerRepository = createCollection<BusinessPartnerRecord>(
  "business-partners",
  seedBusinessPartners,
);
// Demo partners added after the first seed: inserted once when missing (a deleted one stays deleted).
{
  const have = new Set(businessPartnerRepository.all().map((b) => b.id));
  const add = seedPetrolimexTienGiang().filter((b) => !have.has(b.id));
  if (add.length) businessPartnerRepository.insertMany(add);
}
/** Common Code: the option lists behind dropdowns (types are system-defined). */
export const commonCodeRepository = createCollection<CommonCodeRecord>(
  "common-codes",
  seedCommonCodes,
);
// Location Sub-Type was removed: retire the stored type once.
{
  const t = commonCodeRepository.get(CC.LOCATION_SUB_TYPE);
  if (t && !t.deleted) commonCodeRepository.update(t.id, (p) => ({ ...p, deleted: true }));
}
// Vehicle Brand (formerly "Trade Mark") is back: restore the type retired earlier (or add it when
// missing) and give the stored type its new name.
{
  const t = commonCodeRepository.get(CC.TRADE_MARK);
  const seed = seedCommonCodes().find((x) => x.id === CC.TRADE_MARK);
  // Name / usage labels follow the system ("Trade Mark" → "Vehicle Brand", field "Brand Name").
  if (t && seed && (t.name !== seed.name || JSON.stringify(t.usage) !== JSON.stringify(seed.usage)))
    commonCodeRepository.update(t.id, (p) => ({ ...p, name: seed.name, usage: seed.usage }));
  if (t?.deleted) commonCodeRepository.update(t.id, (p) => ({ ...p, deleted: false }));
  if (!t && seed) commonCodeRepository.insert(seed);
}
// Country list (Business Partner) added to Common Code: inserted once into existing storage.
{
  const seed = seedCommonCodes().find((x) => x.id === CC.COUNTRY);
  if (seed && !commonCodeRepository.get(CC.COUNTRY)) commonCodeRepository.insert(seed);
}
// Fee Type "Rural Road" (hương lộ) was dropped: remove it from stored lists; stations that used it
// go back to Road.
for (const code of [CC.TOLL_FEE_TYPE, CC.ROUTE_FEE_TYPE]) {
  const t = commonCodeRepository.get(code);
  if (t?.options.some((o) => o.name === "Rural Road"))
    commonCodeRepository.update(t.id, (p) => ({
      ...p,
      options: p.options.filter((o) => o.name !== "Rural Road"),
    }));
}
for (const s of tollStationRepository.all())
  if ((s.feeType as string) === "Rural Road")
    tollStationRepository.update(s.id, (p) => ({ ...p, feeType: "Toll" }));
// Vehicle Type became Customizable (new types pick a base type as attribute); stored list follows.
{
  const vt = commonCodeRepository.get(CC.VEHICLE_TYPE);
  if (vt && vt.kind === "Fixed") {
    const seed = seedCommonCodes().find((x) => x.id === CC.VEHICLE_TYPE);
    if (seed)
      commonCodeRepository.update(vt.id, (p) => ({
        ...p,
        kind: "Customizable",
        remark: seed.remark,
        attributes: seed.attributes,
        lockedOptions: seed.lockedOptions ?? [],
        options: p.options.map((o) => ({
          ...o,
          attribute: ["TRUCK", "HEAD", "TRAILER"].includes(o.name) ? o.name : "TRUCK",
        })),
      }));
  }
}
// Trailer Size became Customizable (sizes such as 45 ft can be added / renamed) and is used by the
// Trailer Size field; Trailer Type got its own list (body type). Stored lists follow once.
{
  const seeds = seedCommonCodes();
  const ts = commonCodeRepository.get(CC.TRAILER_SIZE);
  const seed = seeds.find((x) => x.id === CC.TRAILER_SIZE);
  if (
    ts &&
    seed &&
    (ts.kind === "Fixed" || JSON.stringify(ts.usage) !== JSON.stringify(seed.usage))
  )
    commonCodeRepository.update(ts.id, (p) => ({
      ...p,
      kind: "Customizable",
      remark: seed.remark,
      usage: seed.usage,
    }));
  // Container Size Mapping was removed: Vehicle Group no longer lists it as a usage.
  const vg = commonCodeRepository.get(CC.VEHICLE_GROUP);
  const vgSeed = seeds.find((x) => x.id === CC.VEHICLE_GROUP);
  if (vg && vgSeed && JSON.stringify(vg.usage) !== JSON.stringify(vgSeed.usage))
    commonCodeRepository.update(vg.id, (p) => ({ ...p, usage: vgSeed.usage }));
  const tt = seeds.find((x) => x.id === CC.TRAILER_TYPE);
  if (tt && !commonCodeRepository.get(CC.TRAILER_TYPE)) commonCodeRepository.insert(tt);
}
// Vehicle Type "HEAD" is shown as "HEADER": stored option list + vehicles follow once.
{
  const vt = commonCodeRepository.get(CC.VEHICLE_TYPE);
  const toHeader = (s: string) => (s === "HEAD" ? "HEADER" : s);
  if (
    vt &&
    (vt.options.some((o) => o.name === "HEAD" || o.attribute === "HEAD") ||
      vt.attributes.some((a) => a.code === "HEAD"))
  )
    commonCodeRepository.update(vt.id, (p) => ({
      ...p,
      remark: p.remark.replace(/\bHEAD\b/g, "HEADER"),
      attributes: p.attributes.map((a) => ({ code: toHeader(a.code), name: toHeader(a.name) })),
      options: p.options.map((o) => ({
        ...o,
        name: toHeader(o.name),
        attribute: toHeader(o.attribute),
      })),
    }));
  for (const v of vehicleMasterRepository.all())
    if (v.vehicleType === "HEAD")
      vehicleMasterRepository.update(v.id, (p) => ({ ...p, vehicleType: "HEADER" }));
}
// Location Type "Port" was renamed "Seaport": stored option + stored locations follow once.
{
  const lt = commonCodeRepository.get(CC.LOCATION_TYPE);
  if (lt?.options.some((o) => o.name === "Port"))
    commonCodeRepository.update(lt.id, (p) => ({
      ...p,
      options: p.options.map((o) => (o.name === "Port" ? { ...o, name: "Seaport" } : o)),
    }));
  for (const l of locationRepository.all())
    if (l.locationType === "Port")
      locationRepository.update(l.id, (p) => ({ ...p, locationType: "Seaport" }));
}
// Location Type "Depot" (ICD) was added: stored option list gets it after Seaport; ICDs (old sub
// type ICD, or an untouched seed named ICD) become Depots.
{
  const lt = commonCodeRepository.get(CC.LOCATION_TYPE);
  if (lt && !lt.options.some((o) => o.name === "Depot")) {
    const n = Math.max(0, ...lt.options.map((o) => Number(o.code.slice(lt.code.length)) || 0)) + 1;
    const depot = {
      code: `${lt.code}${String(n).padStart(2, "0")}`,
      name: "Depot",
      attribute: "DEFAULT",
      remark: "",
      active: true,
    };
    const at = lt.options.findIndex((o) => o.name === "Seaport") + 1;
    commonCodeRepository.update(lt.id, (p) => ({
      ...p,
      options: [...p.options.slice(0, at), depot, ...p.options.slice(at)],
    }));
  }
  const seedAt = "2026-09-01T02:00:00.000Z";
  for (const l of locationRepository.all())
    if (
      (l.locationType === "Seaport" || l.locationType === "Port") &&
      (l.locationSubType === "ICD" || (l.updatedAt === seedAt && /\bICD\b/i.test(l.name)))
    )
      locationRepository.update(l.id, (p) => {
        const next = { ...p, locationType: "Depot" };
        delete next.locationSubType;
        return next;
      });
}
export const importHistoryRepository = createCollection<ImportBatch>(
  "import-history",
  seedImportHistory,
);

const auditCollection = createCollection<AuditEvent>("audit", seedAudit);
/** Append-only: no update/delete is exposed on purpose. */
export const auditRepository = {
  all: auditCollection.all,
  append: (e: AuditEvent) => auditCollection.insert(e),
  appendMany: (es: AuditEvent[]) => auditCollection.insertMany(es),
  subscribe: auditCollection.subscribe,
};

const TPL_KEY = "template-config.v2";
let tplCache: TenantTemplateConfig | null = null;
export const templateConfigRepository = {
  get(): TenantTemplateConfig {
    if (tplCache) return tplCache;
    const stored = readJson<TenantTemplateConfig | null>(TPL_KEY, null);
    const cfg = stored ?? seedTemplateConfig();
    tplCache = cfg;
    if (!stored) writeJson(TPL_KEY, cfg);
    return cfg;
  },
  save(cfg: TenantTemplateConfig) {
    tplCache = cfg;
    writeJson(TPL_KEY, cfg);
  },
  subscribe: (cb: () => void) => subscribeKey(TPL_KEY, cb),
};

export { resetAllStorage, uid } from "./storage";
