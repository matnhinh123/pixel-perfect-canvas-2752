import type { BaseRecord } from "./common";

/** Cost Group master. Parent is another Cost Group (optional); its code is resolved internally. */
export interface CostGroupRecord extends BaseRecord {
  code: string;
  name: string;
  parentId: string | null;
  remark: string;
}

/** Cost master item (master data only — no amounts or calculation). */
export interface CostItemRecord extends BaseRecord {
  code: string;
  name: string;
  localName: string;
  groupId: string;
  /** Free text: one of the sub groups already used, or a new one. */
  subGroup: string;
  /** Service master ids this cost applies to (any level of the service tree). */
  serviceIds: string[];
  taxEvidence: string;
  /** Default currency. */
  currency: string;
  /** e.g. "8%"; empty when not set. */
  taxTariff: string;
  remark: string;
}
