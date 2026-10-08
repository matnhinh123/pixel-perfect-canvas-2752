// Business Partner master: validation, save + role rules. BP Code is the identifier.
import { businessPartnerRepository, uid } from "@/repositories";
import type {
  BpBankAccount,
  BpContact,
  BpCreditTerm,
  BpDocument,
  BpLegalType,
  BpLicenseAdjustment,
  BpPaymentTerm,
  BpRole,
  BpSalesman,
  BusinessPartnerRecord,
} from "@/types";
import { EMPLOYEES, departmentName } from "@/mock-data/staff";
import { LEGAL_TYPES, TENANT_DEFAULT_CURRENCY } from "@/mock-data/businessPartners";
import { tr } from "@/lib/i18n";
import { auditService } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";

export const bpCrud = makeCrud<BusinessPartnerRecord>({
  entityType: "Business Partner",
  repo: businessPartnerRepository,
  labelOf: (b) => b.bpCode,
  // Transactions (WO / invoices) will register here once they exist; for now nothing references a BP.
  references: () => null,
});

// ---------------------------------------------------------------- BP Code convention

/** A–Z, 0–9, dot, hyphen, underscore. Max 50, always uppercase. */
export const BP_CODE_MAX = 50;
const BP_CODE_VALID = /^[A-Z0-9._-]{1,50}$/;
/** Input filter: uppercases and drops every disallowed character as the user types / pastes. */
export const sanitizeBpCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, BP_CODE_MAX);

/** Tax code comparison key: case- and whitespace-insensitive. */
/** English Address pre-fill: strip Vietnamese accents and translate admin words (mock until a real service). */
export function toEnglishAddress(local: string): string {
  const words: [RegExp, string][] = [
    [/\bThành phố\b|\bTP\.\s*/gi, "City "],
    [/\bTỉnh\b/gi, "Province"],
    [/\bQuận\b/gi, "District"],
    [/\bHuyện\b/gi, "District"],
    [/\bThị xã\b/gi, "Town"],
    [/\bPhường\b/gi, "Ward"],
    [/\bXã\b/gi, "Commune"],
    [/\bĐường\b/gi, "Street"],
    [/\bQuốc lộ\b/gi, "National Road"],
    [/\bKCN\b/g, "Industrial Park"],
    [/\bLô\b/gi, "Lot"],
  ];
  let out = local;
  for (const [re, en] of words) out = out.replace(re, en);
  return out
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

export const taxCodeKey = (v: string) => v.replace(/\s+/g, "").toUpperCase();

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
});
export const blankSalesman = (): BpSalesman => ({
  rid: newRowId(),
  staffId: "",
  staffName: "",
  department: "",
  serviceCode: "",
  serviceName: "",
  remark: "",
});
export const blankContact = (): BpContact => ({
  rid: newRowId(),
  fullName: "",
  position: "",
  phone: "",
  email: "",
  primaryContact: false,
});
export const blankBank = (): BpBankAccount => ({
  rid: newRowId(),
  bankCode: "",
  bankName: "",
  swiftCode: "",
  bankBranch: "",
  bankAddress: "",
  bankCountry: "",
  accountNo: "",
  accountHolder: "",
  currency: "",
});
export const blankDocument = (): BpDocument => ({
  rid: newRowId(),
  docType: "",
  docNo: "",
  issueDate: "",
  expiryDate: "",
  fileName: "",
  remark: "",
});
export const blankLicense = (): BpLicenseAdjustment => ({
  rid: newRowId(),
  adjustmentDate: "",
  changeContent: "",
  documentNo: "",
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
  currency: TENANT_DEFAULT_CURRENCY,
  currencies: [TENANT_DEFAULT_CURRENCY],
  businessCategory: [],
  partnerScope: "",
  partnerGroup: "",
  serviceProviderType: "",
  defaultPaymentTerm: "",
  creditLimit: "",
  creditLimitCurrency: "",
  note: "",
  roles: [],
  contacts: [blankContact()],
  salesAssignments: [blankSalesman()],
  licenseAdjustments: [blankLicense()],
  documents: [blankDocument()],
  customer: {
    creditTerms: [blankCredit()],
    banks: [blankBank()],
  },
  vendor: {
    paymentTerms: [blankPayment()],
    banks: [blankBank()],
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

/** Old per-role contacts → profile contact. */
const oldContact = (c: Loose): BpContact => ({
  rid: str(c["rid"]) || newRowId(),
  fullName: str(c["fullName"]),
  position: str(c["position"]) || str(c["contactRole"]),
  phone: str(c["phone"]) || str(c["mobile"]) || str(c["telephone"]),
  email: str(c["email"]),
  primaryContact: c["primaryContact"] === true,
});
/** Old per-role salesman (hard-coded list) → profile sales assignment. */
const oldSalesman = (s: Loose): BpSalesman => {
  const name = str(s["staffName"]) || str(s["salesName"]);
  const e = EMPLOYEES.find((x) => x.id === str(s["staffId"]) || x.name === name);
  return {
    rid: str(s["rid"]) || newRowId(),
    staffId: e?.id ?? str(s["staffId"]),
    staffName: e?.name ?? name,
    department: str(s["department"]) || (e ? departmentName(e.departmentId) : ""),
    serviceCode: str(s["serviceCode"]),
    serviceName: str(s["serviceName"]),
    remark: str(s["remark"]),
  };
};

/**
 * Brings a record saved by an earlier version of the app to the current shape: Legal Type
 * "Government" → "Company", single Business Category → list, per-role contacts / salesmen moved to
 * the profile, new profile fields defaulted. Records already in the current shape pass unchanged.
 */
export function normalizeBusinessPartner(raw: BusinessPartnerRecord): BusinessPartnerRecord {
  const r = raw as unknown as Loose;
  const cust = (r["customer"] ?? {}) as Loose;
  const vend = (r["vendor"] ?? {}) as Loose;
  const currency = str(r["currency"]);

  const contacts = Array.isArray(r["contacts"])
    ? arr(r["contacts"]).map(oldContact)
    : [...arr(cust["contacts"]), ...arr(vend["contacts"])]
        .map(oldContact)
        .filter(
          (c, i, all) =>
            all.findIndex((x) => x.fullName === c.fullName && x.phone === c.phone) === i,
        );
  const salesAssignments = Array.isArray(r["salesAssignments"])
    ? arr(r["salesAssignments"]).map(oldSalesman)
    : [...arr(cust["salesmen"]), ...arr(vend["salesmen"])]
        .map(oldSalesman)
        .filter(
          (s, i, all) =>
            all.findIndex((x) => x.staffName === s.staffName && x.serviceCode === s.serviceCode) ===
            i,
        );
  const currencies = uniq([...strList(r["currencies"]), ...(currency ? [currency] : [])]);

  return {
    ...raw,
    legalType: normLegalType(r["legalType"]),
    businessCategory: strList(r["businessCategory"]),
    currencies,
    tax: str(r["tax"]),
    partnerGroup: str(r["partnerGroup"]),
    defaultPaymentTerm: str(r["defaultPaymentTerm"]),
    creditLimit: str(r["creditLimit"]),
    creditLimitCurrency: str(r["creditLimitCurrency"]) || currency,
    note: str(r["note"]),
    roles: (Array.isArray(raw.roles) ? raw.roles : []).filter(
      (x): x is BpRole => x === "Customer" || x === "Vendor",
    ),
    contacts,
    salesAssignments,
    licenseAdjustments: arr(r["licenseAdjustments"]) as unknown as BpLicenseAdjustment[],
    documents: arr(r["documents"]) as unknown as BpDocument[],
    customer: {
      creditTerms: arr(cust["creditTerms"]) as unknown as BpCreditTerm[],
      banks: arr(cust["banks"]) as unknown as BpBankAccount[],
    },
    vendor: {
      paymentTerms: arr(vend["paymentTerms"]) as unknown as BpPaymentTerm[],
      banks: arr(vend["banks"]) as unknown as BpBankAccount[],
    },
  };
}

/** Draft for editing an existing record: an empty table gets one blank row ready for input. */
export const draftOf = (r: BusinessPartnerRecord): BusinessPartnerDraft => {
  const d = structuredClone(normalizeBusinessPartner(r)) as BusinessPartnerDraft;
  const fill = <T>(rows: T[], blank: () => T) => (rows.length ? rows : [blank()]);
  d.contacts = fill(d.contacts, blankContact);
  d.salesAssignments = fill(d.salesAssignments, blankSalesman);
  d.licenseAdjustments = fill(d.licenseAdjustments, blankLicense);
  d.documents = fill(d.documents, blankDocument);
  d.customer.creditTerms = fill(d.customer.creditTerms, blankCredit);
  d.customer.banks = fill(d.customer.banks, blankBank);
  d.vendor.paymentTerms = fill(d.vendor.paymentTerms, blankPayment);
  d.vendor.banks = fill(d.vendor.banks, blankBank);
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
): string | null {
  const live = rows.filter((r) => !isBlankRow(r, blank));
  for (const [i, row] of live.entries()) {
    for (const [k, label] of required)
      if (!String(row[k] ?? "").trim())
        return tr(`Dòng ${i + 1}: nhập ${label}.`, `Row ${i + 1}: ${label} is required.`);
    const x = extra?.(row, live);
    if (x) return tr(`Dòng ${i + 1}: ${x}`, `Row ${i + 1}: ${x}`);
  }
  return null;
}

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
  req("taxCode", "Tax Code", "Tax Code");
  req("localName", "Local Name", "Local Name");
  req("englishName", "English Name", "English Name");
  req("localAddress", "Local Address", "Local Address");
  req("englishAddress", "English Address", "English Address");
  req("country", "Country", "Country");
  req("currency", "Currency", "Currency");
  req("businessCategory", "Business Category", "Business Category");
  req("partnerGroup", "Partner Group", "Partner Group");

  const code = d.bpCode.trim().toUpperCase();
  if (!code) e["bpCode"] = tr("Nhập BP Code.", "BP Code is required.");
  else if (!BP_CODE_VALID.test(code))
    e["bpCode"] = tr(
      "BP Code chỉ gồm A–Z, 0–9, dấu chấm (.), gạch ngang (-), gạch dưới (_), tối đa 50 ký tự.",
      "BP Code may only contain A–Z, 0–9, dot (.), hyphen (-), underscore (_), max 50 characters.",
    );
  else if (
    businessPartnerRepository
      .all()
      .some((b) => !b.deleted && b.id !== id && b.bpCode.toUpperCase() === code)
  )
    e["bpCode"] = tr(`BP Code ${code} đã tồn tại.`, `BP Code ${code} already exists.`);

  // Tax code (MST) is unique per tenant among non-deleted partners.
  const tax = taxCodeKey(d.taxCode);
  if (tax) {
    const dup = businessPartnerRepository
      .all()
      .find((b) => !b.deleted && b.id !== id && taxCodeKey(str(b.taxCode)) === tax);
    if (dup)
      e["taxCode"] = tr(
        `Mã số thuế ${d.taxCode.trim()} đã được dùng cho ${dup.bpCode}.`,
        `Tax Code ${d.taxCode.trim()} is already used by ${dup.bpCode}.`,
      );
  }

  if (d.email.trim() && !EMAIL.test(d.email.trim()))
    e["email"] = tr("Email không hợp lệ.", "Invalid email.");
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
    checkRows(d.documents, blankDocument, [["docType", "Document Type"]], (r) =>
      r.issueDate && r.expiryDate && r.expiryDate < r.issueDate
        ? tr("Expiry Date phải sau Issue Date.", "Expiry Date must not be before Issue Date.")
        : null,
    ),
  );
  set(
    "licenseAdjustments",
    checkRows(d.licenseAdjustments, blankLicense, [
      ["adjustmentDate", "Adjustment Date"],
      ["changeContent", "Change Content"],
    ]),
  );
  set(
    "contacts",
    checkRows(d.contacts, blankContact, [["fullName", "Name"]], (r) =>
      r.email && !EMAIL.test(r.email) ? tr("Email không hợp lệ.", "Invalid email.") : null,
    ) ??
      (pruned(d.contacts, blankContact).filter((c) => c.primaryContact).length > 1
        ? tr("Chỉ được một liên hệ chính.", "Only one contact can be Primary.")
        : null),
  );
  set(
    "salesAssignments",
    checkRows(d.salesAssignments, blankSalesman, [["staffName", "Staff"]], (r, live) =>
      live.some((x) => x !== r && x.staffName === r.staffName && x.serviceCode === r.serviceCode)
        ? tr(
            "Nhân viên đã được phân công (cùng dịch vụ).",
            "This staff is already assigned (same service).",
          )
        : null,
    ),
  );

  const banks = (p: "customer" | "vendor") =>
    set(
      `${p}.banks`,
      checkRows(d[p].banks, blankBank, [
        ["bankCode", "Bank Code"],
        ["bankName", "Bank Name"],
        ["swiftCode", "SWIFT Code"],
        ["accountNo", "Account No."],
      ]),
    );
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
  ["taxCode", "Tax Code / Identity Number"],
  ["form", "Form"],
  ["invoiceSerial", "Serial"],
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
  ["note", "Notes"],
];
const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

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
      contacts: pruned(d.contacts, blankContact),
      salesAssignments: pruned(d.salesAssignments, blankSalesman),
      licenseAdjustments: pruned(d.licenseAdjustments, blankLicense).sort((a, b) =>
        b.adjustmentDate.localeCompare(a.adjustmentDate),
      ),
      documents: pruned(d.documents, blankDocument),
      customer: {
        creditTerms: pruned(d.customer.creditTerms, blankCredit),
        banks: pruned(d.customer.banks, blankBank),
      },
      vendor: {
        paymentTerms: pruned(d.vendor.paymentTerms, blankPayment),
        banks: pruned(d.vendor.banks, blankBank),
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
    const tables = (r: BusinessPartnerRecord) =>
      JSON.stringify([
        r.contacts,
        r.salesAssignments,
        r.licenseAdjustments,
        r.documents,
        r.customer,
        r.vendor,
      ]);
    if (tables(existing) !== tables(next))
      diffs.push({
        ...base,
        action: "UPDATE",
        entityId: next.id,
        entityLabel: next.bpCode,
        field: "Tables (Contacts / Sales / License / Documents / Customer / Vendor)",
        oldValue: "",
        newValue: "Updated",
      });
    auditService.logMany(diffs);
    return next;
  },
};
