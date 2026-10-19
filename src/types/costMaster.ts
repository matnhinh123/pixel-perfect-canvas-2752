import type { BaseRecord } from "./common";

/** Cost Group master: a flat list (no parent / child groups). */
export interface CostGroupRecord extends BaseRecord {
  code: string;
  name: string;
  remark: string;
}

/** Cost master item (master data only — no amounts or calculation). */
export interface CostItemRecord extends BaseRecord {
  code: string;
  name: string;
  localName: string;
  groupId: string;
  /** Service master ids this cost applies to (any level of the service tree). */
  serviceIds: string[];
  taxEvidence: string;
  /** Default currency. */
  currency: string;
  /** e.g. "8%"; empty when not set. */
  taxTariff: string;
  /** Category UoM (Quantity, Weight…) and the default UoM inside it. */
  uomCategory: string;
  uom: string;
  remark: string;
}
