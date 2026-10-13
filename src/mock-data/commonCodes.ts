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
  TRUCK_TYPES,
  VEHICLE_MASTER_GROUPS,
  VEHICLE_TYPES,
} from "./vehicleMaster";
import { LOCATION_TYPES } from "./locationCatalog";
import { COST_TAX_EVIDENCES, COST_TAX_TARIFFS, COST_UOM_CATALOG } from "./costMaster";
import { FIXED_COST_TYPES, FIXED_COST_VEHICLE_TYPES } from "./fixedCost";

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
  // Vehicle
  VEHICLE_TYPE: "BP06",
  TRAILER_SIZE: "VH09",
  TRUCK_TYPE: "VH10",
  VEHICLE_GROUP: "VH11",
  FUEL_TYPE: "VH12",
  TRADE_MARK: "VH13",
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
  type(CC.GENDER, "Gender", "Customizable", GENDERS, [
    [BP, "Customer / Vendor › Contact Info", "Gender"],
  ]),
  // ---------------------------------------------------------------- Vehicle
  type(
    CC.VEHICLE_TYPE,
    "Vehicle Type",
    "Fixed",
    VEHICLE_TYPES,
    [
      [VH, "Vehicle Create / Edit", "Vehicle Type"],
      [VH, "Vehicle List", "Vehicle Type filter"],
    ],
    "TRUCK / HEAD / TRAILER decide which fields the vehicle form shows.",
  ),
  type(
    CC.TRAILER_SIZE,
    "Vehicle - Trailer Size",
    "Fixed",
    TRAILER_TYPES,
    [
      [VH, "Vehicle Create / Edit", "Trailer Type"],
      [VH, "Vehicle Create / Edit › Container Size Mapping", "Trailer Type"],
    ],
    "Matched between trailers and the head's Container Size Mapping.",
  ),
  type(CC.TRUCK_TYPE, "Truck Type", "Customizable", TRUCK_TYPES, [
    [VH, "Vehicle Create / Edit", "Truck Type"],
    [VH, "Vehicle List", "Truck Type filter"],
  ]),
  type(CC.VEHICLE_GROUP, "Vehicle Group", "Customizable", VEHICLE_MASTER_GROUPS, [
    [VH, "Vehicle Create / Edit", "Vehicle Group"],
    [VH, "Vehicle Create / Edit › Container Size Mapping", "Vehicle Group"],
  ]),
  type(CC.FUEL_TYPE, "Fuel Type", "Customizable", FUEL_TYPES, [
    [VH, "Vehicle Create / Edit › Specifications", "Fuel Type"],
  ]),
  type(CC.TRADE_MARK, "Trade Mark", "Customizable", TRADE_MARKS, [
    [VH, "Vehicle Create / Edit › Specifications", "Trade Mark"],
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
    ["Plain", "Highland"],
    [
      [RT, "Route Detail", "Terrain"],
      [RT, "Route List", "Terrain filter"],
    ],
    "Highland adds 25% to the estimated time.",
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
    [CO, "Cost Detail", "Tax Evidence"],
  ]),
  type(CC.TAX_TARIFF, "Tax Tariff", "Customizable", COST_TAX_TARIFFS, [
    [CO, "Cost Detail", "Default Tax Tariff"],
  ]),
  type(CC.UOM_CATEGORY, "UoM Category", "Customizable", Object.keys(COST_UOM_CATALOG), [
    [CO, "Cost Detail", "Category UoM"],
  ]),
  type(
    CC.UOM,
    "Unit of Measure",
    "Customizable",
    byParent(COST_UOM_CATALOG),
    [[CO, "Cost Detail", "Def UoM"]],
    "Attribute = the UoM Category the unit belongs to.",
    Object.keys(COST_UOM_CATALOG),
  ),
  // ---------------------------------------------------------------- Fixed Cost
  type(CC.FIXED_COST_TYPE, "Fixed Cost Type", "Customizable", FIXED_COST_TYPES, [
    [FC, "Fixed Cost Detail", "Cost Type Code"],
  ]),
  type(
    CC.FIXED_COST_VEHICLE_TYPE,
    "Fixed Cost Vehicle Type",
    "Customizable",
    FIXED_COST_VEHICLE_TYPES,
    [
      [FC, "Fixed Cost Detail", "Vehicle Type"],
      [FC, "Fixed Cost › Summary", "Vehicle Type"],
      [FC, "Fixed Cost List", "Vehicle Type filter"],
    ],
  ),
  type(
    CC.ALLOCATION_UNIT,
    "Allocation Base Unit",
    "Fixed",
    ALLOCATION_UNITS,
    [[FC, "Fixed Cost Detail", "Allocation Base Unit"]],
    "Drives the Year → Month → Day → Trip allocation chain.",
  ),
];
