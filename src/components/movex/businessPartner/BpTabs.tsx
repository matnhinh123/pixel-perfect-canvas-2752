import { useMemo } from "react";
import { useCollection } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import {
  APPROVERS,
  BANKS,
  CONTACT_POSITIONS,
  COUNTRIES,
  CREDIT_TERMS,
  CURRENCIES,
  DOC_TYPES,
  GENDERS,
  WO_ACCESS_POLICIES,
} from "@/mock-data/businessPartners";
import { DEPARTMENTS as STAFF_DEPARTMENTS, EMPLOYEES, departmentName } from "@/mock-data/staff";
import {
  blankBank,
  blankContact,
  blankCredit,
  blankDocument,
  blankLicense,
  blankPayment,
  blankSalesman,
  type BusinessPartnerDraft,
} from "@/services/businessPartnerService";
import type {
  BpBankAccount,
  BpContact,
  BpCreditTerm,
  BpDocument,
  BpLicenseAdjustment,
  BpPaymentTerm,
  BpSalesman,
} from "@/types";
import { EditableTable, type ColDef } from "./EditableTable";

type Draft = BusinessPartnerDraft;
type Errors = Record<string, string>;
interface TabProps {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}
type Role = "customer" | "vendor";

/** Active services (code + name) offered by every "Service Code / Service Name" cell. */
function useServiceOptions() {
  const all = useCollection(serviceRepository);
  return useMemo(() => {
    const live = all.filter((s) => !s.deleted && s.status === "Active");
    const byCode = new Map(live.map((s) => [s.code, s.name]));
    const byName = new Map(live.map((s) => [s.name, s.code]));
    return {
      codes: [...byCode.keys()],
      names: [...byName.keys()],
      /** Picking a code fills the name and vice versa. */
      derive: <T extends { serviceCode: string; serviceName: string }>(
        _r: T,
        key: string,
        v: unknown,
      ): Partial<T> => {
        if (key === "serviceCode")
          return { serviceName: byCode.get(String(v)) ?? "" } as Partial<T>;
        if (key === "serviceName")
          return { serviceCode: byName.get(String(v)) ?? "" } as Partial<T>;
        return {};
      },
    };
  }, [all]);
}

// ---------------------------------------------------------------- Documents & License

export function DocumentsTab({ d, set, errors }: TabProps) {
  const cols: ColDef<BpDocument>[] = [
    {
      key: "docType",
      label: "Document Type",
      required: true,
      width: 170,
      kind: "select",
      options: DOC_TYPES,
    },
    { key: "docNo", label: "Document No.", width: 140, kind: "text" },
    { key: "issueDate", label: "Issue Date", width: 140, kind: "date" },
    { key: "expiryDate", label: "Expiry Date", width: 140, kind: "date" },
    { key: "fileName", label: "Attachment", width: 170, kind: "text" },
    { key: "remark", label: "Notes", width: 180, kind: "text" },
  ];
  const licenseCols: ColDef<BpLicenseAdjustment>[] = [
    { key: "adjustmentDate", label: "Adjustment Date", required: true, width: 160, kind: "date" },
    { key: "changeContent", label: "Change Content", required: true, width: 360, kind: "text" },
    { key: "documentNo", label: "Document No.", width: 180, kind: "text" },
  ];
  return (
    <div className="space-y-4">
      <EditableTable
        title="Documents"
        rows={d.documents}
        onChange={(documents) => set({ documents })}
        blank={blankDocument}
        columns={cols}
        error={errors["documents"]}
      />
      <EditableTable
        title="License Adjustments"
        rows={d.licenseAdjustments}
        onChange={(licenseAdjustments) => set({ licenseAdjustments })}
        blank={blankLicense}
        columns={licenseCols}
        error={errors["licenseAdjustments"]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Contact Info (per role)

function ContactTable({ role, d, set, errors }: TabProps & { role: Role }) {
  const svc = useServiceOptions();
  const prof = d[role];
  const cols: ColDef<BpContact>[] = [
    { key: "serviceCode", label: "Service Code", width: 160, kind: "select", options: svc.codes },
    { key: "serviceName", label: "Service Name", width: 180, kind: "select", options: svc.names },
    { key: "gender", label: "Gender", width: 100, kind: "select", options: GENDERS },
    { key: "fullName", label: "Full Name", required: true, width: 200, kind: "text" },
    { key: "identityNo", label: "Identity No.", width: 150, kind: "text" },
    { key: "telephone", label: "Telephone", width: 150, kind: "text" },
    { key: "mobilePhone", label: "Mobile Phone", width: 150, kind: "text" },
    {
      key: "contactRole",
      label: "Contact Role",
      width: 190,
      kind: "select",
      options: CONTACT_POSITIONS,
    },
    { key: "email", label: "Email", width: 220, kind: "text" },
    { key: "address", label: "Address", width: 240, kind: "text" },
    { key: "primaryContact", label: "Primary Contact", width: 110, kind: "bool" },
    { key: "status", label: "Status", width: 120, kind: "select", options: ["Active", "Inactive"] },
  ];
  return (
    <EditableTable
      title="Contact Info"
      rows={prof.contacts}
      onChange={(contacts) => {
        // Ticking "Primary Contact" on one row unticks the others.
        const newly = contacts.find(
          (c) => c.primaryContact && !prof.contacts.find((x) => x.rid === c.rid)?.primaryContact,
        );
        set({
          [role]: {
            ...prof,
            contacts: newly
              ? contacts.map((c) => (c.rid === newly.rid ? c : { ...c, primaryContact: false }))
              : contacts,
          },
        } as Partial<Draft>);
      }}
      blank={blankContact}
      columns={cols}
      derive={svc.derive}
      error={errors[`${role}.contacts`]}
    />
  );
}

// ---------------------------------------------------------------- Sales Assignment (per role)

function SalesTable({ role, d, set, errors }: TabProps & { role: Role }) {
  const svc = useServiceOptions();
  const prof = d[role];
  const cols: ColDef<BpSalesman>[] = [
    {
      key: "staffName",
      label: "Staff",
      required: true,
      width: 210,
      kind: "select",
      options: EMPLOYEES.map((e) => e.name),
    },
    {
      key: "department",
      label: "Department",
      width: 170,
      kind: "select",
      options: STAFF_DEPARTMENTS.map((x) => x.name),
    },
    { key: "serviceCode", label: "Service Code", width: 170, kind: "select", options: svc.codes },
    { key: "serviceName", label: "Service Name", width: 190, kind: "select", options: svc.names },
    { key: "remark", label: "Notes", width: 220, kind: "text" },
  ];
  return (
    <EditableTable
      title="Sales Assignment"
      rows={prof.salesmen}
      onChange={(salesmen) => set({ [role]: { ...prof, salesmen } } as Partial<Draft>)}
      blank={blankSalesman}
      columns={cols}
      derive={(r, key, v) => {
        if (key === "staffName") {
          const e = EMPLOYEES.find((x) => x.name === v);
          return { staffId: e?.id ?? "", department: e ? departmentName(e.departmentId) : "" };
        }
        return svc.derive(r, key, v);
      }}
      error={errors[`${role}.salesmen`]}
    />
  );
}

// ---------------------------------------------------------------- Bank accounts (per role)

function BankTable({ role, d, set, errors }: TabProps & { role: Role }) {
  const prof = d[role];
  const bankCols: ColDef<BpBankAccount>[] = [
    {
      key: "bankCode",
      label: "Bank Code",
      required: true,
      width: 150,
      kind: "select",
      options: BANKS.map((b) => b.code),
    },
    {
      key: "bankName",
      label: "Bank Name",
      required: true,
      width: 170,
      kind: "select",
      options: BANKS.map((b) => b.name),
    },
    { key: "swiftCode", label: "SWIFT Code", required: true, width: 150, kind: "text" },
    { key: "bankBranch", label: "Bank Branch", width: 160, kind: "text" },
    { key: "bankAddress", label: "Bank Address", width: 200, kind: "text" },
    { key: "bankCountry", label: "Bank Country", width: 160, kind: "select", options: COUNTRIES },
    { key: "accountNo", label: "Account No.", required: true, width: 170, kind: "text" },
    { key: "accountHolder", label: "Account Holder", width: 200, kind: "text" },
    { key: "currency", label: "Currency", width: 110, kind: "select", options: CURRENCIES },
  ];
  return (
    <EditableTable
      title="Bank Account"
      rows={prof.banks}
      onChange={(banks) => set({ [role]: { ...prof, banks } } as Partial<Draft>)}
      blank={blankBank}
      columns={bankCols}
      derive={(_r, key, v) => {
        const b = BANKS.find((x) => (key === "bankCode" ? x.code : x.name) === v);
        return key === "bankCode" || key === "bankName"
          ? { bankCode: b?.code ?? "", bankName: b?.name ?? "", swiftCode: b?.swift ?? "" }
          : {};
      }}
      error={errors[`${role}.banks`]}
    />
  );
}

// ---------------------------------------------------------------- Customer (AR 131)

export function CustomerTab({ d, set, errors }: TabProps) {
  const svc = useServiceOptions();
  const cols: ColDef<BpCreditTerm>[] = [
    {
      key: "serviceCode",
      label: "Service Code",
      required: true,
      width: 170,
      kind: "select",
      options: svc.codes,
    },
    { key: "serviceName", label: "Service Name", width: 190, kind: "select", options: svc.names },
    {
      key: "creditTerm",
      label: "Credit Term",
      required: true,
      width: 140,
      kind: "select",
      options: CREDIT_TERMS,
    },
    { key: "creditDays", label: "Credit Days", width: 130, kind: "number", suffix: "Day" },
    { key: "creditLimit", label: "Credit Limit", width: 170, kind: "number" },
    { key: "currency", label: "Currency", width: 110, kind: "select", options: CURRENCIES },
    { key: "woAccessFrom", label: "WO Access From", width: 200, kind: "datetime" },
    { key: "woAccessTo", label: "WO Access To", width: 200, kind: "datetime" },
    {
      key: "woAccessPolicy",
      label: "WO Access Policy",
      width: 180,
      kind: "select",
      options: WO_ACCESS_POLICIES,
    },
    { key: "autoLockAfterExpiry", label: "Auto Lock After Expiry", width: 130, kind: "bool" },
    { key: "approvedBy", label: "Approved By", width: 180, kind: "select", options: APPROVERS },
    {
      key: "status",
      label: "Status",
      width: 130,
      kind: "select",
      options: ["Active", "Scheduled", "Inactive"],
    },
  ];
  return (
    <div className="space-y-4">
      <EditableTable
        title="Credit Term"
        rows={d.customer.creditTerms}
        onChange={(creditTerms) => set({ customer: { ...d.customer, creditTerms } })}
        blank={blankCredit}
        columns={cols}
        derive={(r, key, v) => {
          if (key === "creditTerm") {
            const days = /^NET(\d+)$/.exec(String(v));
            return { creditDays: days ? String(Number(days[1])) : v ? "0" : "" };
          }
          return svc.derive(r, key, v);
        }}
        error={errors["customer.creditTerms"]}
      />
      <ContactTable role="customer" d={d} set={set} errors={errors} />
      <BankTable role="customer" d={d} set={set} errors={errors} />
      <SalesTable role="customer" d={d} set={set} errors={errors} />
    </div>
  );
}

// ---------------------------------------------------------------- Vendor (AP 331)

export function VendorTab({ d, set, errors }: TabProps) {
  const svc = useServiceOptions();
  const cols: ColDef<BpPaymentTerm>[] = [
    {
      key: "serviceCode",
      label: "Service Code",
      required: true,
      width: 170,
      kind: "select",
      options: svc.codes,
    },
    { key: "serviceName", label: "Service Name", width: 190, kind: "select", options: svc.names },
    {
      key: "paymentTerm",
      label: "Payment Term",
      required: true,
      width: 150,
      kind: "select",
      options: CREDIT_TERMS,
    },
    { key: "currency", label: "Currency", width: 110, kind: "select", options: CURRENCIES },
    { key: "effectiveFrom", label: "Effective From", width: 160, kind: "date" },
    { key: "effectiveTo", label: "Effective To", width: 160, kind: "date" },
    { key: "status", label: "Status", width: 120, kind: "select", options: ["Active", "Inactive"] },
  ];
  return (
    <div className="space-y-4">
      <EditableTable
        title="Payment Term"
        rows={d.vendor.paymentTerms}
        onChange={(paymentTerms) => set({ vendor: { ...d.vendor, paymentTerms } })}
        blank={blankPayment}
        columns={cols}
        derive={svc.derive}
        error={errors["vendor.paymentTerms"]}
      />
      <ContactTable role="vendor" d={d} set={set} errors={errors} />
      <BankTable role="vendor" d={d} set={set} errors={errors} />
      <SalesTable role="vendor" d={d} set={set} errors={errors} />
    </div>
  );
}
