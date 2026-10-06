import type { BaseRecord } from "./common";

/** The three system templates. Tenants cannot add a fourth one. */
export type TemplateType = "Trucking" | "Customs" | "Freight";
export const TEMPLATES: TemplateType[] = ["Trucking", "Customs", "Freight"];

/** Fixed field definition owned by the system template (structure cannot be changed by tenants). */
export interface TemplateFieldDef {
  key: string;
  label: string;
  /** Core fields exist in every tenant and cannot be removed. */
  core: true;
  /** Core mandatory fields are always visible AND required — the tenant cannot disable them. */
  coreMandatory: boolean;
  defaultVisible: boolean;
  defaultRequired: boolean;
}

/** Tenant-level override for a template field. */
export interface TenantFieldSetting {
  visible: boolean;
  required: boolean;
}

export type TenantTemplateConfig = Record<TemplateType, Record<string, TenantFieldSetting>>;

export interface ServiceRecord extends BaseRecord {
  code: string;
  name: string;
  /** null = root (level 1) service group. */
  parentId: string | null;
  /** Only stored on root services. Children always inherit from their level-1 ancestor. */
  template: TemplateType | null;
  description: string;
}
