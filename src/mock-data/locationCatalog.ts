// Dropdown catalogs for the Location form. Stand-ins for the future Common Code master.

/** Location Types (signed scope). */
export const LOCATION_TYPES = ["Port", "Airport", "Warehouse", "Farm", "Customer Site"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Optional Port sub types. */
export const PORT_SUB_TYPES = ["Seaport", "ICD", "River Port"] as const;

/**
 * Location Sub Types per Location Type (optional, one per location). Port values are signed off;
 * the others are placeholders until the Common Code master defines them.
 */
export const LOCATION_SUB_TYPES: Record<LocationType, readonly string[]> = {
  Port: PORT_SUB_TYPES,
  Airport: ["International Airport", "Domestic Airport", "Cargo Terminal"],
  Warehouse: [
    "General Warehouse",
    "Cold Storage",
    "Bonded Warehouse",
    "CFS",
    "Distribution Center",
  ],
  Farm: ["Crop Farm", "Livestock Farm", "Aquaculture Farm"],
  "Customer Site": ["Factory", "Retail Store", "Office"],
};

/** Sub types of one Location Type ([] when the type is empty / unknown). */
export const subTypesOf = (type: string | undefined): readonly string[] =>
  LOCATION_SUB_TYPES[type as LocationType] ?? [];

/** Every sub type of every type, in catalog order. */
export const ALL_LOCATION_SUB_TYPES: string[] = LOCATION_TYPES.flatMap((t) => [
  ...LOCATION_SUB_TYPES[t],
]);

/** Types that carry an international standard code. */
export const requiresUnLocode = (type: string | undefined) => type === "Port";
export const requiresIata = (type: string | undefined) => type === "Airport";

/** Maps legacy stored types (before the scope sign-off) to the current list. */
const LEGACY_TYPES: Record<string, { type: LocationType; sub?: string }> = {
  Seaport: { type: "Port", sub: "Seaport" },
  "Inland Depot": { type: "Port", sub: "ICD" },
  "Border Gate": { type: "Port" },
  Other: { type: "Customer Site" },
};
/** Legacy sub types that still mean something for a Port. */
const LEGACY_PORT_SUBS: Record<string, string> = {
  "Container Terminal": "Seaport",
  "Bulk Terminal": "Seaport",
  "River Port": "River Port",
  ICD: "ICD",
  "Container Depot": "ICD",
};

/** Normalizes a stored type / sub type pair (legacy values included) to the current catalog. */
export function normalizeLocationType(
  type: string | undefined,
  sub: string | undefined,
): { type: string; sub: string } {
  const t = (type ?? "").trim();
  if ((LOCATION_TYPES as readonly string[]).includes(t)) {
    const s = sub ?? "";
    if (subTypesOf(t).includes(s)) return { type: t, sub: s };
    return { type: t, sub: t === "Port" ? (LEGACY_PORT_SUBS[s] ?? "") : "" };
  }
  const legacy = LEGACY_TYPES[t];
  if (!legacy) return { type: t, sub: "" };
  const s = legacy.sub ?? LEGACY_PORT_SUBS[sub ?? ""] ?? "";
  return { type: legacy.type, sub: legacy.type === "Port" ? s : "" };
}

export const LOCATION_COUNTRIES = [
  "Vietnam",
  "Cambodia",
  "Laos",
  "Thailand",
  "Singapore",
  "China",
  "Japan",
  "Korea",
  "USA",
];

/** ISO 3166-1 alpha-2 codes — the first 2 letters of a UN/LOCODE. */
export const COUNTRY_ISO2: Record<string, string> = {
  Vietnam: "VN",
  Cambodia: "KH",
  Laos: "LA",
  Thailand: "TH",
  Singapore: "SG",
  China: "CN",
  Japan: "JP",
  Korea: "KR",
  USA: "US",
};

/** Vietnam provinces / centrally-run cities (Province/City select when Country = Vietnam). */
export const VN_PROVINCES = [
  "TP. Hồ Chí Minh",
  "Hà Nội",
  "Hải Phòng",
  "Đà Nẵng",
  "Cần Thơ",
  "An Giang",
  "Bà Rịa - Vũng Tàu",
  "Bắc Giang",
  "Bắc Kạn",
  "Bạc Liêu",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Định",
  "Bình Dương",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cao Bằng",
  "Đắk Lắk",
  "Đắk Nông",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Giang",
  "Hà Nam",
  "Hà Tĩnh",
  "Hải Dương",
  "Hậu Giang",
  "Hòa Bình",
  "Hưng Yên",
  "Khánh Hòa",
  "Kiên Giang",
  "Kon Tum",
  "Lai Châu",
  "Lâm Đồng",
  "Lạng Sơn",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Phú Yên",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sóc Trăng",
  "Sơn La",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Thừa Thiên Huế",
  "Tiền Giang",
  "Trà Vinh",
  "Tuyên Quang",
  "Vĩnh Long",
  "Vĩnh Phúc",
  "Yên Bái",
];

/** Best-effort type for the legacy seed rows (name keywords), so they can be edited without re-typing. */
export function guessLocationType(name: string): { type: LocationType; sub: string } {
  const n = name.toLowerCase();
  if (/cảng|cát lái|cai mep|cái mép|hiep phuoc|hiệp phước|port/.test(n))
    return { type: "Port", sub: "Seaport" };
  if (/sân bay|airport/.test(n)) return { type: "Airport", sub: "" };
  if (/icd/.test(n)) return { type: "Port", sub: "ICD" };
  if (/nông trường|farm/.test(n)) return { type: "Farm", sub: "" };
  if (/kho/.test(n)) return { type: "Warehouse", sub: "" };
  return { type: "Customer Site", sub: "" };
}
