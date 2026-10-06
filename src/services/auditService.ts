import type { AuditAction, AuditEvent, EntityType } from "@/types";
import { auditRepository, uid } from "@/repositories";
import { currentUser } from "./session";

export interface AuditInput {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
}

const strip = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Created",
  VIEW: "Viewed",
  UPDATE: "Updated",
  DELETE: "Deleted",
  DEACTIVATE: "Deactivated",
  ACTIVATE: "Activated",
  IMPORT: "Imported",
  EXPORT: "Exported",
  ROLLBACK: "Rolled back import",
  CALCULATE_ROUTE: "Recalculated Route",
  CHANGE_VEHICLE: "Changed Vehicle",
  CHANGE_WAYPOINT: "Changed Waypoint",
  CHANGE_ROUTE_TYPE: "Changed Route Type",
  ADD_MANUAL_COST: "Added Manual Cost",
  REMOVE_MANUAL_COST: "Removed Manual Cost",
  CHANGE_TEMPLATE: "Changed Template",
  CHANGE_VISIBLE: "Changed Visible",
  CHANGE_REQUIRED: "Changed Required",
  CHANGE_AMOUNT: "Changed Amount",
  CREATE_VERSION: "Created Version",
  CHANGE_EFFECTIVE_DATE: "Changed Effective Date",
};

const recentViews = new Map<string, number>();

export const auditService = {
  log(input: AuditInput) {
    this.logMany([input]);
  },
  logMany(inputs: AuditInput[]) {
    if (inputs.length === 0) return;
    const ts = new Date().toISOString();
    auditRepository.appendMany(
      inputs.map(
        (i) => strip({ id: uid("a-"), timestamp: ts, user: currentUser.name, ...i }) as AuditEvent,
      ),
    );
  },
  /** VIEW is logged at most once per entity every 5 minutes to keep the trail readable. */
  logView(entityType: EntityType, entityId: string, entityLabel: string) {
    const k = `${entityType}:${entityId}`;
    const last = recentViews.get(k) ?? 0;
    if (Date.now() - last < 5 * 60_000) return;
    recentViews.set(k, Date.now());
    this.log({ action: "VIEW", entityType, entityId, entityLabel });
  },
  list: () => auditRepository.all(),
  forEntity: (entityType: EntityType, entityId: string) =>
    auditRepository.all().filter((e) => e.entityType === entityType && e.entityId === entityId),
  subscribe: auditRepository.subscribe,
};
