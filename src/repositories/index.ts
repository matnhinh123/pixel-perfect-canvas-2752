// One repository per entity, all built on the same generic Collection. Swap storage.ts for an API
// client later; services and UI keep working against the same surface.
import type {
  AuditEvent,
  CostRecord,
  ImportBatch,
  RouteRecord,
  ServiceRecord,
  TenantTemplateConfig,
} from "@/types";
import {
  seedAudit,
  seedCosts,
  seedImportHistory,
  seedRoutes,
  seedServices,
  seedTemplateConfig,
} from "@/mock-data/seed";
import { createCollection, readJson, subscribeKey, writeJson } from "./storage";

export const routeRepository = createCollection<RouteRecord>("routes", seedRoutes);
export const serviceRepository = createCollection<ServiceRecord>("services", seedServices);
export const costRepository = createCollection<CostRecord>("costs", () => seedCosts(seedRoutes()));
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

const TPL_KEY = "template-config";
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
