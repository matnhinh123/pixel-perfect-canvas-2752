import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "@/hooks/use-store";
import { serviceRepository } from "@/repositories";
import {
  APPROVERS,
  BANKS,
  BRANCHES,
  CONTACT_ROLES,
  COUNTRIES,
  CREDIT_TERMS,
  CURRENCIES,
  DEPARTMENTS,
  DOC_TYPES,
  GENDERS,
  SALESMEN,
  WO_ACCESS_POLICIES,
} from "@/mock-data/businessPartners";
import {
  blankBank,
  blankContact,
  blankCredit,
  blankDocument,
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
  BpPaymentTerm,
  BpSalesman,
} from "@/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EditableTable, type ColDef } from "./EditableTable";

type Draft = BusinessPartnerDraft;
type Errors = Record<string, string>;

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

// ---------------------------------------------------------------- Documents

export function DocumentsTab({
  d,
  set,
  errors,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}) {
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
    { key: "remark", label: "Remark", width: 180, kind: "text" },
  ];
  return (
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
  );
}

// ---------------------------------------------------------------- Shared role tables

function RoleTables({
  role,
  d,
  set,
  errors,
}: {
  role: "customer" | "vendor";
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}) {
  const { t } = useT();
  const svc = useServiceOptions();
  const prof = d[role];
  const patch = (p: Partial<typeof prof>) => set({ [role]: { ...prof, ...p } } as Partial<Draft>);

  const contactCols: ColDef<BpContact>[] = [
    { key: "serviceCode", label: "Service Code", width: 170, kind: "select", options: svc.codes },
    { key: "serviceName", label: "Service Name", width: 190, kind: "select", options: svc.names },
    { key: "gender", label: "Gender", width: 100, kind: "select", options: GENDERS },
    { key: "fullName", label: "Personal Contact", required: true, width: 200, kind: "text" },
    { key: "identityNo", label: "National ID", width: 150, kind: "text" },
    { key: "telephone", label: "Landline", width: 150, kind: "text" },
    { key: "mobile", label: "Phone Number", required: true, width: 150, kind: "text" },
    { key: "contactRole", label: "Role", width: 190, kind: "select", options: CONTACT_ROLES },
    { key: "email", label: "Email", width: 210, kind: "text" },
    { key: "address", label: "Address", width: 240, kind: "text" },
    { key: "primaryContact", label: "Primary", width: 80, kind: "bool" },
    { key: "status", label: "Status", width: 120, kind: "select", options: ["Active", "Inactive"] },
  ];
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
  const salesCols: ColDef<BpSalesman>[] = [
    {
      key: "serviceCode",
      label: "Service Code",
      required: true,
      width: 170,
      kind: "select",
      options: svc.codes,
    },
    {
      key: "serviceName",
      label: "Service Name",
      required: true,
      width: 190,
      kind: "select",
      options: svc.names,
    },
    {
      key: "salesCode",
      label: "Code Salesman",
      width: 180,
      kind: "select",
      options: SALESMEN.map((s) => s.code),
    },
    {
      key: "salesName",
      label: "Name Salesman",
      width: 200,
      kind: "select",
      options: SALESMEN.map((s) => s.name),
    },
    { key: "remark", label: "Remark", width: 200, kind: "text" },
    { key: "branch", label: "Office/Branch", width: 150, kind: "select", options: BRANCHES },
    { key: "department", label: "Department", width: 170, kind: "select", options: DEPARTMENTS },
  ];

  return (
    <>
      <EditableTable
        title="Contact Information"
        rows={prof.contacts}
        onChange={(contacts) => patch({ contacts })}
        blank={blankContact}
        columns={contactCols}
        derive={svc.derive}
        error={errors[`${role}.contacts`]}
      />
      <EditableTable
        title="Bank Account"
        rows={prof.banks}
        onChange={(banks) => patch({ banks })}
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
      <EditableTable
        title="Salesman"
        note={t("Nhân viên kinh doanh phụ trách theo dịch vụ.", "Salesman in charge per service.")}
        rows={prof.salesmen}
        onChange={(salesmen) => patch({ salesmen })}
        blank={blankSalesman}
        columns={salesCols}
        derive={(r, key, v) => {
          if (key === "salesCode")
            return { salesName: SALESMEN.find((s) => s.code === v)?.name ?? "" };
          if (key === "salesName")
            return { salesCode: SALESMEN.find((s) => s.name === v)?.code ?? "" };
          return svc.derive(r, key, v);
        }}
        error={errors[`${role}.salesmen`]}
      />
    </>
  );
}

// ---------------------------------------------------------------- Customer (AR 131)

export function CustomerTab({
  d,
  set,
  errors,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}) {
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
      <RoleTables role="customer" d={d} set={set} errors={errors} />
    </div>
  );
}

// ---------------------------------------------------------------- Vendor (AP 331)

export function VendorTab({
  d,
  set,
  errors,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  errors: Errors;
}) {
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
      <RoleTables role="vendor" d={d} set={set} errors={errors} />
    </div>
  );
}
