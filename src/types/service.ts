import type { BaseRecord } from "./common";

/** The three system forms (Trucking Form / Customs Form / Freight Form). Tenants cannot add a fourth. */
export type TemplateType = "Trucking" | "Customs" | "Freight";
export const TEMPLATES: TemplateType[] = ["Trucking", "Customs", "Freight"];

/** Fixed field definition owned by the system form (structure cannot be changed by tenants). */
export interface TemplateFieldDef {
  key: string;
  label: string;
  /** English UI label (label is Vietnamese). */
  labelEn: string;
  /** Core fields exist in every tenant and cannot be removed. */
  core: true;
  /** Locked fields are always visible AND required — the tenant cannot turn them off. */
  coreMandatory: boolean;
  defaultVisible: boolean;
  defaultRequired: boolean;
}

/** Tenant-level override for a form field. */
export interface TenantFieldSetting {
  visible: boolean;
  required: boolean;
}

export type TenantTemplateConfig = Record<TemplateType, Record<string, TenantFieldSetting>>;

export interface ServiceRecord extends BaseRecord {
  code: string;
  name: string;
  /** null = root service; the root is the service group ("Nhóm dịch vụ") of all its descendants. */
  parentId: string | null;
  /** Only stored on root services. Children always inherit the form of their root. */
  template: TemplateType | null;
  /** Shown as "Ghi chú". */
  description: string;
}

/** "Phân công": who handles a service. No employee = the whole department ("Cả phòng"). */
export interface ServiceAssignment extends BaseRecord {
  serviceId: string;
  departmentId: string;
  employeeId: string | null;
  /** Must be the form of the service (or null). */
  form: TemplateType | null;
  note: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  departmentId: string;
  /** Employee id of the direct leader (none for department heads). */
  leaderId?: string;
}
