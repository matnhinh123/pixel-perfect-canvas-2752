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
  /** Service master id (e.g. Trucking). */
  serviceId: string | null;
  taxEvidence: string;
  currency: string;
  /** e.g. "8%"; empty when not set. */
  taxTariff: string;
  uom: string;
  remark: string;
}
