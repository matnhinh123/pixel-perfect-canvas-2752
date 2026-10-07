// Business Partner master: validation, save + role rules. BP Code is the identifier.
import { businessPartnerRepository, uid } from "@/repositories";
import type {
  BpBankAccount,
  BpContact,
  BpCreditTerm,
  BpDocument,
  BpPaymentTerm,
  BpRole,
  BpSalesman,
  BusinessPartnerRecord,
} from "@/types";
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
  serviceCode: "",
  serviceName: "",
  salesCode: "",
  salesName: "",
  remark: "",
  branch: "",
  department: "",
});
export const blankContact = (): BpContact => ({
  rid: newRowId(),
  serviceCode: "",
  serviceName: "",
  gender: "",
  fullName: "",
  identityNo: "",
  telephone: "",
  mobile: "",
  contactRole: "",
  email: "",
  address: "",
  primaryContact: false,
  status: "Active",
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
  invoiceLanguage: "",
  currency: "",
  businessCategory: "",
  partnerScope: "",
  serviceProviderType: "",
  roles: [],
  documents: [blankDocument()],
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

/** Draft for editing an existing record: an empty table gets one blank row ready for input. */
export const draftOf = (r: BusinessPartnerRecord): BusinessPartnerDraft => {
  const d = structuredClone(r) as BusinessPartnerDraft;
  const fill = <T>(rows: T[], blank: () => T) => (rows.length ? rows : [blank()]);
  d.documents = fill(d.documents, blankDocument);
  d.customer.creditTerms = fill(d.customer.creditTerms, blankCredit);
  d.customer.contacts = fill(d.customer.contacts, blankContact);
  d.customer.banks = fill(d.customer.banks, blankBank);
  d.customer.salesmen = fill(d.customer.salesmen, blankSalesman);
  d.vendor.paymentTerms = fill(d.vendor.paymentTerms, blankPayment);
  d.vendor.contacts = fill(d.vendor.contacts, blankContact);
  d.vendor.banks = fill(d.vendor.banks, blankBank);
  d.vendor.salesmen = fill(d.vendor.salesmen, blankSalesman);
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
  extra?: (row: T) => string | null,
): string | null {
  const live = rows.filter((r) => !isBlankRow(r, blank));
  for (const [i, row] of live.entries()) {
    for (const [k, label] of required)
      if (!String(row[k] ?? "").trim())
        return tr(`Dòng ${i + 1}: nhập ${label}.`, `Row ${i + 1}: ${label} is required.`);
    const x = extra?.(row);
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
    if (!String(d[k] ?? "").trim()) e[k] = tr(`Nhập ${vi}.`, `${en} is required.`);
  };
  req("legalType", "Legal Type", "Legal Type");
  req("taxCode", "Tax Code", "Tax Code");
  req("localName", "Local Name", "Local Name");
  req("englishName", "English Name", "English Name");
  req("localAddress", "Local Address", "Local Address");
  req("country", "Country", "Country");
  req("currency", "Def Currency", "Def Currency");
  req("businessCategory", "Business Category", "Business Category");
  req("partnerScope", "Partner Scope", "Partner Scope");

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

  if (d.email.trim() && !EMAIL.test(d.email.trim()))
    e["email"] = tr("Email không hợp lệ.", "Invalid email.");
  if (d.roles.length === 0)
    e["roles"] = tr("Chọn ít nhất một vai trò.", "Select at least one role.");

  const set = (k: string, msg: string | null) => msg && (e[k] = msg);
  set(
    "documents",
    checkRows(d.documents, blankDocument, [["docType", "Document Type"]], (r) =>
      r.issueDate && r.expiryDate && r.expiryDate < r.issueDate
        ? tr("Expiry Date phải sau Issue Date.", "Expiry Date must not be before Issue Date.")
        : null,
    ),
  );
  const common = (p: "customer" | "vendor") => {
    const prof = d[p];
    set(
      `${p}.contacts`,
      checkRows(
        prof.contacts,
        blankContact,
        [
          ["fullName", "Personal Contact"],
          ["mobile", "Phone Number"],
        ],
        (r) =>
          r.email && !EMAIL.test(r.email) ? tr("Email không hợp lệ.", "Invalid email.") : null,
      ),
    );
    set(
      `${p}.banks`,
      checkRows(prof.banks, blankBank, [
        ["bankCode", "Bank Code"],
        ["bankName", "Bank Name"],
        ["swiftCode", "SWIFT Code"],
        ["accountNo", "Account No."],
      ]),
    );
    set(
      `${p}.salesmen`,
      checkRows(prof.salesmen, blankSalesman, [
        ["serviceCode", "Service Code"],
        ["serviceName", "Service Name"],
      ]),
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
    common("customer");
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
    common("vendor");
  }
  return e;
}

// ---------------------------------------------------------------- Save

const SCALARS: [keyof BusinessPartnerRecord, string][] = [
  ["bpCode", "BP Code"],
  ["legalType", "Legal Type"],
  ["status", "Status"],
  ["taxCode", "Tax Code"],
  ["form", "Form"],
  ["invoiceSerial", "Invoice Serial"],
  ["localName", "Local Name"],
  ["englishName", "English Name"],
  ["localAddress", "Local Address"],
  ["englishAddress", "English Address"],
  ["country", "Country"],
  ["province", "Province"],
  ["postcode", "Postcode"],
  ["fax", "Fax"],
  ["email", "Email"],
  ["phone", "Phone Number"],
  ["invoiceLanguage", "Def Invoicing Language"],
  ["currency", "Def Currency"],
  ["businessCategory", "Business Category"],
  ["partnerScope", "Partner Scope"],
  ["serviceProviderType", "Service Provider Type"],
];

const pruned = <T extends { rid: string }>(rows: T[], blank: () => T) =>
  rows.filter((r) => !isBlankRow(r, blank));

export const businessPartnerService = {
  save(d: BusinessPartnerDraft, id?: string): BusinessPartnerRecord {
    const errors = validateBusinessPartner(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const roleOrder: BpRole[] = ["Customer", "Vendor", "Employee"];
    const clean = {
      ...d,
      bpCode: d.bpCode.trim().toUpperCase(),
      taxCode: d.taxCode.trim(),
      localName: d.localName.trim(),
      englishName: d.englishName.trim(),
      roles: roleOrder.filter((r) => d.roles.includes(r)),
      documents: pruned(d.documents, blankDocument),
      customer: {
        creditTerms: pruned(d.customer.creditTerms, blankCredit),
        contacts: pruned(d.customer.contacts, blankContact),
        banks: pruned(d.customer.banks, blankBank),
        salesmen: pruned(d.customer.salesmen, blankSalesman),
      },
      vendor: {
        paymentTerms: pruned(d.vendor.paymentTerms, blankPayment),
        contacts: pruned(d.vendor.contacts, blankContact),
        banks: pruned(d.vendor.banks, blankBank),
        salesmen: pruned(d.vendor.salesmen, blankSalesman),
      },
    };
    const existing = id ? businessPartnerRepository.get(id) : undefined;
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
    const diffs = SCALARS.filter(([k]) => existing[k] !== next[k]).map(([k, label]) => ({
      ...base,
      action: "UPDATE" as const,
      entityId: next.id,
      entityLabel: next.bpCode,
      field: label,
      oldValue: String(existing[k] ?? ""),
      newValue: String(next[k] ?? ""),
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
    const tablesChanged =
      JSON.stringify([existing.documents, existing.customer, existing.vendor]) !==
      JSON.stringify([next.documents, next.customer, next.vendor]);
    if (tablesChanged)
      diffs.push({
        ...base,
        action: "UPDATE",
        entityId: next.id,
        entityLabel: next.bpCode,
        field: "Tabs (Documents / Customer / Vendor)",
        oldValue: "",
        newValue: "Updated",
      });
    auditService.logMany(diffs);
    return next;
  },
};
