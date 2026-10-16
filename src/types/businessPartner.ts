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
  docName: string;
  /** YYYY-MM-DD */
  validDate: string;
  expiryDate: string;
  /** Name of the file picked from the computer (the demo keeps the name only). */
  fileName: string;
  remark: string;
}

export type WoAccessPolicy = "" | "Temporary Allow" | "Approval Required";
export type CreditStatus = "Active" | "Inactive";

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
  remark: string;
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
  remark: string;
}

/** Sales Assignment of one role: staff from the staff master; the service is optional. */
export interface BpSalesman extends Row {
  staffId: string;
  staffName: string;
  /** Read-only: the staff's direct leader, filled when the staff is picked. */
  leader: string;
  department: string;
  serviceCode: string;
  serviceName: string;
  remark: string;
}

/** Contact person of one role (Customer or Vendor); the service is optional. */
export interface BpContact extends Row {
  serviceCode: string;
  serviceName: string;
  gender: string;
  fullName: string;
  identityNo: string;
  telephone: string;
  mobilePhone: string;
  contactRole: string;
  email: string;
  address: string;
  /** One primary contact per role. */
  primaryContact: boolean;
  status: "Active" | "Inactive";
  remark: string;
}

export interface BpBankAccount extends Row {
  bankCode: string;
  bankName: string;
  bankBranch: string;
  bankAddress: string;
  bankCountry: string;
  accountNo: string;
  accountHolder: string;
  currency: string;
  remark: string;
}

/**
 * Role-specific tab content. Customer tab → AR (131), Vendor tab → AP (331).
 * Each role keeps its own bank accounts; Customer and Vendor never share one.
 */
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
  /** User-entered, unique, uppercase search keyword (was "Short Name"). */
  bpCode: string;
  legalType: BpLegalType | "";
  inHouse: boolean;
  /** Tax Code (MST): required for a Company. Unique per tenant among non-deleted partners. */
  taxCode: string;
  /** Identity Number (CCCD): required for an Individual. Unique per tenant among non-deleted partners. */
  identityNo: string;
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
  documents: BpDocument[];
  customer: BpCustomerProfile;
  vendor: BpVendorProfile;
}
