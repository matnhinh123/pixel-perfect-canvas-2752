// Shared, entity-agnostic types used by the GENERAL capability layer
// (CRUD, audit, import/export, column preference, search/filter).

export type Status = "Active" | "Draft" | "Inactive";

export type EntityType =
  "Route" | "Service" | "Cost" | "Cost Group" | "Location" | "Vehicle" | "Toll Station" | "Business Partner";

/** Every persisted record carries these fields so the generic repository can soft-delete & audit. */
export interface BaseRecord {
  id: string;
  status: Status;
  deleted?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type AuditAction =
  | "CREATE"
  | "VIEW"
  | "UPDATE"
  | "DELETE"
  | "DEACTIVATE"
  | "ACTIVATE"
  | "IMPORT"
  | "EXPORT"
  | "ROLLBACK"
  // Routing
  | "CALCULATE_ROUTE"
  | "CHANGE_VEHICLE"
  | "CHANGE_WAYPOINT"
  | "CHANGE_ROUTE_TYPE"
  | "ADD_WAYPOINT"
  | "CHANGE_DEPARTURE_TIME"
  | "CHANGE_DISTANCE"
  | "SELECT_ALTERNATIVE"
  | "UPDATE_STATUS"
  | "ADD_MANUAL_COST"
  | "REMOVE_MANUAL_COST"
  // Service
  | "CHANGE_TEMPLATE"
  | "CHANGE_VISIBLE"
  | "CHANGE_REQUIRED"
  // Cost
  | "CHANGE_AMOUNT"
  | "CREATE_VERSION"
  | "CHANGE_EFFECTIVE_DATE";

/** Append-only audit record. There is intentionally no update/delete API for these. */
export interface AuditEvent {
  id: string;
  timestamp: string; // ISO
  user: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
}

export type ImportStatus = "Success" | "Partial Success" | "Failed" | "Rolled Back";

export interface ImportBatch {
  id: string;
  fileName: string;
  entityType: EntityType;
  importedBy: string;
  importedAt: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  status: ImportStatus;
  /** Ids created by this batch — enables rollback. Empty for seeded history. */
  createdIds: string[];
  rollbackable: boolean;
}

// ---------- Column preference ----------
export interface ColumnPreference {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

// ---------- Filtering ----------
export type FieldType = "text" | "number" | "date" | "enum";
export type FilterOperator = "eq" | "neq" | "contains" | "between";

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}
