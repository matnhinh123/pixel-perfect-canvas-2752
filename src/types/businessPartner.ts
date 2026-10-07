import type { BaseRecord } from "./common";

export type BpRole = "Customer" | "Vendor" | "Employee";
export const BP_ROLES: readonly BpRole[] = ["Customer", "Vendor", "Employee"];

/** Free-form row id so React keys stay stable while a table is being edited. */
interface Row {
  rid: string;
}

export interface BpDocument extends Row {
  docType: string;
  docNo: string;
  issueDate: string;
  expiryDate: string;
  fileName: string;
  remark: string;
}

export type WoAccessPolicy = "" | "Temporary Allow" | "Approval Required";
export type CreditStatus = "Active" | "Scheduled" | "Inactive";

/** Customer tab: credit policy per service (AR account 131). */
export interface BpCreditTerm extends Row {
  serviceCode: string;
  serviceName: string;
  creditTerm: string;
  creditDays: string;
  creditLimit: string;
  currency: string;
  /** datetime-local, "YYYY-MM-DDTHH:mm" */
  woAccessFrom: string;
  woAccessTo: string;
  woAccessPolicy: WoAccessPolicy;
  autoLockAfterExpiry: boolean;
  approvedBy: string;
  status: CreditStatus;
}

/** Vendor tab: payment terms per service (AP account 331). */
export interface BpPaymentTerm extends Row {
  serviceCode: string;
  serviceName: string;
  paymentTerm: string;
  currency: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  effectiveTo: string;
  status: "Active" | "Inactive";
}

export interface BpSalesman extends Row {
  serviceCode: string;
  serviceName: string;
  salesCode: string;
  salesName: string;
  remark: string;
  branch: string;
  department: string;
}

export interface BpContact extends Row {
  serviceCode: string;
  serviceName: string;
  gender: string;
  fullName: string;
  identityNo: string;
  telephone: string;
  mobile: string;
  contactRole: string;
  email: string;
  address: string;
  primaryContact: boolean;
  status: "Active" | "Inactive";
}

export interface BpBankAccount extends Row {
  bankCode: string;
  bankName: string;
  swiftCode: string;
  bankBranch: string;
  bankAddress: string;
  bankCountry: string;
  accountNo: string;
  accountHolder: string;
  currency: string;
}

/** Role-specific tab content. Customer tab → AR (131), Vendor tab → AP (331). */
export interface BpRoleProfile {
  contacts: BpContact[];
  banks: BpBankAccount[];
  salesmen: BpSalesman[];
}
export interface BpCustomerProfile extends BpRoleProfile {
  creditTerms: BpCreditTerm[];
}
export interface BpVendorProfile extends BpRoleProfile {
  paymentTerms: BpPaymentTerm[];
}

export interface BusinessPartnerRecord extends BaseRecord {
  /** System-generated, immutable once issued ("BP Identity Number"). */
  bpNumber: string;
  /** User-entered, unique, uppercase search keyword (was "Short Name"). */
  bpCode: string;
  legalType: string;
  inHouse: boolean;
  taxCode: string;
  form: string;
  invoiceSerial: string;
  localName: string;
  englishName: string;
  localAddress: string;
  englishAddress: string;
  country: string;
  province: string;
  postcode: string;
  fax: string;
  email: string;
  phone: string;
  invoiceLanguage: string;
  currency: string;
  businessCategory: string;
  partnerScope: string;
  serviceProviderType: string;
  roles: BpRole[];
  documents: BpDocument[];
  customer: BpCustomerProfile;
  vendor: BpVendorProfile;
}
