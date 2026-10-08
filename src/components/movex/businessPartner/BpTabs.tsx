import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
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
  woAccessState,
  type BusinessPartnerDraft,
  type WoAccessState,
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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EditableTable, type ColDef } from "./EditableTable";

type Draft = BusinessPartnerDraft;
type Errors = Record<string, string>;
interface TabProps {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
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

const STATE_TONE: Record<WoAccessState, string> = {
  Allowed: "bg-success-soft text-success",
  Locked: "bg-danger-soft text-destructive",
  Expired: "bg-danger-soft text-destructive",
  Default: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------- Documents & License

export function DocumentsTab({ d, set, errors }: TabProps) {
  const { t } = useT();
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
        note={t(
          "Giấy tờ pháp lý và hợp đồng của đối tác — luôn hiển thị.",
          "Legal papers and contracts of the partner — always shown.",
        )}
        rows={d.documents}
        onChange={(documents) => set({ documents })}
        blank={blankDocument}
        columns={cols}
        error={errors["documents"]}
      />
      <EditableTable
        title="License Adjustments"
        note={t(
          "Lịch sử điều chỉnh giấy phép kinh doanh: ngày điều chỉnh và nội dung thay đổi.",
          "Business license change history: adjustment date and what changed.",
        )}
        rows={d.licenseAdjustments}
        onChange={(licenseAdjustments) => set({ licenseAdjustments })}
        blank={blankLicense}
        columns={licenseCols}
        error={errors["licenseAdjustments"]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Contacts (profile)

export function ContactsTab({ d, set, errors }: TabProps) {
  const { t } = useT();
  const cols: ColDef<BpContact>[] = [
    { key: "fullName", label: "Name", required: true, width: 220, kind: "text" },
    {
      key: "position",
      label: "Position",
      width: 200,
      kind: "select",
      options: CONTACT_POSITIONS,
    },
    { key: "phone", label: "Phone", width: 160, kind: "text" },
    { key: "email", label: "Email", width: 240, kind: "text" },
    { key: "primaryContact", label: "Primary", width: 80, kind: "bool" },
  ];
  return (
    <EditableTable
      title="Contacts"
      note={t(
        "Người liên hệ của đối tác, dùng chung cho mọi vai trò. Chỉ một liên hệ chính.",
        "Contact persons of the partner, shared by every role. Only one primary contact.",
      )}
      rows={d.contacts}
      onChange={(contacts) => {
        // Ticking "Primary" on one contact unticks the others.
        const newly = contacts.find(
          (c) => c.primaryContact && !d.contacts.find((x) => x.rid === c.rid)?.primaryContact,
        );
        set({
          contacts: newly
            ? contacts.map((c) => (c.rid === newly.rid ? c : { ...c, primaryContact: false }))
            : contacts,
        });
      }}
      blank={blankContact}
      columns={cols}
      error={errors["contacts"]}
    />
  );
}

// ---------------------------------------------------------------- Sales Assignment (profile)

export function SalesAssignmentTab({ d, set, errors }: TabProps) {
  const { t } = useT();
  const svc = useServiceOptions();
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
      note={t(
        "Nhân viên phụ trách đối tác (theo danh mục nhân viên). Dịch vụ không bắt buộc.",
        "Staff in charge of the partner (from the staff master). Service is optional.",
      )}
      rows={d.salesAssignments}
      onChange={(salesAssignments) => set({ salesAssignments })}
      blank={blankSalesman}
      columns={cols}
      derive={(r, key, v) => {
        if (key === "staffName") {
          const e = EMPLOYEES.find((x) => x.name === v);
          return { staffId: e?.id ?? "", department: e ? departmentName(e.departmentId) : "" };
        }
        return svc.derive(r, key, v);
      }}
      error={errors["salesAssignments"]}
    />
  );
}

// ---------------------------------------------------------------- Bank accounts (per role)

function BankTable({ role, d, set, errors }: TabProps & { role: "customer" | "vendor" }) {
  const { t } = useT();
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
      note={t(
        `Tài khoản ngân hàng riêng của vai trò ${role === "customer" ? "Customer" : "Vendor"} — Customer và Vendor không dùng chung tài khoản.`,
        `Bank accounts of the ${role === "customer" ? "Customer" : "Vendor"} role only — Customer and Vendor do not share accounts.`,
      )}
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
  const { t } = useT();
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
        note={t(
          "Khách hàng hạch toán vào TK công nợ phải thu 131. Trước WO Access From: khoá tạo WO · trong khoảng From–To: cho phép · sau WO Access To: tự động khoá · không nhập From/To: áp dụng chính sách credit mặc định.",
          "Customer posts to receivable account 131. Before WO Access From: WO creation locked · between From–To: allowed · after WO Access To: auto-locked · no From/To: default credit policy applies.",
        )}
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
        extra={{
          label: "WO Creation",
          width: 120,
          render: (r) => {
            const s = woAccessState(r);
            return (
              <Badge variant="secondary" className={cn("font-semibold", STATE_TONE[s])}>
                {s === "Default" ? t("Mặc định", "Default") : s}
              </Badge>
            );
          },
        }}
        error={errors["customer.creditTerms"]}
      />
      <BankTable role="customer" d={d} set={set} errors={errors} />
    </div>
  );
}

// ---------------------------------------------------------------- Vendor (AP 331)

export function VendorTab({ d, set, errors }: TabProps) {
  const { t } = useT();
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
        note={t(
          "Nhà cung cấp hạch toán vào TK công nợ phải trả 331.",
          "Vendor posts to payable account 331.",
        )}
        rows={d.vendor.paymentTerms}
        onChange={(paymentTerms) => set({ vendor: { ...d.vendor, paymentTerms } })}
        blank={blankPayment}
        columns={cols}
        derive={svc.derive}
        error={errors["vendor.paymentTerms"]}
      />
      <BankTable role="vendor" d={d} set={set} errors={errors} />
    </div>
  );
}
