import type { BaseRecord } from "./common";

export type BpRole = "Customer" | "Vendor";
export const BP_ROLES: readonly BpRole[] = ["Customer", "Vendor"];

export type BpLegalType = "Individual" | "Company" | "Representative";

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

/** License adjustment history: when the business license changed and what changed. */
export interface BpLicenseAdjustment extends Row {
  /** YYYY-MM-DD */
  adjustmentDate: string;
  changeContent: string;
  documentNo: string;
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

/** Sales Assignment (profile level): staff from the staff master; the service is optional. */
export interface BpSalesman extends Row {
  staffId: string;
  staffName: string;
  department: string;
  serviceCode: string;
  serviceName: string;
  remark: string;
}

/** Contact person of the partner (profile level). */
export interface BpContact extends Row {
  fullName: string;
  position: string;
  phone: string;
  email: string;
  primaryContact: boolean;
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

/**
 * Role-specific tab content. Customer tab → AR (131), Vendor tab → AP (331).
 * Each role keeps its own bank accounts; Customer and Vendor never share one.
 */
export interface BpRoleProfile {
  banks: BpBankAccount[];
}
export interface BpCustomerProfile extends BpRoleProfile {
  creditTerms: BpCreditTerm[];
}
export interface BpVendorProfile extends BpRoleProfile {
  paymentTerms: BpPaymentTerm[];
}

export interface BusinessPartnerRecord extends BaseRecord {
  /** User-entered, unique, uppercase search keyword (was "Short Name"). */
  bpCode: string;
  legalType: BpLegalType | "";
  inHouse: boolean;
  /** Tax code (MST): unique per tenant among non-deleted partners. */
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
  /** Tax treatment, e.g. VAT 10%. */
  tax: string;
  invoiceLanguage: string;
  /** Default currency; always one of `currencies`. */
  currency: string;
  /** Currencies the partner trades in (international partners may use several). */
  currencies: string[];
  /** Multi-select. */
  businessCategory: string[];
  partnerScope: string;
  partnerGroup: string;
  serviceProviderType: string;
  /** Default payment term (profile level). */
  defaultPaymentTerm: string;
  /** Customer role only. */
  creditLimit: string;
  creditLimitCurrency: string;
  note: string;
  roles: BpRole[];
  contacts: BpContact[];
  salesAssignments: BpSalesman[];
  licenseAdjustments: BpLicenseAdjustment[];
  documents: BpDocument[];
  customer: BpCustomerProfile;
  vendor: BpVendorProfile;
}
