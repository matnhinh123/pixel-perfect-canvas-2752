// Business Partner master: dropdown catalogs (stand-ins for the future Common Code / Bank / Currency
// masters) and the demo seed shown in the list.
import type {
  BpContact,
  BpCreditTerm,
  BpPaymentTerm,
  BpSalesman,
  BusinessPartnerRecord,
} from "@/types";
import { EMPLOYEES, departmentName } from "./staff";

export const LEGAL_TYPES = ["Company", "Individual", "Representative"] as const;
export const COUNTRIES = ["Vietnam", "Singapore", "China", "Japan", "Korea", "Thailand", "USA"];
export const PROVINCES = [
  "Ho Chi Minh City",
  "Ha Noi",
  "Hai Phong",
  "Da Nang",
  "Binh Duong",
  "Dong Nai",
  "Can Tho",
];
export const CURRENCIES = ["VND", "USD", "EUR", "SGD", "JPY", "CNY"];
export const INVOICE_LANGUAGES = ["Vietnamese", "English", "Bilingual"];
export const BUSINESS_CATEGORIES = [
  "Logistics",
  "Manufacturing",
  "Trading",
  "Retail",
  "Shipping Line",
  "Airline",
  "Customs Broker",
  "Other",
];
export const PARTNER_SCOPES = ["Domestic", "International", "Both"];
export const PARTNER_GROUPS = ["Key Account", "SME", "Agent", "Carrier", "Supplier", "Internal"];
export const TAX_OPTIONS = ["VAT 10%", "VAT 8%", "VAT 5%", "VAT 0%", "Not subject to VAT"];
/** No tenant settings in the demo yet: the tenant's default currency. */
export const TENANT_DEFAULT_CURRENCY = "VND";
export const SERVICE_PROVIDER_TYPES = ["Carrier", "Forwarder", "Trucking", "Warehouse", "Agent"];
export const FORMS = ["01GTKT", "02GTTT", "01/TVE"];

export const BANKS = [
  { code: "VCB", name: "Vietcombank", swift: "BFTVVNVX" },
  { code: "TCB", name: "Techcombank", swift: "VTCBVNVX" },
  { code: "BIDV", name: "BIDV", swift: "BIDVVNVX" },
  { code: "ACB", name: "ACB", swift: "ASCBVNVX" },
  { code: "MB", name: "MB Bank", swift: "MSCBVNVX" },
];

/** Payment / credit term options (Customer credit terms, Vendor payment terms, profile default). */
export const CREDIT_TERMS = [
  "NET07",
  "NET15",
  "NET30",
  "NET45",
  "NET60",
  "COD",
  "Prepaid",
] as const;
export const WO_ACCESS_POLICIES = ["Temporary Allow", "Approval Required"] as const;
export const APPROVERS = ["Finance Manager", "Chief Accountant", "Finance Director"];
export const CONTACT_POSITIONS = [
  "Director",
  "Operations Contact",
  "Customs Contact",
  "Documentation Contact",
  "Accounting Contact",
  "Sales Contact",
];
export const DOC_TYPES = [
  "Business License",
  "Tax Registration",
  "Contract",
  "Authorization Letter",
  "Other",
];

const SEED_TIME = "2026-07-20T03:00:00.000Z";
const by = "Thuy Vu";
const meta = (at: string) => ({ createdAt: at, createdBy: by, updatedAt: at, updatedBy: by });

const credit = (
  rid: string,
  p: Partial<BpCreditTerm> & Pick<BpCreditTerm, "serviceCode" | "serviceName">,
): BpCreditTerm => ({
  rid,
  creditTerm: "NET30",
  creditDays: "30",
  creditLimit: "500000000",
  currency: "VND",
  woAccessFrom: "",
  woAccessTo: "",
  woAccessPolicy: "",
  autoLockAfterExpiry: true,
  approvedBy: "Finance Manager",
  status: "Active",
  ...p,
});
const pay = (
  rid: string,
  p: Partial<BpPaymentTerm> & Pick<BpPaymentTerm, "serviceCode" | "serviceName">,
): BpPaymentTerm => ({
  rid,
  paymentTerm: "NET15",
  currency: "VND",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  status: "Active",
  ...p,
});
/** Sales assignment from the staff master; the service is optional. */
const sales = (rid: string, staffId: string, serviceCode = "", serviceName = ""): BpSalesman => {
  const e = EMPLOYEES.find((x) => x.id === staffId);
  return {
    rid,
    staffId,
    staffName: e?.name ?? "",
    department: e ? departmentName(e.departmentId) : "",
    serviceCode,
    serviceName,
    remark: "",
  };
};
const contact = (rid: string, p: Partial<BpContact> & Pick<BpContact, "fullName">): BpContact => ({
  rid,
  position: "",
  phone: "",
  email: "",
  primaryContact: false,
  ...p,
});

type Seed = Partial<BusinessPartnerRecord> &
  Pick<
    BusinessPartnerRecord,
    "id" | "bpCode" | "taxCode" | "invoiceSerial" | "localName" | "englishName" | "email"
  >;

const bp = (s: Seed, at = SEED_TIME): BusinessPartnerRecord => ({
  status: "Active",
  legalType: "Company",
  inHouse: false,
  form: "01GTKT",
  localAddress: "",
  englishAddress: "",
  country: "Vietnam",
  province: "Ho Chi Minh City",
  postcode: "",
  fax: "",
  phone: "",
  invoiceLanguage: "Vietnamese",
  currency: "VND",
  currencies: ["VND"],
  businessCategory: ["Logistics"],
  partnerScope: "Domestic",
  partnerGroup: "SME",
  tax: "VAT 10%",
  serviceProviderType: "",
  defaultPaymentTerm: "NET30",
  creditLimit: "",
  creditLimitCurrency: "VND",
  note: "",
  roles: ["Customer"],
  contacts: [],
  salesAssignments: [],
  licenseAdjustments: [],
  documents: [],
  customer: { creditTerms: [], banks: [] },
  vendor: { paymentTerms: [], banks: [] },
  ...meta(at),
  ...s,
});

export const seedBusinessPartners = (): BusinessPartnerRecord[] => [
  bp(
    {
      id: "BP-1",
      bpCode: "MSGFREIGHT",
      taxCode: "0318629475",
      invoiceSerial: "C25MSG",
      localName: "Công ty TNHH Giao Nhận Mekong Saigon Freight Forwarding",
      englishName: "Mekong Saigon Freight Forwarding Co., Ltd.",
      email: "ops@mekongsaigonfreight.vn",
      localAddress: "45 Nguyễn Thị Minh Khai, Quận 1, TP.HCM",
      roles: ["Customer"],
      creditLimit: "500000000",
      contacts: [
        contact("k1", {
          fullName: "Lê Minh Tuấn",
          position: "Operations Contact",
          phone: "0938 345 678",
          email: "tuan.le@example.com",
          primaryContact: true,
        }),
      ],
      salesAssignments: [sales("s1", "E-006", "FRT-SEA", "Sea Freight")],
      customer: {
        creditTerms: [credit("c1", { serviceCode: "FRT-SEA", serviceName: "Sea Freight" })],
        banks: [],
      },
    },
    "2026-05-04T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-2",
      bpCode: "NPA",
      taxCode: "0319054826",
      invoiceSerial: "C25NPA",
      localName: "Công Ty TNHH Tiếp Vận Nam Phương Anh Logistics",
      englishName: "Nam Phuong Anh Logistics Company Limited",
      email: "contact@npalogistics.vn",
      roles: ["Vendor"],
      serviceProviderType: "Trucking",
      defaultPaymentTerm: "NET15",
      businessCategory: ["Logistics", "Other"],
      vendor: {
        paymentTerms: [
          pay("p1", {
            serviceCode: "TRK-IN",
            serviceName: "Inland Trucking",
            paymentTerm: "NET15",
          }),
        ],
        banks: [],
      },
    },
    "2026-05-18T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-3",
      bpCode: "HPLAL",
      taxCode: "0109982743",
      invoiceSerial: "C25HPL",
      localName: "Công Ty Cổ Phần Logistics Hải Phòng Long An",
      englishName: "Hai Phong Long An Logistics Joint Stock Company",
      email: "ops@hpllogistics.vn",
      province: "Hai Phong",
      roles: ["Customer", "Vendor"],
    },
    "2026-06-02T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-4",
      bpCode: "DONGMINH",
      taxCode: "0318846207",
      invoiceSerial: "C25DMT",
      localName: "Công Ty TNHH Thương Mại Dịch Vụ Đông Minh",
      englishName: "Dong Minh Trading Service Company Limited",
      email: "admin@dongminhtrading.vn",
      businessCategory: ["Trading", "Retail"],
      roles: ["Customer"],
      creditLimit: "200000000",
      licenseAdjustments: [
        {
          rid: "l1",
          adjustmentDate: "2026-03-12",
          changeContent: "Head office address changed to District 7, Ho Chi Minh City",
          documentNo: "GPKD-0318846207-03",
        },
      ],
    },
    "2026-06-15T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-5",
      bpCode: "DEMO01",
      taxCode: "0315471258",
      invoiceSerial: "C26/DEM",
      localName: "CÔNG TY TNHH DEMO01 (HUNGNTH) LTD COMPANY",
      englishName: "DEMO01 (HUNGNTH) LTD COMPANY",
      email: "admin@testdemo01.vn",
      roles: ["Customer", "Vendor"],
    },
    "2026-07-08T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-6",
      bpCode: "QTL",
      taxCode: "0316497684",
      invoiceSerial: "C26TRK",
      localName: "Công ty TNHH QTL Logistics",
      englishName: "QTL Logistics Co Ltd.",
      email: "lam@gmail.com",
      roles: ["Customer", "Vendor"],
      partnerScope: "Both",
      currencies: ["VND", "USD"],
      businessCategory: ["Logistics", "Customs Broker"],
      creditLimit: "750000000",
      note: "Key account — trucking and customs.",
      contacts: [
        contact("k1", {
          fullName: "Nguyễn Văn Hùng",
          position: "Operations Contact",
          phone: "0909 123 456",
          email: "hung.nguyen@example.com",
          primaryContact: true,
        }),
        contact("k2", {
          fullName: "Trần Thị Lan",
          position: "Customs Contact",
          phone: "0918 234 567",
          email: "lan.tran@example.com",
        }),
      ],
      salesAssignments: [sales("s1", "E-006", "TRK-IN", "Inland Trucking"), sales("s2", "E-001")],
      customer: {
        creditTerms: [
          credit("c1", {
            serviceCode: "TRK-IN",
            serviceName: "Inland Trucking",
            woAccessFrom: "2026-07-24T08:00",
            woAccessTo: "2026-07-31T17:00",
            woAccessPolicy: "Temporary Allow",
          }),
          credit("c2", {
            serviceCode: "CUS-IM",
            serviceName: "Import Customs",
            creditTerm: "NET15",
            creditDays: "15",
            creditLimit: "200000000",
            woAccessFrom: "2026-07-25T00:00",
            woAccessTo: "2026-07-27T23:59",
            woAccessPolicy: "Approval Required",
            approvedBy: "Chief Accountant",
          }),
          credit("c3", {
            serviceCode: "FRT-SEA",
            serviceName: "Sea Freight",
            creditTerm: "NET45",
            creditDays: "45",
            creditLimit: "50000",
            currency: "USD",
            woAccessFrom: "2026-08-01T08:00",
            woAccessTo: "2026-08-15T18:00",
            woAccessPolicy: "Temporary Allow",
            approvedBy: "Finance Director",
            status: "Scheduled",
          }),
        ],
        banks: [
          {
            rid: "b1",
            bankCode: "VCB",
            bankName: "Vietcombank",
            swiftCode: "BFTVVNVX",
            bankBranch: "HCM",
            bankAddress: "5 Công Trường Mê Linh, Q1",
            bankCountry: "Vietnam",
            accountNo: "0071001234567",
            accountHolder: "QTL LOGISTICS CO LTD",
            currency: "VND",
          },
        ],
      },
      vendor: {
        paymentTerms: [
          pay("p1", { serviceCode: "TRK-IN", serviceName: "Inland Trucking" }),
          pay("p2", {
            serviceCode: "CUS-IM",
            serviceName: "Import Customs",
            paymentTerm: "NET30",
          }),
          pay("p3", {
            serviceCode: "FRT-SEA",
            serviceName: "Sea Freight",
            paymentTerm: "NET45",
            currency: "USD",
          }),
        ],
        banks: [],
      },
    },
    "2026-07-20T03:00:00.000Z",
  ),
];
