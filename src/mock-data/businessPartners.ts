// Business Partner master: dropdown catalogs (stand-ins for the future Common Code / Bank / Currency
// masters) and the demo seed shown in the list.
import type {
  BpContact,
  BpCreditTerm,
  BpPaymentTerm,
  BpSalesman,
  BusinessPartnerRecord,
} from "@/types";
import { EMPLOYEES, departmentName, leaderNameOf } from "./staff";

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
/** Province / state options per Country (the Province select only offers those of the chosen Country). */
export const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
  Vietnam: PROVINCES,
  Singapore: ["Central Region", "East Region", "North Region", "North-East Region", "West Region"],
  China: [
    "Beijing",
    "Shanghai",
    "Tianjin",
    "Guangdong",
    "Zhejiang",
    "Jiangsu",
    "Shandong",
    "Fujian",
  ],
  Japan: ["Tokyo", "Osaka", "Kanagawa", "Aichi", "Hyogo", "Fukuoka", "Hokkaido"],
  Korea: ["Seoul", "Busan", "Incheon", "Gyeonggi", "Daegu", "Ulsan"],
  Thailand: ["Bangkok", "Chon Buri", "Samut Prakan", "Rayong", "Chiang Mai", "Songkhla"],
  USA: ["California", "New York", "Texas", "Washington", "Illinois", "Florida", "New Jersey"],
};
export const provincesOf = (country: string) => PROVINCES_BY_COUNTRY[country] ?? [];
export const CURRENCIES = ["VND", "USD", "EUR", "SGD", "JPY", "CNY"];
export const INVOICE_LANGUAGES = ["Vietnamese", "English", "Bilingual"];
/** Business Category options, in the order of the design; the earlier values follow. */
export const BUSINESS_CATEGORIES = [
  "Forwarder",
  "Shipper",
  "Carrier",
  "Agent",
  "Consignee",
  "Trucker",
  "Individual (Person)",
  "Branch / Internal Unit",
  "Terminal / Depot Operator",
  "Other",
  "Financial Partner",
  "Government / Authority",
  "Technology Partner",
  "Owner / Shareholder",
  "Logistics",
  "Manufacturing",
  "Trading",
  "Retail",
  "Shipping Line",
  "Airline",
  "Customs Broker",
];
export const PARTNER_SCOPES = ["Domestic", "International", "Both"];
export const PARTNER_GROUPS = ["Key Account", "SME", "Agent", "Carrier", "Supplier", "Internal"];
export const TAX_OPTIONS = ["VAT 10%", "VAT 8%", "VAT 5%", "VAT 0%", "Not subject to VAT"];
/** No tenant settings in the demo yet: the tenant's default currency. */
export const TENANT_DEFAULT_CURRENCY = "VND";

/**
 * Demo: partners that already have operational transactions (Work Orders…), so their Role is locked.
 * Stands in for the Operations module until it exists.
 */
export const BP_IDS_WITH_TRANSACTIONS: readonly string[] = ["BP-1", "BP-3"];
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
export const GENDERS = ["Mr.", "Ms.", "Mrs."];
/** Contact Role options. */
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
  remark: "",
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
  remark: "",
  ...p,
});
/** Sales assignment from the staff master; the service is optional. */
const sales = (rid: string, staffId: string, serviceCode = "", serviceName = ""): BpSalesman => {
  const e = EMPLOYEES.find((x) => x.id === staffId);
  return {
    rid,
    staffId,
    staffName: e?.name ?? "",
    leader: leaderNameOf(staffId),
    department: e ? departmentName(e.departmentId) : "",
    serviceCode,
    serviceName,
    remark: "",
  };
};
const contact = (rid: string, p: Partial<BpContact> & Pick<BpContact, "fullName">): BpContact => ({
  rid,
  serviceCode: "",
  serviceName: "",
  gender: "",
  identityNo: "",
  telephone: "",
  mobilePhone: "",
  contactRole: "",
  email: "",
  address: "",
  primaryContact: false,
  status: "Active",
  remark: "",
  ...p,
});

/**
 * Mock of the tax authority lookup behind "Get Info" (Company only): MST → registered name/address.
 * Real companies, as published in the national business / tax registry, so the demo shows true data.
 */
export const TAX_REGISTRY: Record<
  string,
  { localName: string; englishName: string; localAddress: string }
> = {
  // Gemadept Corporation (HOSE: GMD) — enterprise registration, 35th amendment (25/05/2026).
  "0301116791": {
    localName: "Công ty Cổ phần Gemadept",
    englishName: "Gemadept Corporation",
    localAddress: "Số 2bis-4-6 Lê Thánh Tôn, Phường Sài Gòn, Thành phố Hồ Chí Minh",
  },
  // Vietnam National Petroleum Group (Petrolimex, HOSE: PLX).
  "0100107370": {
    localName: "Tập đoàn Xăng dầu Việt Nam",
    englishName: "Vietnam National Petroleum Group",
    localAddress: "Số 1 Khâm Thiên, Phường Văn Miếu - Quốc Tử Giám, Thành phố Hà Nội",
  },
};

type Seed = Partial<Omit<BusinessPartnerRecord, "customer" | "vendor">> &
  Pick<
    BusinessPartnerRecord,
    "id" | "bpCode" | "taxCode" | "invoiceSerial" | "localName" | "englishName" | "email"
  > & {
    customer?: Partial<BusinessPartnerRecord["customer"]>;
    vendor?: Partial<BusinessPartnerRecord["vendor"]>;
  };

/** Same as the form's English Address pre-fill: the Local Address without Vietnamese accents. */
const noAccents = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

const bp = (s: Seed, at = SEED_TIME): BusinessPartnerRecord => ({
  status: "Active",
  legalType: "Company",
  identityNo: "",
  inHouse: false,
  form: "01GTKT",
  localAddress: "",
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
  documents: [],
  ...meta(at),
  ...s,
  englishAddress: s.englishAddress || noAccents(s.localAddress ?? ""),
  customer: { creditTerms: [], contacts: [], banks: [], salesmen: [], ...s.customer },
  vendor: { paymentTerms: [], contacts: [], banks: [], salesmen: [], ...s.vendor },
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
      customer: {
        creditTerms: [credit("c1", { serviceCode: "FRT-SEA", serviceName: "Sea Freight" })],
        contacts: [
          contact("k1", {
            serviceCode: "FRT-SEA",
            serviceName: "Sea Freight",
            gender: "Mr.",
            fullName: "Lê Minh Tuấn",
            identityNo: "079088009876",
            telephone: "028 3822 4569",
            mobilePhone: "0938 345 678",
            contactRole: "Documentation Contact",
            email: "tuan.le@example.com",
            address: "25 Nguyễn Công Trứ, TP.HCM",
            primaryContact: true,
          }),
        ],
        salesmen: [sales("s1", "E-006", "FRT-SEA", "Sea Freight")],
      },
    },
    "2026-05-04T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-2",
      localAddress: "27 Đường số 9, Phường Linh Tây, TP. Thủ Đức, TP. Hồ Chí Minh",
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
      localAddress: "15 Lê Hồng Phong, Quận Ngô Quyền, Hải Phòng",
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
      localAddress: "102 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
      bpCode: "DONGMINH",
      taxCode: "0318846207",
      invoiceSerial: "C25DMT",
      localName: "Công Ty TNHH Thương Mại Dịch Vụ Đông Minh",
      englishName: "Dong Minh Trading Service Company Limited",
      email: "admin@dongminhtrading.vn",
      businessCategory: ["Trading", "Retail"],
      roles: ["Customer"],
      creditLimit: "200000000",
    },
    "2026-06-15T03:00:00.000Z",
  ),
  bp(
    {
      id: "BP-5",
      localAddress: "8 Phạm Ngọc Thạch, Quận 3, TP. Hồ Chí Minh",
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
      localAddress: "12 Nguyễn Thị Minh Khai, Quận 1, TP. Hồ Chí Minh",
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
      customer: {
        contacts: [
          contact("k1", {
            serviceCode: "TRK-IN",
            serviceName: "Inland Trucking",
            gender: "Mr.",
            fullName: "Nguyễn Văn Hùng",
            identityNo: "079085001234",
            telephone: "028 3822 4567",
            mobilePhone: "0909 123 456",
            contactRole: "Operations Contact",
            email: "hung.nguyen@example.com",
            address: "12 Nguyễn Thị Minh Khai, TP.HCM",
            primaryContact: true,
          }),
          contact("k2", {
            serviceCode: "CUS-IM",
            serviceName: "Import Customs",
            gender: "Ms.",
            fullName: "Trần Thị Lan",
            identityNo: "079190006789",
            telephone: "028 3822 4568",
            mobilePhone: "0918 234 567",
            contactRole: "Customs Contact",
            email: "lan.tran@example.com",
            address: "18 Tôn Đức Thắng, TP.HCM",
          }),
        ],
        salesmen: [sales("s1", "E-006", "TRK-IN", "Inland Trucking"), sales("s2", "E-001")],
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
            creditLimit: "1250000000",
            woAccessFrom: "2026-08-01T08:00",
            woAccessTo: "2026-08-15T18:00",
            woAccessPolicy: "Temporary Allow",
            approvedBy: "Finance Director",
            status: "Active",
          }),
        ],
        banks: [
          {
            rid: "b1",
            bankCode: "VCB",
            bankName: "Vietcombank",
            bankBranch: "HCM",
            bankAddress: "5 Công Trường Mê Linh, Q1",
            bankCountry: "Vietnam",
            accountNo: "0071001234567",
            accountHolder: "QTL LOGISTICS CO LTD",
            currency: "VND",
            remark: "",
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
          }),
        ],
        contacts: [
          contact("k1", {
            gender: "Ms.",
            fullName: "Phạm Thu Hà",
            mobilePhone: "0903 456 789",
            contactRole: "Accounting Contact",
            email: "ha.pham@example.com",
            primaryContact: true,
          }),
        ],
        banks: [],
        salesmen: [sales("s1", "E-001", "TRK-IN", "Inland Trucking")],
      },
    },
    "2026-07-20T03:00:00.000Z",
  ),
  ...seedPetrolimexTienGiang(),
];

/**
 * Petrolimex Tiền Giang (Công ty Xăng dầu Tiền Giang, MST 1200100370) and some of its petrol
 * stations, as listed in the public tax registry (masothue / thongtincongty). Tiền Giang merged into
 * Đồng Tháp in 2025; the registry still shows some of the old addresses.
 */
export const PETROLIMEX_TG_IDS = [
  "BP-PLX-TG",
  "BP-PLX-TG-CH11",
  "BP-PLX-TG-CH18",
  "BP-PLX-TG-CH19",
];
export function seedPetrolimexTienGiang(): BusinessPartnerRecord[] {
  const at = "2026-10-13T03:00:00.000Z";
  const vendor = (p: Partial<BusinessPartnerRecord["vendor"]> = {}) => ({
    paymentTerms: [],
    contacts: [],
    banks: [],
    salesmen: [],
    ...p,
  });
  const station = (
    id: string,
    bpCode: string,
    taxCode: string,
    no: number,
    localAddress: string,
    status: "Active" | "Inactive",
    note = "",
  ) =>
    bp(
      {
        id,
        bpCode,
        taxCode,
        invoiceSerial: "",
        localName: `Cửa hàng Xăng dầu số ${no} - Công ty Xăng dầu Tiền Giang`,
        englishName: `Petrolimex Tien Giang - Petrol Station No. ${no}`,
        email: "",
        localAddress,
        status,
        businessCategory: ["Trading"],
        roles: ["Vendor"],
        partnerGroup: "",
        province: "",
        tax: "VAT 10%",
        note,
        vendor: vendor(),
      },
      at,
    );
  return [
    bp(
      {
        id: "BP-PLX-TG",
        bpCode: "PLX-TG",
        taxCode: "1200100370",
        invoiceSerial: "",
        localName: "Công ty Xăng dầu Tiền Giang",
        englishName: "Petrolimex Tien Giang",
        email: "tiengiang@petrolimex.com.vn",
        phone: "0273 3872981",
        localAddress: "Số 488 Đinh Bộ Lĩnh, Phường 9, Thành phố Mỹ Tho, Tỉnh Tiền Giang",
        businessCategory: ["Trading"],
        roles: ["Vendor"],
        partnerGroup: "",
        province: "",
        tax: "VAT 10%",
        vendor: vendor({
          contacts: [
            contact("k1", {
              gender: "Mr.",
              fullName: "Phan Thanh Tâm",
              contactRole: "Director",
              telephone: "0273 3872981",
              email: "tiengiang@petrolimex.com.vn",
              address: "Số 488 Đinh Bộ Lĩnh, Phường 9, Thành phố Mỹ Tho, Tỉnh Tiền Giang",
              primaryContact: true,
              remark: "Legal representative (Chairman cum General Director)",
            }),
          ],
        }),
      },
      at,
    ),
    station(
      "BP-PLX-TG-CH11",
      "PLX-TG-CH11",
      "1200100370-010",
      11,
      "Ngã ba Bình Ân, Huyện Gò Công Đông, Tỉnh Tiền Giang",
      "Active",
    ),
    station(
      "BP-PLX-TG-CH18",
      "PLX-TG-CH18",
      "1200100370-016",
      18,
      "Ấp 12, Xã Long Trung, Huyện Cai Lậy, Tỉnh Tiền Giang",
      "Active",
    ),
    station(
      "BP-PLX-TG-CH19",
      "PLX-TG-CH19",
      "1200100370-017",
      19,
      "Khu 7, Thị trấn Cai Lậy, Huyện Cai Lậy, Tỉnh Tiền Giang",
      "Inactive",
      "Tax code terminated (station closed) per the tax registry.",
    ),
  ];
}
