// Business Partner master: validation, save + role rules. BP Code is the identifier.
import { businessPartnerRepository, uid } from "@/repositories";
import type {
  BpBankAccount,
  BpContact,
  BpCreditTerm,
  BpDocument,
  BpLegalType,
  BpPaymentTerm,
  BpRole,
  BpSalesman,
  BusinessPartnerRecord,
} from "@/types";
import { BP_ROLES } from "@/types";
import { EMPLOYEES, departmentName, leaderNameOf } from "@/mock-data/staff";
import {
  BUSINESS_CATEGORIES,
  COUNTRIES,
  CURRENCIES,
  LEGAL_TYPES,
  PARTNER_SCOPES,
  TAX_REGISTRY,
  TENANT_DEFAULT_CURRENCY,
} from "@/mock-data/businessPartners";
import { tr } from "@/lib/i18n";
import { CC } from "@/mock-data/commonCodes";
import { codeOptions } from "./commonCodeService";
import { splitList } from "@/lib/utils";
import { auditService } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { draftImportConfig, listCell, pick } from "./importExportService";

export const bpCrud = makeCrud<BusinessPartnerRecord>({
  entityType: "Business Partner",
  repo: businessPartnerRepository,
  labelOf: (b) => b.bpCode,
  // Transactions (WO / invoices) will register here once they exist; for now nothing references a BP.
  references: () => null,
});

// ---------------------------------------------------------------- BP Code convention

/** A–Z, 0–9, dot, hyphen, underscore. Max 50, always uppercase. */
export const BP_CODE_MAX = 12;
const BP_CODE_VALID = /^[A-Z0-9._-]{1,12}$/;
/** Input filter: uppercases and drops every disallowed character as the user types / pastes. */
export const sanitizeBpCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, BP_CODE_MAX);

/** Tax code comparison key: case- and whitespace-insensitive. */
/** English Address pre-fill: the Local Address written without Vietnamese accents (no translation). */
export function toEnglishAddress(local: string): string {
  return local
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export const taxCodeKey = (v: string) => v.replace(/\s+/g, "").toUpperCase();

/** Both fields are always shown; the Legal Type only decides which one is required. */
export const taxCodeRequired = (legalType: string) => legalType === "Company";
export const identityNoRequired = (legalType: string) => legalType === "Individual";
const MST = /^\d{10}(-?\d{3})?$/;
const CCCD = /^\d{12}$/;

/** "Get Info" for a Company (demo: looks the MST up in a mock tax registry instead of the tax API). */
export function lookupTaxPayer(taxCode: string) {
  const key = taxCodeKey(taxCode);
  if (!MST.test(key))
    return {
      error: tr(
        "Mã số thuế gồm 10 số, hoặc 10 + 3 số với chi nhánh.",
        "Tax Code should be 10 digits, or 10 + 3 digits for a branch.",
      ),
    } as const;
  const hit = TAX_REGISTRY[key.replace("-", "")];
  return hit
    ? ({ info: hit } as const)
    : ({
        error: tr(
          `Không tìm thấy thông tin cho MST ${key}.`,
          `No company found for Tax Code ${key}.`,
        ),
      } as const);
}

// ---------------------------------------------------------------- WO access rule (Credit Term)

export type WoAccessState = "Locked" | "Allowed" | "Expired" | "Default";

/**
 * Customer credit table: before "WO Access From" creating WO is locked; inside the window it is
 * allowed; after "WO Access To" it is locked again (auto). Without a window the default credit policy
 * applies.
 */
export function woAccessState(
  row: Pick<BpCreditTerm, "woAccessFrom" | "woAccessTo">,
  now = new Date(),
): WoAccessState {
  const from = row.woAccessFrom ? new Date(row.woAccessFrom) : null;
  const to = row.woAccessTo ? new Date(row.woAccessTo) : null;
  if (!from && !to) return "Default";
  if (from && now < from) return "Locked";
  if (to && now > to) return "Expired";
  return "Allowed";
}

// ---------------------------------------------------------------- Drafts

export const newRowId = () => uid("r-");

export const blankCredit = (): BpCreditTerm => ({
  rid: newRowId(),
  serviceCode: "",
  serviceName: "",
  creditTerm: "",
  creditDays: "",
  creditLimit: "",
  currency: "VND",
  woAccessFrom: "",
  woAccessTo: "",
  woAccessPolicy: "",
  autoLockAfterExpiry: true,
  approvedBy: "",
  status: "Active",
  remark: "",
});
export const blankPayment = (): BpPaymentTerm => ({
  rid: newRowId(),
  serviceCode: "",
  serviceName: "",
  paymentTerm: "",
  currency: "VND",
  effectiveFrom: "",
  effectiveTo: "",
  status: "Active",
  remark: "",
});
export const blankSalesman = (): BpSalesman => ({
  rid: newRowId(),
  staffId: "",
  staffName: "",
  leader: "",
  department: "",
  serviceCode: "",
  serviceName: "",
  remark: "",
});
export const blankContact = (): BpContact => ({
  rid: newRowId(),
  serviceCode: "",
  serviceName: "",
  gender: "",
  fullName: "",
  identityNo: "",
  telephone: "",
  mobilePhone: "",
  contactRole: "",
  email: "",
  address: "",
  primaryContact: false,
  status: "Active",
  remark: "",
});
export const blankBank = (): BpBankAccount => ({
  rid: newRowId(),
  bankCode: "",
  bankName: "",
  bankBranch: "",
  bankAddress: "",
  bankCountry: "",
  accountNo: "",
  accountHolder: "",
  currency: "",
  remark: "",
});
export const blankDocument = (): BpDocument => ({
  rid: newRowId(),
  docType: "",
  docName: "",
  validDate: "",
  expiryDate: "",
  fileName: "",
  remark: "",
});

export type BusinessPartnerDraft = Omit<
  BusinessPartnerRecord,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "deleted"
> & { id?: string };

export const newBusinessPartnerDraft = (): BusinessPartnerDraft => ({
  status: "Active",
  bpCode: "",
  legalType: "",
  inHouse: false,
  taxCode: "",
  identityNo: "",
  form: "",
  invoiceSerial: "",
  localName: "",
  englishName: "",
  localAddress: "",
  englishAddress: "",
  country: "",
  province: "",
  postcode: "",
  fax: "",
  email: "",
  phone: "",
  tax: "",
  invoiceLanguage: "",
  // Currency follows the Country (Vietnam → VND); empty until one is chosen.
  currency: "",
  currencies: [],
  businessCategory: [],
  partnerScope: "",
  partnerGroup: "",
  serviceProviderType: "",
  defaultPaymentTerm: "",
  creditLimit: "",
  creditLimitCurrency: "",
  note: "",
  roles: [],
  documents: [],
  customer: {
    creditTerms: [blankCredit()],
    contacts: [blankContact()],
    banks: [blankBank()],
    salesmen: [blankSalesman()],
  },
  vendor: {
    paymentTerms: [blankPayment()],
    contacts: [blankContact()],
    banks: [blankBank()],
    salesmen: [blankSalesman()],
  },
});

// ---------------------------------------------------------------- Normalize stored data

type Loose = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v: unknown): Loose[] => (Array.isArray(v) ? (v as Loose[]) : []);
const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(str).filter(Boolean)
    : typeof v === "string" && v.trim()
      ? [v.trim()]
      : [];
const uniq = <T>(xs: T[]) => [...new Set(xs)];

const normLegalType = (v: unknown): BpLegalType | "" => {
  const s = str(v);
  if (s === "Government") return "Company";
  return (LEGAL_TYPES as readonly string[]).includes(s) ? (s as BpLegalType) : "";
};

/** Contact saved by any earlier version → current Contact Info row. */
const oldContact = (c: Loose): BpContact => ({
  rid: str(c["rid"]) || newRowId(),
  serviceCode: str(c["serviceCode"]),
  serviceName: str(c["serviceName"]),
  gender: str(c["gender"]),
  fullName: str(c["fullName"]),
  identityNo: str(c["identityNo"]),
  telephone: str(c["telephone"]),
  mobilePhone: str(c["mobilePhone"]) || str(c["mobile"]) || str(c["phone"]),
  contactRole: str(c["contactRole"]) || str(c["position"]),
  email: str(c["email"]),
  address: str(c["address"]),
  primaryContact: c["primaryContact"] === true,
  status: c["status"] === "Inactive" ? "Inactive" : "Active",
  remark: str(c["remark"]),
});
/** Salesman saved by any earlier version (incl. the old hard-coded list) → current row. */
const oldSalesman = (s: Loose): BpSalesman => {
  const name = str(s["staffName"]) || str(s["salesName"]);
  const e = EMPLOYEES.find((x) => x.id === str(s["staffId"]) || x.name === name);
  return {
    rid: str(s["rid"]) || newRowId(),
    staffId: e?.id ?? str(s["staffId"]),
    staffName: e?.name ?? name,
    leader: e ? leaderNameOf(e.id) : str(s["leader"]),
    department: str(s["department"]) || (e ? departmentName(e.departmentId) : ""),
    serviceCode: str(s["serviceCode"]),
    serviceName: str(s["serviceName"]),
    remark: str(s["remark"]),
  };
};

/**
 * Brings a record saved by an earlier version of the app to the current shape: Legal Type
 * "Government" → "Company", single Business Category → list, shared contacts / salesmen moved into
 * each role, new profile fields defaulted. Records already in the current shape pass unchanged.
 */
export function normalizeBusinessPartner(raw: BusinessPartnerRecord): BusinessPartnerRecord {
  const r = raw as unknown as Loose;
  const cust = (r["customer"] ?? {}) as Loose;
  const vend = (r["vendor"] ?? {}) as Loose;
  const currency = str(r["currency"]);

  const roles = (Array.isArray(raw.roles) ? raw.roles : []).filter(
    (x): x is BpRole => x === "Customer" || x === "Vendor",
  );
  // Contacts / salesmen live in each role tab. The previous version kept one shared list on the
  // profile: it is copied to every role the partner has (Customer if none).
  const shared = (key: string) => (Array.isArray(r[key]) ? arr(r[key]) : null);
  const sharedContacts = shared("contacts");
  const sharedSales = shared("salesAssignments");
  const forRole = (role: BpRole) =>
    roles.includes(role) || (role === "Customer" && roles.length === 0);
  const perRole = (p: Loose, role: BpRole) => ({
    contacts: (Array.isArray(p["contacts"])
      ? arr(p["contacts"])
      : forRole(role)
        ? (sharedContacts ?? [])
        : []
    ).map(oldContact),
    salesmen: (Array.isArray(p["salesmen"])
      ? arr(p["salesmen"])
      : forRole(role)
        ? (sharedSales ?? [])
        : []
    ).map(oldSalesman),
  });
  const currencies = uniq([...strList(r["currencies"]), ...(currency ? [currency] : [])]);

  const { contacts: _contacts, salesAssignments: _sales, licenseAdjustments: _lic, ...rest } = r;
  return {
    ...(rest as unknown as BusinessPartnerRecord),
    legalType: normLegalType(r["legalType"]),
    businessCategory: strList(r["businessCategory"]),
    currencies,
    tax: str(r["tax"]),
    // Older records kept an Individual's CCCD in the Tax Code field: move it to Identity Number.
    ...(() => {
      const id = str(r["identityNo"]);
      const tax = str(r["taxCode"]);
      return !id && normLegalType(r["legalType"]) === "Individual" && CCCD.test(taxCodeKey(tax))
        ? { identityNo: tax, taxCode: "" }
        : { identityNo: id, taxCode: tax };
    })(),
    partnerGroup: str(r["partnerGroup"]),
    defaultPaymentTerm: str(r["defaultPaymentTerm"]),
    creditLimit: str(r["creditLimit"]),
    creditLimitCurrency: str(r["creditLimitCurrency"]) || currency,
    note: str(r["note"]),
    roles,
    // Older versions: "Document No." / "Issue Date" became "Document Name" / "Valid Date".
    documents: arr(r["documents"]).map((x): BpDocument => ({
      rid: str(x["rid"]) || newRowId(),
      docType: str(x["docType"]),
      docName: str(x["docName"]) || str(x["docNo"]),
      validDate: str(x["validDate"]) || str(x["issueDate"]),
      expiryDate: str(x["expiryDate"]),
      fileName: str(x["fileName"]),
      remark: str(x["remark"]),
    })),
    customer: {
      creditTerms: arr(cust["creditTerms"]) as unknown as BpCreditTerm[],
      banks: arr(cust["banks"]) as unknown as BpBankAccount[],
      ...perRole(cust, "Customer"),
    },
    vendor: {
      paymentTerms: arr(vend["paymentTerms"]) as unknown as BpPaymentTerm[],
      banks: arr(vend["banks"]) as unknown as BpBankAccount[],
      ...perRole(vend, "Vendor"),
    },
  };
}

/** Draft for editing an existing record: an empty table gets one blank row ready for input. */
export const draftOf = (r: BusinessPartnerRecord): BusinessPartnerDraft => {
  const d = structuredClone(normalizeBusinessPartner(r)) as BusinessPartnerDraft;
  const fill = <T>(rows: T[], blank: () => T) => (rows.length ? rows : [blank()]);
  d.customer.creditTerms = fill(d.customer.creditTerms, blankCredit);
  for (const p of [d.customer, d.vendor]) {
    p.contacts = fill(p.contacts, blankContact);
    p.banks = fill(p.banks, blankBank);
    p.salesmen = fill(p.salesmen, blankSalesman);
  }
  d.vendor.paymentTerms = fill(d.vendor.paymentTerms, blankPayment);
  return d;
};

// ---------------------------------------------------------------- Validation

/** A row the user never touched (identical to a fresh blank row) is dropped instead of validated. */
const isBlankRow = <T extends { rid: string }>(row: T, blank: () => T) => {
  const b = blank() as Record<string, unknown>;
  return Object.entries(row).every(([k, v]) => k === "rid" || v === b[k]);
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Row checks for one table → first problem, e.g. "Row 2: Service Code is required." */
function checkRows<T extends { rid: string }>(
  rows: T[],
  blank: () => T,
  required: [keyof T, string][],
  extra?: (row: T, live: T[]) => string | null,
  /** true: blank rows are checked too instead of skipped (Documents). */
  everyRow = false,
): string | null {
  const live = everyRow ? rows : rows.filter((r) => !isBlankRow(r, blank));
  for (const [i, row] of live.entries()) {
    for (const [k, label] of required)
      if (!String(row[k] ?? "").trim())
        return tr(`Dòng ${i + 1}: nhập ${label}.`, `Row ${i + 1}: ${label} is required.`);
    const x = extra?.(row, live);
    if (x) return tr(`Dòng ${i + 1}: ${x}`, `Row ${i + 1}: ${x}`);
  }
  return null;
}

/** "BP-0012 – Công ty TNHH ABC (Inactive)": the partner a duplicate value already belongs to. */
const partnerLabel = (b: BusinessPartnerRecord) =>
  `${b.bpCode} – ${b.localName.trim() || b.englishName?.trim() || "(no name)"}${
    b.status === "Inactive" ? tr(" (đang Inactive)", " (Inactive)") : ""
  }`;

export function validateBusinessPartner(
  d: BusinessPartnerDraft,
  id?: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (k: keyof BusinessPartnerDraft, vi: string, en: string) => {
    const v = d[k];
    const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
    if (empty) e[k] = tr(`Nhập ${vi}.`, `${en} is required.`);
  };
  req("legalType", "Legal Type", "Legal Type");
  req("localName", "Local Name", "Local Name");
  req("englishName", "English Name", "English Name");
  req("localAddress", "Local Address", "Local Address");
  req("englishAddress", "English Address", "English Address");
  req("country", "Country", "Country");
  req("currency", "Currency", "Currency");
  req("businessCategory", "Business Category", "Business Category");

  const code = d.bpCode.trim().toUpperCase();
  if (!code) e["bpCode"] = tr("Nhập BP Code.", "BP Code is required.");
  else if (!BP_CODE_VALID.test(code))
    e["bpCode"] = tr(
      "BP Code chỉ gồm A–Z, 0–9, dấu chấm (.), gạch ngang (-), gạch dưới (_), không khoảng trắng, tối đa 12 ký tự.",
      "BP Code may only contain A–Z, 0–9, dot (.), hyphen (-), underscore (_), no spaces, max 12 characters.",
    );
  else {
    const dup = businessPartnerRepository
      .all()
      .find((b) => !b.deleted && b.id !== id && b.bpCode.toUpperCase() === code);
    if (dup)
      e["bpCode"] = tr(
        `BP Code ${code} đã được dùng cho ${partnerLabel(dup)}.`,
        `BP Code ${code} is already used by ${partnerLabel(dup)}.`,
      );
  }

  // Tax Code (MST, 10 or 10+3 digits): required for a Company. Identity Number (CCCD, 12 digits):
  // required for an Individual. A Representative needs neither. Each value entered must have the
  // right format and be unique per tenant among non-deleted partners.
  const others = businessPartnerRepository.all().filter((b) => !b.deleted && b.id !== id);
  const tax = taxCodeKey(d.taxCode);
  if (!tax) {
    if (taxCodeRequired(d.legalType)) e["taxCode"] = tr("Nhập Tax Code.", "Tax Code is required.");
  } else if (!MST.test(tax))
    e["taxCode"] = tr(
      "Mã số thuế gồm 10 số, hoặc 10 + 3 số với chi nhánh.",
      "Tax Code should be 10 digits, or 10 + 3 digits for a branch.",
    );
  else {
    const dup = others.find((b) => taxCodeKey(str(b.taxCode)) === tax);
    if (dup)
      e["taxCode"] = tr(
        `Tax Code ${d.taxCode.trim()} đã được dùng cho ${partnerLabel(dup)}.`,
        `Tax Code ${d.taxCode.trim()} is already used by ${partnerLabel(dup)}.`,
      );
  }
  const cccd = taxCodeKey(d.identityNo);
  if (!cccd) {
    if (identityNoRequired(d.legalType))
      e["identityNo"] = tr("Nhập Identity Number.", "Identity Number is required.");
  } else if (!CCCD.test(cccd))
    e["identityNo"] = tr("Số CCCD gồm 12 số.", "Identity Number (CCCD) should be 12 digits.");
  else {
    const dup = others.find((b) => taxCodeKey(str(b.identityNo)) === cccd);
    if (dup)
      e["identityNo"] = tr(
        `Identity Number ${d.identityNo.trim()} đã được dùng cho ${partnerLabel(dup)}.`,
        `Identity Number ${d.identityNo.trim()} is already used by ${partnerLabel(dup)}.`,
      );
  }

  if (d.roles.length === 0)
    e["roles"] = tr("Chọn ít nhất một vai trò.", "Select at least one role.");

  // Currencies follow the default currency (always included on save), so nothing to check here.

  if (d.roles.includes("Customer") && d.creditLimit.trim()) {
    if (!(Number(d.creditLimit) >= 0))
      e["creditLimit"] = tr("Credit Limit không hợp lệ.", "Invalid Credit Limit.");
    else if (!d.creditLimitCurrency)
      e["creditLimit"] = tr("Chọn tiền tệ cho Credit Limit.", "Select the Credit Limit currency.");
    else if (![d.currency, ...d.currencies].includes(d.creditLimitCurrency))
      e["creditLimit"] = tr(
        "Tiền tệ của Credit Limit phải nằm trong danh sách Currencies.",
        "Credit Limit currency must be one of the selected Currencies.",
      );
  }

  const set = (k: string, msg: string | null) => msg && (e[k] = msg);
  set(
    "documents",
    checkRows(
      d.documents,
      blankDocument,
      [["docType", "Document Type"]],
      (r) =>
        r.validDate && r.expiryDate && r.expiryDate < r.validDate
          ? tr("Expiry Date phải sau Valid Date.", "Expiry Date must not be before Valid Date.")
          : null,
      true,
    ),
  );
  /** Contact Info, Bank and Sales Assignment tables of one role tab. */
  const banks = (p: "customer" | "vendor") => {
    set(
      `${p}.contacts`,
      checkRows(d[p].contacts, blankContact, [], (r) =>
        r.email && !EMAIL.test(r.email) ? tr("Email không hợp lệ.", "Invalid email.") : null,
      ) ??
        (pruned(d[p].contacts, blankContact).filter((c) => c.primaryContact).length > 1
          ? tr("Chỉ được một liên hệ chính.", "Only one contact can be Primary.")
          : null),
    );
    set(
      `${p}.banks`,
      checkRows(d[p].banks, blankBank, [
        ["bankCode", "Bank Code"],
        ["bankName", "Bank Name"],
        ["accountNo", "Account No."],
        ["accountHolder", "Account Holder"],
      ]),
    );
    // Sales Assignment exists for customers only.
    if (p === "customer")
      set(
        `${p}.salesmen`,
        checkRows(d[p].salesmen, blankSalesman, [["staffName", "Staff"]], (r, live) =>
          live.some((x) => {
            if (x === r || x.staffName !== r.staffName) return false;
            // Same staff twice is a duplicate when the services overlap (or neither has one).
            const a = splitList(x.serviceCode);
            const b = splitList(r.serviceCode);
            return (!a.length && !b.length) || a.some((c) => b.includes(c));
          })
            ? tr(
                "Nhân viên đã được phân công (cùng dịch vụ).",
                "This staff is already assigned (same service).",
              )
            : null,
        ),
      );
  };
  if (d.roles.includes("Customer")) {
    set(
      "customer.creditTerms",
      checkRows(
        d.customer.creditTerms,
        blankCredit,
        [
          ["serviceCode", "Service Code"],
          ["creditTerm", "Credit Term"],
        ],
        (r) => {
          if (r.woAccessFrom && r.woAccessTo && r.woAccessTo < r.woAccessFrom)
            return tr(
              "WO Access To phải sau WO Access From.",
              "WO Access To must be after WO Access From.",
            );
          return r.creditDays && !(Number(r.creditDays) >= 0)
            ? tr("Credit Days không hợp lệ.", "Invalid Credit Days.")
            : null;
        },
      ),
    );
    banks("customer");
  }
  if (d.roles.includes("Vendor")) {
    set(
      "vendor.paymentTerms",
      checkRows(
        d.vendor.paymentTerms,
        blankPayment,
        [
          ["serviceCode", "Service Code"],
          ["paymentTerm", "Payment Term"],
        ],
        (r) =>
          r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom
            ? tr(
                "Effective To phải sau Effective From.",
                "Effective To must not be before Effective From.",
              )
            : null,
      ),
    );
    banks("vendor");
  }
  // Customer and Vendor keep separate bank accounts: the same account number may not be in both.
  if (d.roles.includes("Customer") && d.roles.includes("Vendor") && !e["vendor.banks"]) {
    const custAccounts = new Set(
      pruned(d.customer.banks, blankBank).map((b) => b.accountNo.replace(/\s+/g, "")),
    );
    const shared = pruned(d.vendor.banks, blankBank).find((b) =>
      custAccounts.has(b.accountNo.replace(/\s+/g, "")),
    );
    if (shared)
      e["vendor.banks"] = tr(
        `Tài khoản ${shared.accountNo} đã khai báo cho Customer — Customer và Vendor không dùng chung tài khoản.`,
        `Account ${shared.accountNo} is already used by the Customer role — Customer and Vendor cannot share a bank account.`,
      );
  }
  return e;
}

// ---------------------------------------------------------------- Save

const SCALARS: [keyof BusinessPartnerRecord, string][] = [
  ["bpCode", "BP Code"],
  ["legalType", "Legal Type"],
  ["status", "Status"],
  ["taxCode", "Tax Code"],
  ["identityNo", "Identity Number"],
  ["form", "Form"],
  ["invoiceSerial", "Invoice Serial"],
  ["localName", "Local Name"],
  ["englishName", "English Name"],
  ["localAddress", "Local Address"],
  ["englishAddress", "English Address"],
  ["country", "Country"],
  ["province", "Province"],
  ["postcode", "Post Code"],
  ["fax", "Fax"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["tax", "Tax"],
  ["invoiceLanguage", "Invoicing Language"],
  ["currency", "Currency"],
  ["currencies", "Currencies"],
  ["businessCategory", "Business Category"],
  ["partnerScope", "Partner Scope"],
  ["partnerGroup", "Partner Group"],
  ["serviceProviderType", "Service Provider Type"],
  ["defaultPaymentTerm", "Default Payment Term"],
  ["creditLimit", "Credit Limit"],
  ["creditLimitCurrency", "Credit Limit Currency"],
  ["note", "Remark"],
];
const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

// ---------------------------------------------------------------- Change History of the tables

type Cols = [string, string][];
interface TableSpec {
  /** "Tab › Table", e.g. "Customer › Contact Info". */
  title: string;
  rows: (r: BusinessPartnerRecord) => { rid: string }[];
  cols: Cols;
  /** Column that names a row in the history, e.g. the contact's Full Name. */
  nameKey: string;
}
const SERVICE: Cols = [
  ["serviceCode", "Service Code"],
  ["serviceName", "Service Name"],
];
const CONTACT_COLS: Cols = [
  ...SERVICE,
  ["gender", "Gender"],
  ["fullName", "Full Name"],
  ["identityNo", "Identity No."],
  ["telephone", "Telephone"],
  ["mobilePhone", "Mobile Phone"],
  ["contactRole", "Contact Role"],
  ["email", "Email"],
  ["address", "Address"],
  ["primaryContact", "Primary Contact"],
  ["status", "Status"],
  ["remark", "Remark"],
];
const BANK_COLS: Cols = [
  ["bankCode", "Bank Code"],
  ["bankName", "Bank Name"],
  ["accountNo", "Account No."],
  ["accountHolder", "Account Holder"],
  ["bankBranch", "Bank Branch"],
  ["bankAddress", "Bank Address"],
  ["bankCountry", "Bank Country"],
  ["currency", "Currency"],
  ["remark", "Remark"],
];
const SALES_COLS: Cols = [
  ["staffName", "Staff"],
  ["leader", "Leader"],
  ["department", "Department"],
  ...SERVICE,
  ["remark", "Remark"],
];
const TABLES: TableSpec[] = [
  {
    title: "Documents",
    rows: (r) => r.documents,
    nameKey: "docType",
    cols: [
      ["docType", "Document Type"],
      ["docName", "Document Name"],
      ["validDate", "Valid Date"],
      ["expiryDate", "Expiry Date"],
      ["fileName", "Attachment"],
      ["remark", "Remark"],
    ],
  },
  {
    title: "Customer › Credit Term",
    rows: (r) => r.customer.creditTerms,
    nameKey: "serviceCode",
    cols: [
      ...SERVICE,
      ["creditTerm", "Credit Term"],
      ["creditDays", "Credit Days"],
      ["creditLimit", "Credit Limit"],
      ["woAccessFrom", "WO Access From"],
      ["woAccessTo", "WO Access To"],
      ["woAccessPolicy", "WO Access Policy"],
      ["autoLockAfterExpiry", "Auto Lock After Expiry"],
      ["approvedBy", "Approved By"],
      ["status", "Status"],
      ["remark", "Remark"],
    ],
  },
  {
    title: "Customer › Contact Info",
    rows: (r) => r.customer.contacts,
    nameKey: "fullName",
    cols: CONTACT_COLS,
  },
  {
    title: "Customer › Bank Account",
    rows: (r) => r.customer.banks,
    nameKey: "accountNo",
    cols: BANK_COLS,
  },
  {
    title: "Customer › Sales Assignment",
    rows: (r) => r.customer.salesmen,
    nameKey: "staffName",
    cols: SALES_COLS,
  },
  {
    title: "Vendor › Payment Term",
    rows: (r) => r.vendor.paymentTerms,
    nameKey: "serviceCode",
    cols: [
      ...SERVICE,
      ["paymentTerm", "Payment Term"],
      ["effectiveFrom", "Effective From"],
      ["effectiveTo", "Effective To"],
      ["status", "Status"],
      ["remark", "Remark"],
    ],
  },
  {
    title: "Vendor › Contact Info",
    rows: (r) => r.vendor.contacts,
    nameKey: "fullName",
    cols: CONTACT_COLS,
  },
  {
    title: "Vendor › Bank Account",
    rows: (r) => r.vendor.banks,
    nameKey: "accountNo",
    cols: BANK_COLS,
  },
  {
    title: "Vendor › Sales Assignment",
    rows: (r) => r.vendor.salesmen,
    nameKey: "staffName",
    cols: SALES_COLS,
  },
];

const cell = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : fmt(v).trim());
const EMPTY = "—";

/**
 * One history line per change inside the tables, matched by row id:
 * a new row ("… › Row added", its values), a removed row ("… › Row removed"), or a changed cell
 * ("… › {row name} › {column}", old value → new value).
 */
function tableChanges(
  before: BusinessPartnerRecord,
  after: BusinessPartnerRecord,
): { field: string; oldValue: string; newValue: string }[] {
  const out: { field: string; oldValue: string; newValue: string }[] = [];
  for (const t of TABLES) {
    const get = (row: { rid: string }, k: string) => cell((row as unknown as Loose)[k]);
    const summary = (row: { rid: string }) =>
      t.cols
        .map(([k, label]) => [label, get(row, k)] as const)
        .filter(([, v]) => v && v !== "No")
        .map(([label, v]) => `${label}: ${v}`)
        .join(" · ") || EMPTY;
    const oldRows = t.rows(before);
    const newRows = t.rows(after);
    const oldById = new Map(oldRows.map((r) => [r.rid, r]));
    const newIds = new Set(newRows.map((r) => r.rid));
    for (const r of newRows) {
      const o = oldById.get(r.rid);
      if (!o) {
        out.push({ field: `${t.title} › Row added`, oldValue: EMPTY, newValue: summary(r) });
        continue;
      }
      const name = get(r, t.nameKey) || get(o, t.nameKey) || `Row ${newRows.indexOf(r) + 1}`;
      for (const [k, label] of t.cols) {
        const a = get(o, k);
        const b = get(r, k);
        if (a !== b)
          out.push({
            field: `${t.title} › ${name} › ${label}`,
            oldValue: a || EMPTY,
            newValue: b || EMPTY,
          });
      }
    }
    for (const o of oldRows)
      if (!newIds.has(o.rid))
        out.push({ field: `${t.title} › Row removed`, oldValue: summary(o), newValue: EMPTY });
  }
  return out;
}

function pruned<T extends { rid: string }>(rows: T[], blank: () => T) {
  return rows.filter((r) => !isBlankRow(r, blank));
}

export const businessPartnerService = {
  save(d: BusinessPartnerDraft, id?: string): BusinessPartnerRecord {
    const errors = validateBusinessPartner(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const roleOrder: BpRole[] = ["Customer", "Vendor"];
    const isCustomer = d.roles.includes("Customer");
    const clean: BusinessPartnerDraft = {
      ...d,
      bpCode: d.bpCode.trim().toUpperCase(),
      taxCode: d.taxCode.trim(),
      identityNo: d.identityNo.trim(),
      localName: d.localName.trim(),
      englishName: d.englishName.trim(),
      note: d.note.trim(),
      businessCategory: uniq(d.businessCategory),
      // The default currency is always one of the partner's currencies.
      currencies: uniq([...(d.currency ? [d.currency] : []), ...d.currencies]),
      // Credit limit belongs to the Customer role only.
      creditLimit: isCustomer ? d.creditLimit.trim() : "",
      creditLimitCurrency: isCustomer && d.creditLimit.trim() ? d.creditLimitCurrency : "",
      roles: roleOrder.filter((r) => d.roles.includes(r)),
      documents: pruned(d.documents, blankDocument),
      customer: {
        // Term amounts follow the partner Currency of General Information.
        creditTerms: pruned(d.customer.creditTerms, blankCredit).map((r) => ({
          ...r,
          currency: d.currency,
        })),
        contacts: pruned(d.customer.contacts, blankContact),
        banks: pruned(d.customer.banks, blankBank),
        salesmen: pruned(d.customer.salesmen, blankSalesman),
      },
      vendor: {
        paymentTerms: pruned(d.vendor.paymentTerms, blankPayment).map((r) => ({
          ...r,
          currency: d.currency,
        })),
        contacts: pruned(d.vendor.contacts, blankContact),
        banks: pruned(d.vendor.banks, blankBank),
        salesmen: pruned(d.vendor.salesmen, blankSalesman),
      },
    };
    const stored = id ? businessPartnerRepository.get(id) : undefined;
    const existing = stored ? normalizeBusinessPartner(stored) : undefined;
    const base = { entityType: "Business Partner" as const };

    if (!existing) {
      const rec: BusinessPartnerRecord = {
        ...clean,
        id: uid("BP-"),
        ...stampCreate(),
      };
      businessPartnerRepository.insert(rec);
      auditService.log({
        ...base,
        action: "CREATE",
        entityId: rec.id,
        entityLabel: rec.bpCode,
        note: `Roles: ${rec.roles.join(", ")}`,
      });
      return rec;
    }

    // Editing roles / fields only changes this master record; already-posted records keep what they
    // captured.
    const next = stampUpdate({ ...existing, ...clean });
    businessPartnerRepository.update(existing.id, () => next);
    const diffs = SCALARS.filter(([k]) => fmt(existing[k]) !== fmt(next[k])).map(([k, label]) => ({
      ...base,
      action: "UPDATE" as const,
      entityId: next.id,
      entityLabel: next.bpCode,
      field: label,
      oldValue: fmt(existing[k]),
      newValue: fmt(next[k]),
    }));
    if (existing.roles.join() !== next.roles.join())
      diffs.push({
        ...base,
        action: "UPDATE",
        entityId: next.id,
        entityLabel: next.bpCode,
        field: "Role",
        oldValue: existing.roles.join(", "),
        newValue: next.roles.join(", "),
      });
    for (const c of tableChanges(existing, next))
      diffs.push({
        ...base,
        action: "UPDATE",
        entityId: next.id,
        entityLabel: next.bpCode,
        ...c,
      });
    auditService.logMany(diffs);
    return next;
  },
};

// ---------------------------------------------------------------- Import

const STATUSES = ["Active", "Inactive"] as const;
/** Each item of a multi-value cell matched case-insensitively; unknown items come back as null. */
const pickAll = <T extends string>(v: string | undefined, allowed: readonly T[]) =>
  listCell(v).map((x) => pick(x, allowed) || null);

const bpDraftOfRow = (r: Record<string, string>): BusinessPartnerDraft => {
  const country = pick(r["country"], codeOptions(CC.COUNTRY, COUNTRIES)) || "";
  // Same default as the form: Vietnam → VND; another country needs its currency in the file.
  const currency =
    pick(r["currency"], CURRENCIES) || (country === "Vietnam" ? TENANT_DEFAULT_CURRENCY : "");
  const localAddress = r["localAddress"] ?? "";
  const creditLimit = (r["creditLimit"] ?? "").replace(/[\s,]/g, "");
  return {
    ...newBusinessPartnerDraft(),
    bpCode: sanitizeBpCode(r["bpCode"] ?? ""),
    legalType: pick(r["legalType"], LEGAL_TYPES) || "",
    roles: pickAll(r["roles"], BP_ROLES).filter((x): x is BpRole => !!x),
    taxCode: r["taxCode"] ?? "",
    identityNo: r["identityNo"] ?? "",
    localName: r["localName"] ?? "",
    englishName: r["englishName"] ?? "",
    localAddress,
    // Same pre-fill as the form when the English address is left empty.
    englishAddress: r["englishAddress"] || toEnglishAddress(localAddress),
    country,
    currency,
    currencies: currency ? [currency] : [],
    businessCategory: pickAll(r["businessCategory"], BUSINESS_CATEGORIES).filter(
      (x): x is string => !!x,
    ),
    partnerScope: pick(r["partnerScope"], PARTNER_SCOPES) || "",
    defaultPaymentTerm: r["defaultPaymentTerm"] ?? "",
    creditLimit,
    creditLimitCurrency: creditLimit ? currency : "",
    note: r["note"] ?? "",
    status: pick(r["status"], STATUSES) || "Active",
  };
};

const oneOf = (label: string, values: readonly string[]) => `${label}: ${values.join(", ")}`;

/** Profile fields only; contacts, banks, credit / payment terms are added on the detail page. */
export const businessPartnerImportConfig = draftImportConfig<BusinessPartnerDraft>({
  entityType: "Business Partner",
  screen: "business-partner",
  keyColumn: "bpCode",
  columns: [
    { key: "bpCode", header: "BP Code", required: true, example: "ABC-LOG" },
    { key: "legalType", header: "Legal Type", required: true, example: "Company" },
    {
      key: "roles",
      header: "Role",
      required: true,
      example: "Customer; Vendor",
      aliases: ["Roles", "Vai trò"],
    },
    {
      key: "taxCode",
      header: "Tax Code",
      example: "0301116791",
      aliases: ["Tax ID", "Mã số thuế"],
    },
    {
      key: "identityNo",
      header: "Identity Number",
      example: "",
      aliases: ["CCCD", "Số CCCD"],
    },
    {
      key: "localName",
      header: "Local Name",
      required: true,
      example: "Công ty TNHH ABC Logistics",
    },
    {
      key: "englishName",
      header: "English Name",
      required: true,
      example: "ABC Logistics Co., Ltd",
    },
    {
      key: "localAddress",
      header: "Local Address",
      required: true,
      example: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    },
    { key: "englishAddress", header: "English Address", example: "" },
    { key: "country", header: "Country", required: true, example: "Vietnam" },
    { key: "currency", header: "Currency", example: "VND" },
    {
      key: "businessCategory",
      header: "Business Category",
      required: true,
      example: "Logistics; Trading",
    },
    { key: "partnerScope", header: "Partner Scope", example: "Domestic", aliases: ["Scope"] },
    {
      key: "defaultPaymentTerm",
      header: "Payment Term",
      example: "",
      aliases: ["Default Payment Term"],
    },
    { key: "creditLimit", header: "Credit Limit", example: "" },
    { key: "status", header: "Status", example: "Active", aliases: ["Trạng thái"] },
    { key: "note", header: "Remark", example: "", aliases: ["Note", "Notes"] },
  ],
  existingKeys: () =>
    new Set(
      businessPartnerRepository
        .all()
        .filter((b) => !b.deleted)
        .map((b) => b.bpCode.toLowerCase()),
    ),
  parseCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    const one = (k: string, values: readonly string[], label = "Use one of") => {
      if (pick(r[k], values) === undefined) e.push({ field: k, error: oneOf(label, values) });
    };
    one("legalType", LEGAL_TYPES);
    one("country", codeOptions(CC.COUNTRY, COUNTRIES));
    one("currency", CURRENCIES);
    one("partnerScope", PARTNER_SCOPES);
    one("status", STATUSES);
    if (pickAll(r["roles"], BP_ROLES).includes(null))
      e.push({ field: "roles", error: oneOf("Use", BP_ROLES) + " (separate with ;)" });
    if (pickAll(r["businessCategory"], BUSINESS_CATEGORIES).includes(null))
      e.push({
        field: "businessCategory",
        error: oneOf("Use", BUSINESS_CATEGORIES) + " (separate with ;)",
      });
    const code = (r["bpCode"] ?? "").trim().toUpperCase();
    if (code && sanitizeBpCode(code) !== code)
      e.push({
        field: "bpCode",
        error: "Only A–Z, 0–9, dot, hyphen, underscore; no spaces (max 15)",
      });
    return e;
  },
  toDraft: bpDraftOfRow,
  validate: (d) => validateBusinessPartner(d),
  save: (d) => businessPartnerService.save(d),
  rollback: (ids) => bpCrud.removeMany(ids),
  sampleRows: () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      const vendor = i % 3 === 1;
      return [
        `IMP-BP${n}`,
        "Company",
        vendor ? "Vendor" : i % 3 === 2 ? "Customer; Vendor" : "Customer",
        `0399${String(100000 + i)}`,
        "", // Identity Number (Company rows)
        `Công ty TNHH Nhập Mẫu ${n}`,
        `Sample Import ${n} Co., Ltd`,
        `${i + 1} Lê Lợi, Quận 1, TP. Hồ Chí Minh`,
        "",
        "Vietnam",
        "VND",
        vendor ? "Logistics" : "Trading; Retail",
        "Domestic",
        "",
        "",
        i % 8 === 7 ? "Inactive" : "Active",
        "",
      ];
    });
    rows[4]![0] = "IMP-BP01"; // duplicate BP Code
    rows[10]![2] = "Partner"; // unknown role
    rows[15]![1] = "Government"; // unknown Legal Type
    return rows;
  },
});
