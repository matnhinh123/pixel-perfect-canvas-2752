// GEN-01 Global CRUD. Every entity gets the same status/delete behaviour:
// delete is a SOFT delete, guarded by a reference check; deactivate is always available.
import type { BaseRecord, EntityType, Status } from "@/types";
import type { Collection } from "@/repositories/storage";
import { auditService } from "./auditService";
import { currentUser } from "./session";

export class BusinessRuleError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export interface DeleteCheck {
  canDelete: boolean;
  /** Human readable reason when blocked, e.g. "referenced by 3 Cost records". */
  reason?: string;
  canDeactivate: boolean;
}

export interface EntityCrud<T extends BaseRecord> {
  entityType: EntityType;
  labelOf(row: T): string;
  list(): T[];
  get(id: string): T | undefined;
  checkDelete(id: string): DeleteCheck;
  setStatus(ids: string[], status: Extract<Status, "Active" | "Inactive">): number;
  softDelete(id: string): void;
  restoreMany(ids: string[]): void;
  removeMany(ids: string[]): void;
}

export const stampUpdate = <T extends BaseRecord>(r: T): T => ({
  ...r,
  updatedAt: new Date().toISOString(),
  updatedBy: currentUser.name,
});
export const stampCreate = () => {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    createdBy: currentUser.name,
    updatedAt: now,
    updatedBy: currentUser.name,
  };
};

export function makeCrud<T extends BaseRecord>(opts: {
  entityType: EntityType;
  repo: Collection<T>;
  labelOf: (row: T) => string;
  /** Return a reason string when other records depend on this one. */
  references: (row: T) => string | null;
}): EntityCrud<T> {
  const { entityType, repo, labelOf } = opts;
  const crud: EntityCrud<T> = {
    entityType,
    labelOf,
    list: () => repo.all().filter((r) => !r.deleted),
    get: (id) => {
      const r = repo.get(id);
      return r && !r.deleted ? r : undefined;
    },
    checkDelete(id) {
      const row = repo.get(id);
      if (!row) return { canDelete: false, reason: "Record not found.", canDeactivate: false };
      const ref = opts.references(row);
      return ref
        ? {
            canDelete: false,
            reason: `${entityType} ${labelOf(row)} ${ref} and cannot be deleted. You can deactivate it instead.`,
            canDeactivate: row.status !== "Inactive",
          }
        : { canDelete: true, canDeactivate: row.status !== "Inactive" };
    },
    setStatus(ids, status) {
      let changed = 0;
      for (const id of ids) {
        const row = repo.get(id);
        if (!row || row.deleted || row.status === status) continue;
        repo.update(id, (r) => stampUpdate({ ...r, status }));
        auditService.log({
          action: status === "Active" ? "ACTIVATE" : "DEACTIVATE",
          entityType,
          entityId: id,
          entityLabel: labelOf(row),
          field: "Status",
          oldValue: row.status,
          newValue: status,
        });
        changed++;
      }
      return changed;
    },
    softDelete(id) {
      const check = crud.checkDelete(id);
      if (!check.canDelete) throw new BusinessRuleError(check.reason ?? "Cannot delete.");
      const row = repo.get(id)!;
      repo.update(id, (r) => stampUpdate({ ...r, deleted: true }));
      auditService.log({
        action: "DELETE",
        entityType,
        entityId: id,
        entityLabel: labelOf(row),
        note: "Soft delete",
      });
    },
    restoreMany(ids) {
      ids.forEach((id) => repo.get(id) && repo.update(id, (r) => ({ ...r, deleted: false })));
    },
    removeMany(ids) {
      ids.forEach(
        (id) => repo.get(id) && repo.update(id, (r) => stampUpdate({ ...r, deleted: true })),
      );
    },
  };
  return crud;
}
