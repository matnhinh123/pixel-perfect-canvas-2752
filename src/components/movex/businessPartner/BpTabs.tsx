import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  DEPARTMENTS as STAFF_DEPARTMENTS,
  EMPLOYEES,
  departmentName,
  leaderNameOf,
} from "@/mock-data/staff";
import {
  blankBank,
  blankContact,
  blankCredit,
  blankDocument,
  blankPayment,
  blankSalesman,
  type BusinessPartnerDraft,
} from "@/services/businessPartnerService";
import type {
  BpBankAccount,
  BpContact,
  BpCreditTerm,
  BpDocument,
  BpPaymentTerm,
  BpSalesman,
} from "@/types";
import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { cn, joinList, splitList } from "@/lib/utils";
import { EditableTable, type ColDef } from "./EditableTable";

type Draft = BusinessPartnerDraft;
type Errors = Record<string, string>;
interface TabProps {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}
type Role = "customer" | "vendor";

/**
 * Sub menu of a role tab: one table at a time instead of four stacked ones. A section with a
 * validation error shows a red dot, and the menu jumps to the first such section after a save.
 */
function SectionMenu({
  sections,
  errors,
}: {
  sections: { key: string; label: string; errorKey: string; body: ReactNode }[];
  errors: Errors;
}) {
  const [active, setActive] = useState(sections[0]!.key);
  const withError = sections.filter((x) => errors[x.errorKey]).map((x) => x.key);
  const errorSig = withError.join("|");
  useEffect(() => {
    if (withError.length && !withError.includes(active)) setActive(withError[0]!);
    // Only when the set of sections with errors changes (i.e. after a save attempt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorSig]);
  const current = sections.find((x) => x.key === active) ?? sections[0]!;
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/60 p-1">
        {sections.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={x.key === current.key}
            onClick={() => setActive(x.key)}
            className={cn(
              "relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              x.key === current.key
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {x.label}
            {errors[x.errorKey] && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current.body}</div>
    </div>
  );
}

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
      nameOf: (code: string) => byCode.get(code) ?? "",
      /** Several services per row (Sales Assignment): the picked codes and names stay paired. */
      deriveMany: <T extends { serviceCode: string; serviceName: string }>(
        _r: T,
        key: string,
        v: unknown,
      ): Partial<T> => {
        if (key === "serviceCode")
          return {
            serviceName: joinList(
              splitList(v)
                .map((c) => byCode.get(c) ?? "")
                .filter(Boolean),
            ),
          } as Partial<T>;
        if (key === "serviceName")
          return {
            serviceCode: joinList(
              splitList(v)
                .map((n) => byName.get(n) ?? "")
                .filter(Boolean),
            ),
          } as Partial<T>;
        return {};
      },
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

// ---------------------------------------------------------------- Documents

export function DocumentsTab({ d, set, errors }: TabProps) {
  const docTypes = useCodeOptions(CC.DOCUMENT_TYPE, DOC_TYPES);
  const cols: ColDef<BpDocument>[] = [
    {
      key: "docType",
      label: "Document Type",
      required: true,
      width: 170,
      kind: "select",
      options: docTypes,
    },
    { key: "docName", label: "Document Name", width: 200, kind: "text" },
    { key: "validDate", label: "Valid Date", width: 140, kind: "date" },
    { key: "expiryDate", label: "Expiry Date", width: 140, kind: "date" },
    { key: "fileName", label: "Attachment", width: 220, kind: "file" },
    { key: "remark", label: "Remark", width: 180, kind: "text" },
  ];
  return (
    <EditableTable
      title="Documents"
      rows={d.documents}
      onChange={(documents) => set({ documents })}
      blank={blankDocument}
      columns={cols}
      error={errors["documents"]}
    />
  );
}

// ---------------------------------------------------------------- Contact Info (per role)

function ContactTable({ role, d, set, errors }: TabProps & { role: Role }) {
  const genders = useCodeOptions(CC.GENDER, GENDERS);
  const contactRoles = useCodeOptions(CC.CONTACT_ROLE, CONTACT_POSITIONS);
  const svc = useServiceOptions();
  const prof = d[role];
  const cols: ColDef<BpContact>[] = [
    { key: "serviceCode", label: "Service Code", width: 160, kind: "select", options: svc.codes },
    { key: "serviceName", label: "Service Name", width: 180, kind: "select", options: svc.names },
    { key: "gender", label: "Gender", width: 100, kind: "select", options: genders },
    { key: "fullName", label: "Full Name", width: 200, kind: "text" },
    { key: "identityNo", label: "Identity No.", width: 150, kind: "text" },
    { key: "telephone", label: "Telephone", width: 150, kind: "text" },
    { key: "mobilePhone", label: "Mobile Phone", width: 150, kind: "text" },
    {
      key: "contactRole",
      label: "Contact Role",
      width: 190,
      kind: "select",
      options: contactRoles,
    },
    { key: "email", label: "Email", width: 220, kind: "text" },
    { key: "address", label: "Address", width: 240, kind: "text" },
    { key: "primaryContact", label: "Primary Contact", width: 110, kind: "bool" },
    { key: "status", label: "Status", width: 120, kind: "select", options: ["Active", "Inactive"] },
    { key: "remark", label: "Remark", width: 220, kind: "text" },
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
  /** Both service cells preview the same "code — name" pairs. */
  const servicePreview = (r: BpSalesman) => (
    <ul className="space-y-1 text-[13px]">
      {splitList(r.serviceCode).map((c, i) => (
        <li key={c} className="flex gap-2">
          <span className="font-medium text-primary">{c}</span>
          <span>{svc.nameOf(c) || splitList(r.serviceName)[i] || "—"}</span>
        </li>
      ))}
    </ul>
  );
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
    { key: "leader", label: "Leader", width: 180, kind: "readonly" },
    {
      key: "serviceCode",
      label: "Service Code",
      width: 170,
      kind: "multiselect",
      options: svc.codes,
      preview: servicePreview,
    },
    {
      key: "serviceName",
      label: "Service Name",
      width: 220,
      kind: "multiselect",
      options: svc.names,
      preview: servicePreview,
    },
    { key: "remark", label: "Remark", width: 240, kind: "text" },
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
          return {
            staffId: e?.id ?? "",
            leader: e ? leaderNameOf(e.id) : "",
            department: e ? departmentName(e.departmentId) : "",
          };
        }
        return svc.deriveMany(r, key, v);
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
    { key: "accountNo", label: "Account No.", required: true, width: 170, kind: "text" },
    { key: "accountHolder", label: "Account Holder", required: true, width: 200, kind: "text" },
    { key: "bankBranch", label: "Bank Branch", width: 160, kind: "text" },
    { key: "bankAddress", label: "Bank Address", width: 200, kind: "text" },
    { key: "bankCountry", label: "Bank Country", width: 160, kind: "select", options: COUNTRIES },
    { key: "currency", label: "Currency", width: 110, kind: "select", options: CURRENCIES },
    { key: "remark", label: "Remark", width: 220, kind: "text" },
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
          ? { bankCode: b?.code ?? "", bankName: b?.name ?? "" }
          : {};
      }}
      error={errors[`${role}.banks`]}
    />
  );
}

// ---------------------------------------------------------------- Customer (AR 131)

/** Contact Info, Bank Account and Sales Assignment sections of a role tab. */
const roleSections = (role: Role, d: Draft, set: TabProps["set"], errors: Errors) => [
  {
    key: "contacts",
    label: "Contact Info",
    errorKey: `${role}.contacts`,
    body: <ContactTable role={role} d={d} set={set} errors={errors} />,
  },
  {
    key: "banks",
    label: "Bank Account",
    errorKey: `${role}.banks`,
    body: <BankTable role={role} d={d} set={set} errors={errors} />,
  },
  {
    key: "sales",
    label: "Sales Assignment",
    errorKey: `${role}.salesmen`,
    body: <SalesTable role={role} d={d} set={set} errors={errors} />,
  },
];

export function CustomerTab({ d, set, errors }: TabProps) {
  const terms = useCodeOptions(CC.PAYMENT_TERM, CREDIT_TERMS);
  const policies = useCodeOptions(CC.WO_ACCESS_POLICY, WO_ACCESS_POLICIES);
  const approvers = useCodeOptions(CC.APPROVER, APPROVERS);
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
      options: terms,
    },
    { key: "creditDays", label: "Credit Days", width: 130, kind: "number", suffix: "Day" },
    // Amounts are in the partner Currency of General Information.
    {
      key: "creditLimit",
      label: "Credit Limit",
      width: 190,
      kind: "number",
      suffix: d.currency || "VND",
    },
    { key: "woAccessFrom", label: "WO Access From", width: 200, kind: "datetime" },
    { key: "woAccessTo", label: "WO Access To", width: 200, kind: "datetime" },
    {
      key: "woAccessPolicy",
      label: "WO Access Policy",
      width: 180,
      kind: "select",
      options: policies,
    },
    { key: "autoLockAfterExpiry", label: "Auto Lock After Expiry", width: 130, kind: "bool" },
    { key: "approvedBy", label: "Approved By", width: 180, kind: "select", options: approvers },
    {
      key: "status",
      label: "Status",
      width: 130,
      kind: "select",
      options: ["Active", "Scheduled", "Inactive"],
    },
    { key: "remark", label: "Remark", width: 220, kind: "text" },
  ];
  return (
    <SectionMenu
      errors={errors}
      sections={[
        {
          key: "credit",
          label: "Credit Term",
          errorKey: "customer.creditTerms",
          body: (
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
          ),
        },
        ...roleSections("customer", d, set, errors),
      ]}
    />
  );
}

// ---------------------------------------------------------------- Vendor (AP 331)

export function VendorTab({ d, set, errors }: TabProps) {
  const terms = useCodeOptions(CC.PAYMENT_TERM, CREDIT_TERMS);
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
      options: terms,
    },
    { key: "effectiveFrom", label: "Effective From", width: 160, kind: "date" },
    { key: "effectiveTo", label: "Effective To", width: 160, kind: "date" },
    { key: "status", label: "Status", width: 120, kind: "select", options: ["Active", "Inactive"] },
    { key: "remark", label: "Remark", width: 220, kind: "text" },
  ];
  return (
    <SectionMenu
      errors={errors}
      sections={[
        {
          key: "payment",
          label: "Payment Term",
          errorKey: "vendor.paymentTerms",
          body: (
            <EditableTable
              title="Payment Term"
              rows={d.vendor.paymentTerms}
              onChange={(paymentTerms) => set({ vendor: { ...d.vendor, paymentTerms } })}
              blank={blankPayment}
              columns={cols}
              derive={svc.derive}
              error={errors["vendor.paymentTerms"]}
            />
          ),
        },
        // Vendors have no Sales Assignment.
        ...roleSections("vendor", d, set, errors).filter((x) => x.key !== "sales"),
      ]}
    />
  );
}
