// Common Code: the code lists behind the dropdowns of every module. The type list is defined by the
// system; users only customise the options of each type ("Fixed" types: activate / deactivate only,
// because the system runs rules on those values).
import {
  ALLOCATION_UNITS,
  FEE_TYPES,
  MANUAL_COST_TYPES,
  TRAILER_TYPES,
  type CommonCodeKind,
  type CommonCodeRecord,
  type CommonCodeUsage,
} from "@/types";
import {
  APPROVERS,
  BUSINESS_CATEGORIES,
  CONTACT_POSITIONS,
  COUNTRIES,
  CREDIT_TERMS,
  DOC_TYPES,
  GENDERS,
  INVOICE_LANGUAGES,
  LEGAL_TYPES,
  WO_ACCESS_POLICIES,
} from "./businessPartners";
import {
  FUEL_TYPES,
  TRADE_MARKS,
  TRAILER_BODY_TYPES,
  TRUCK_TYPES,
  VEHICLE_MASTER_GROUPS,
  VEHICLE_TYPES,
} from "./vehicleMaster";
import { LOCATION_TYPES } from "./locationCatalog";
import { COST_TAX_EVIDENCES, COST_TAX_TARIFFS, COST_UOM_CATALOG } from "./costMaster";

/** Type codes used by the screens (keep in sync with the seed below). */
export const CC = {
  // Business Partner
  BUSINESS_CATEGORY: "BP01",
  LEGAL_TYPE: "BP02",
  INVOICING_LANGUAGE: "BP03",
  CONTACT_ROLE: "BP10",
  PAYMENT_TERM: "BP11",
  WO_ACCESS_POLICY: "BP14",
  APPROVER: "BP18",
  DOCUMENT_TYPE: "BP20",
  GENDER: "CM01",
  COUNTRY: "CM02",
  // Vehicle
  VEHICLE_TYPE: "BP06",
  TRAILER_SIZE: "VH09",
  TRUCK_TYPE: "VH10",
  VEHICLE_GROUP: "VH11",
  FUEL_TYPE: "VH12",
  TRADE_MARK: "VH13",
  TRAILER_TYPE: "VH14",
  CONTAINER_TYPE: "VH15",
  // Location
  LOCATION_TYPE: "BP16",
  /** Removed (one Location Type only); kept to retire the stored type. */
  LOCATION_SUB_TYPE: "BP21",
  // Toll Station
  TOLL_FEE_TYPE: "TS01",
  // Route Management
  ROUTE_TYPE: "RT01",
  TERRAIN: "RT02",
  STOP_TYPE: "RT03",
  MANUAL_COST_TYPE: "RT04",
  ROUTE_FEE_TYPE: "RT05",
  // Cost
  TAX_EVIDENCE: "CS01",
  TAX_TARIFF: "CS02",
  UOM_CATEGORY: "CS03",
  UOM: "CS04",
  // Fixed Cost
  FIXED_COST_TYPE: "FC01",
  FIXED_COST_VEHICLE_TYPE: "FC02",
  ALLOCATION_UNIT: "FC03",
} as const;

const AT = "2026-07-01T03:00:00.000Z";
/** Vehicle Type: the attribute is the base type whose fields the vehicle form shows. */
export const VEHICLE_TYPE_REMARK =
  "Attribute = base type (TRUCK / HEADER / TRAILER) that decides which fields the vehicle form shows. TRUCK / HEADER / TRAILER are system options.";
const BP = "Business Partner";
const VH = "Vehicle";
const LC = "Location";
const TS = "Toll Station";
const RT = "Route Management";
const CO = "Cost";
const FC = "Fixed Cost";
const DEFAULT = [{ code: "DEFAULT", name: "DEFAULT" }];

/** An option name, or [name, attribute] for a dependent list. */
type Value = string | readonly [string, string];

const type = (
  code: string,
  name: string,
  kind: CommonCodeKind,
  values: readonly Value[],
  usage: [string, string, string][],
  remark = "",
  attributes: readonly string[] = [],
): CommonCodeRecord => ({
  id: code,
  code,
  name,
  kind,
  remark,
  usage: usage.map(([module, screen, field]): CommonCodeUsage => ({ module, screen, field })),
  attributes: attributes.length ? attributes.map((a) => ({ code: a, name: a })) : DEFAULT,
  options: values.map((v, i) => ({
    code: `${code}${String(i + 1).padStart(2, "0")}`,
    name: typeof v === "string" ? v : v[0],
    attribute: typeof v === "string" ? "DEFAULT" : v[1],
    remark: "",
    active: true,
  })),
  status: "Active",
  createdAt: AT,
  createdBy: "System",
  updatedAt: AT,
  updatedBy: "System",
});

/** Flatten a parent → children catalog into [child, parent] values. */
const byParent = (catalog: Record<string, readonly string[]>): [string, string][] =>
  Object.entries(catalog).flatMap(([parent, children]) =>
    children.map((c): [string, string] => [c, parent]),
  );

/**
 * Container types (ISO 6346): [ISO group code, ISO size/type codes, Vietnamese name, English name,
 * usual abbreviation, nominal outside size, length]. The group code is what the screens store.
 */
export const CONTAINER_TYPES: readonly (readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
])[] = [
  [
    "22GP",
    "22G0 / 22G1",
    "Container khô 20 feet",
    "General Purpose / Dry",
    "20DC / 20GP",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "42GP",
    "42G0 / 42G1",
    "Container khô 40 feet",
    "General Purpose / Dry",
    "40DC / 40GP",
    "40′ × 8′ × 8′6″",
    "40 ft",
  ],
  [
    "45GP",
    "45G0 / 45G1",
    "Container khô cao 40 feet",
    "High Cube Dry",
    "40HC / 40HQ",
    "40′ × 8′ × 9′6″",
    "40 ft",
  ],
  [
    "L5GP",
    "L5G1",
    "Container khô cao 45 feet",
    "45-foot High Cube Dry",
    "45HC / 45HQ",
    "45′ × 8′ × 9′6″",
    "45 ft",
  ],
  ["22RT", "22R1", "Container lạnh 20 feet", "Reefer", "20RF / 20RE", "20′ × 8′ × 8′6″", "20 ft"],
  ["42RT", "42R1", "Container lạnh 40 feet", "Reefer", "40RF / 40RE", "40′ × 8′ × 8′6″", "40 ft"],
  [
    "45RT",
    "45R1",
    "Container lạnh cao 40 feet",
    "High Cube Reefer",
    "40RH / 40HR / 40RF HC",
    "40′ × 8′ × 9′6″",
    "40 ft",
  ],
  ["22UT", "22U1", "Container mở nóc 20 feet", "Open Top", "20OT", "20′ × 8′ × 8′6″", "20 ft"],
  ["42UT", "42U1", "Container mở nóc 40 feet", "Open Top", "40OT", "40′ × 8′ × 8′6″", "40 ft"],
  [
    "45UT",
    "45U1",
    "Container mở nóc cao 40 feet",
    "High Cube Open Top",
    "40OT HC / 40HCOT",
    "40′ × 8′ × 9′6″",
    "40 ft",
  ],
  [
    "22UP",
    "22U6",
    "Container nóc cứng tháo rời 20 feet",
    "Hardtop",
    "20HT",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "42UP",
    "42U6",
    "Container nóc cứng tháo rời 40 feet",
    "Hardtop",
    "40HT",
    "40′ × 8′ × 8′6″",
    "40 ft",
  ],
  [
    "45UP",
    "45U6",
    "Container nóc cứng tháo rời cao 40 feet",
    "High Cube Hardtop",
    "40HT HC",
    "40′ × 8′ × 9′6″",
    "40 ft",
  ],
  [
    "22PF",
    "22P1",
    "Container flat rack 20 feet, đầu cố định",
    "Flat Rack – Fixed Ends",
    "20FR",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "22PC",
    "22P3",
    "Container flat rack 20 feet, đầu gập",
    "Flat Rack – Collapsible",
    "20FR / 20FRC",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "42PF",
    "42P1",
    "Container flat rack 40 feet, đầu cố định",
    "Flat Rack – Fixed Ends",
    "40FR",
    "40′ × 8′ × 8′6″",
    "40 ft",
  ],
  [
    "42PC",
    "42P3",
    "Container flat rack 40 feet, đầu gập",
    "Flat Rack – Collapsible",
    "40FR / 40FRC",
    "40′ × 8′ × 8′6″",
    "40 ft",
  ],
  [
    "45PC",
    "45P3",
    "Container flat rack cao 40 feet, đầu gập",
    "High Cube Flat Rack",
    "40FR HC",
    "40′ × 8′ × 9′6″",
    "40 ft",
  ],
  [
    "29PL",
    "29P0",
    "Container sàn 20 feet",
    "Platform",
    "20PL / 20PF",
    "20′ × 8′; cao ≤ 4′",
    "20 ft",
  ],
  [
    "49PL",
    "49P0",
    "Container sàn 40 feet",
    "Platform",
    "40PL / 40PF",
    "40′ × 8′; cao ≤ 4′",
    "40 ft",
  ],
  [
    "22VH",
    "22V0",
    "Container thông gió 20 feet",
    "Ventilated",
    "20VE / 20VENT",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "22BU",
    "22B0",
    "Container hàng rời khô 20 feet",
    "Dry Bulk",
    "20BU / 20BULK",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "22TN",
    "22T0",
    "Container bồn 20 feet, chất lỏng không nguy hiểm",
    "Tank – Non-dangerous Liquids",
    "20TK / ISO TANK",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
  [
    "22TD",
    "22T5 / 22T6",
    "Container bồn 20 feet, chất lỏng nguy hiểm",
    "Tank – Dangerous Liquids",
    "20TK / ISO TANK",
    "20′ × 8′ × 8′6″",
    "20 ft",
  ],
];
const containerTypeSeed = (): CommonCodeRecord => {
  const t = type(
    CC.CONTAINER_TYPE,
    "Container Type",
    "Customizable",
    CONTAINER_TYPES.map((c) => [c[0], c[6]] as const),
    [["Variable Cost", "Salary Range Detail › Tiers", "Container column"]],
    "ISO 6346 container size / type groups. Name = ISO group code (stored by the screens); Attribute = length.",
    ["20 ft", "40 ft", "45 ft"],
  );
  return {
    ...t,
    nameLabel: "ISO Group Code",
    fields: [
      { key: "iso", label: "ISO Size / Type Code" },
      { key: "vi", label: "Vietnamese Name" },
      { key: "en", label: "English Name" },
      { key: "abbr", label: "Common Abbreviation" },
      { key: "size", label: "Nominal Outside Size (L × W × H)" },
    ],
    options: t.options.map((o, i) => {
      const c = CONTAINER_TYPES[i]!;
      return { ...o, values: { iso: c[1], vi: c[2], en: c[3], abbr: c[4], size: c[5] } };
    }),
  };
};

export const seedCommonCodes = (): CommonCodeRecord[] => [
  // ---------------------------------------------------------------- Business Partner
  type(CC.BUSINESS_CATEGORY, "Business Partner Category", "Customizable", BUSINESS_CATEGORIES, [
    [BP, "Business Partner Detail", "Business Category"],
    [BP, "Business Partner List", "Business Category filter"],
  ]),
  type(
    CC.LEGAL_TYPE,
    "Legal Type",
    "Fixed",
    LEGAL_TYPES,
    [[BP, "Business Partner Detail", "Legal Type"]],
    "Drives which ID is required: Company → Tax Code, Individual → Identity Number.",
  ),
  type(CC.INVOICING_LANGUAGE, "Invoicing Language", "Customizable", INVOICE_LANGUAGES, [
    [BP, "Business Partner Detail", "Invoicing Language"],
  ]),
  type(CC.CONTACT_ROLE, "Contact Role", "Customizable", CONTACT_POSITIONS, [
    [BP, "Customer / Vendor › Contact Info", "Contact Role"],
  ]),
  type(CC.PAYMENT_TERM, "Credit / Payment Term", "Customizable", CREDIT_TERMS, [
    [BP, "Customer › Credit Term", "Credit Term"],
    [BP, "Vendor › Payment Term", "Payment Term"],
  ]),
  type(
    CC.WO_ACCESS_POLICY,
    "WO Access Policy",
    "Fixed",
    WO_ACCESS_POLICIES,
    [[BP, "Customer › Credit Term", "WO Access Policy"]],
    "Used by the work-order lock rule.",
  ),
  type(CC.APPROVER, "Approver", "Customizable", APPROVERS, [
    [BP, "Customer › Credit Term", "Approved By"],
  ]),
  type(CC.DOCUMENT_TYPE, "Document Type", "Customizable", DOC_TYPES, [
    [BP, "Documents", "Document Type"],
  ]),
  type(CC.COUNTRY, "Country", "Customizable", COUNTRIES, [
    [BP, "General Information", "Country"],
    [BP, "Customer / Vendor › Bank Account", "Bank Country"],
    [BP, "Business Partner List", "Country"],
  ]),
  type(CC.GENDER, "Gender", "Customizable", GENDERS, [
    [BP, "Customer / Vendor › Contact Info", "Gender"],
  ]),
  // ---------------------------------------------------------------- Vehicle
  {
    ...type(
      CC.VEHICLE_TYPE,
      "Vehicle Type",
      "Customizable",
      VEHICLE_TYPES.map((t) => [t, t] as const),
      [
        [VH, "Vehicle Create / Edit", "Vehicle Type"],
        [VH, "Vehicle List", "Vehicle Type filter"],
      ],
      VEHICLE_TYPE_REMARK,
      VEHICLE_TYPES,
    ),
    // TRUCK / HEADER / TRAILER drive the vehicle form: locked (BP0601–BP0603).
    lockedOptions: VEHICLE_TYPES.map(
      (_, i) => `${CC.VEHICLE_TYPE}${String(i + 1).padStart(2, "0")}`,
    ),
  },
  type(
    CC.TRAILER_SIZE,
    "Vehicle - Trailer Size",
    "Customizable",
    TRAILER_TYPES,
    [[VH, "Vehicle Create / Edit › Specifications", "Trailer Size"]],
    "Size of a trailer (20 ft / 40 ft…). Renaming a size updates the vehicles that use it.",
  ),
  type(
    CC.TRAILER_TYPE,
    "Vehicle - Trailer Type",
    "Customizable",
    TRAILER_BODY_TYPES,
    [[VH, "Vehicle Create / Edit", "Trailer Type"]],
    "Body type of a trailer: Skeletal (xương, chở container), Flatbed (sàn), Low Bed (lùn), Side Wall (lửng), Box (thùng kín), Dump (ben), Tank (bồn).",
  ),
  containerTypeSeed(),
  type(CC.TRUCK_TYPE, "Truck Type", "Customizable", TRUCK_TYPES, [
    [VH, "Vehicle Create / Edit", "Truck Type"],
    [VH, "Vehicle List", "Truck Type filter"],
  ]),
  type(CC.VEHICLE_GROUP, "Vehicle Group", "Customizable", VEHICLE_MASTER_GROUPS, [
    [VH, "Vehicle Create / Edit", "Vehicle Group"],
  ]),
  type(CC.FUEL_TYPE, "Fuel Type", "Customizable", FUEL_TYPES, [
    [VH, "Vehicle Create / Edit › Fuel", "Fuel Type"],
  ]),
  type(CC.TRADE_MARK, "Vehicle Brand", "Customizable", TRADE_MARKS, [
    [VH, "Vehicle Create / Edit › Vehicle Identification", "Brand Name"],
  ]),
  // ---------------------------------------------------------------- Location
  type(
    CC.LOCATION_TYPE,
    "Location Type",
    "Fixed",
    LOCATION_TYPES,
    [
      [LC, "Location Detail", "Location Type"],
      [LC, "Location List", "Location Type filter"],
    ],
    "IATA Code → Airport; UN/LOCODE → Seaport / Depot; Local Code → any.",
  ),
  // ---------------------------------------------------------------- Toll Station
  type(
    CC.TOLL_FEE_TYPE,
    "Toll Fee Type",
    "Fixed",
    ["Road", "Bridge / Ferry"],
    [
      [TS, "Toll Station Detail", "Fee Type"],
      [TS, "Toll Station List", "Fee Type filter"],
    ],
    "Ferry crossings are costed separately in routes.",
  ),
  // ---------------------------------------------------------------- Route Management
  type(
    CC.ROUTE_TYPE,
    "Route Type",
    "Fixed",
    ["Single Trip", "Round Trip"],
    [
      [RT, "Route Detail", "Route Type"],
      [RT, "Route List", "Route Type filter"],
    ],
    "Round Trip adds the return leg.",
  ),
  type(
    CC.TERRAIN,
    "Terrain",
    "Fixed",
    ["Plain", "Other"],
    [
      [RT, "Route Detail", "Terrain"],
      [RT, "Route List", "Terrain filter"],
    ],
    "Other (e.g. highland) adds 25% to the estimated time.",
  ),
  type(
    CC.STOP_TYPE,
    "Stop Type",
    "Fixed",
    ["Pickup", "Delivery"],
    [[RT, "Route Detail › Route Detail", "Stop type"]],
  ),
  type(
    CC.MANUAL_COST_TYPE,
    "Manual Route Cost Type",
    "Fixed",
    MANUAL_COST_TYPES,
    [[RT, "Route Detail › Add Manual Cost", "Cost Type"]],
    "Ferry costs are split from the other route costs.",
  ),
  type(CC.ROUTE_FEE_TYPE, "Route Toll Fee Type", "Fixed", FEE_TYPES, [
    [RT, "Route Detail › Add Toll", "Fee Type"],
  ]),
  // ---------------------------------------------------------------- Cost
  type(CC.TAX_EVIDENCE, "Tax Evidence", "Customizable", COST_TAX_EVIDENCES, [
    [CO, "Fare Code", "Tax Evidence"],
  ]),
  type(CC.TAX_TARIFF, "Tax Tariff", "Customizable", COST_TAX_TARIFFS, [
    [CO, "Fare Code", "Default Tax Tariff"],
  ]),
  type(CC.UOM_CATEGORY, "UoM Category", "Customizable", Object.keys(COST_UOM_CATALOG), [
    [CO, "Fare Code", "Category UoM"],
  ]),
  type(
    CC.UOM,
    "Unit of Measure",
    "Customizable",
    byParent(COST_UOM_CATALOG),
    [[CO, "Fare Code", "Default Unit"]],
    "Attribute = the UoM Category the unit belongs to.",
    Object.keys(COST_UOM_CATALOG),
  ),
  // ---------------------------------------------------------------- Fixed Cost
  type(
    CC.ALLOCATION_UNIT,
    "Allocation Base Unit",
    "Fixed",
    ALLOCATION_UNITS,
    [[FC, "Fixed Cost Detail", "Allocation Base Unit"]],
    "Drives the Year → Month → Day allocation chain.",
  ),
];
