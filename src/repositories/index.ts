// One repository per entity, all built on the same generic Collection. Swap storage.ts for an API
// client later; services and UI keep working against the same surface.
import type {
  AuditEvent,
  BusinessPartnerRecord,
  CostGroupRecord,
  CostItemRecord,
  CostRecord,
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
import { seedTollStations, type TollGateRecord } from "@/mock-data/tollCatalog";
import { seedVehicleMasters } from "@/mock-data/vehicleMaster";
import { seedBusinessPartners } from "@/mock-data/businessPartners";
import { seedLocations, type LocationMasterRecord } from "@/mock-data/locations";
import { createCollection, readJson, subscribeKey, writeJson } from "./storage";

export const routeRepository = createCollection<RouteRecord>("routes", seedRoutes);
// ".v2": the service tree / form fields were reworked — load the new demo seed without touching routes.
export const serviceRepository = createCollection<ServiceRecord>("services.v3", seedServices);
export const serviceAssignmentRepository = createCollection<ServiceAssignment>(
  "service-assignments.v2",
  seedServiceAssignments,
);
export const costRepository = createCollection<CostRecord>("costs", () => seedCosts(seedRoutes()));
// Master Data > Cost: cost groups and cost items (master data only).
export const costGroupRepository = createCollection<CostGroupRecord>("cost-groups", seedCostGroups);
export const costItemRepository = createCollection<CostItemRecord>("cost-items.v3", seedCostItems);
/** Location master; Routing stop pickers read active locations from it. */
export const locationRepository = createCollection<LocationMasterRecord>(
  "locations",
  seedLocations,
);
/** Toll Station master; Routing matches gates on the route against it. */
export const tollStationRepository = createCollection<TollGateRecord>(
  // ".v2": Vietmap ID / Source / Location / Remark were added to the toll station model.
  "toll-stations.v2",
  seedTollStations,
);
/** Vehicle master (one row per physical vehicle). */
export const vehicleMasterRepository = createCollection<VehicleMasterRecord>(
  // ".v3": TRUCK / HEAD / TRAILER, Truck / Trailer Type and Container Size Mapping — load the new demo seed.
  "vehicle-masters.v3",
  seedVehicleMasters,
);
/** Business Partner master (customers and vendors — one partner, several roles). */
export const businessPartnerRepository = createCollection<BusinessPartnerRecord>(
  "business-partners",
  seedBusinessPartners,
);
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
