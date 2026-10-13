// Dropdown catalogs for the Location form. Stand-ins for the future Common Code master.

/** Location Types (signed scope). */
/** Seaport: sea / river port. Depot: inland container depot (ICD) / container yard. */
export const LOCATION_TYPES = [
  "Seaport",
  "Depot",
  "Airport",
  "Warehouse",
  "Farm",
  "Customer Site",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Maps legacy stored types (before the scope sign-off) to the current list. */
const LEGACY_TYPES: Record<string, LocationType> = {
  // "Port" was renamed "Seaport".
  Port: "Seaport",
  "Inland Depot": "Depot",
  "Border Gate": "Seaport",
  Other: "Customer Site",
};

/** Normalizes a stored type (legacy values included) to the current catalog. */
export function normalizeLocationType(type: string | undefined): string {
  const t = (type ?? "").trim();
  return LEGACY_TYPES[t] ?? t;
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
export function guessLocationType(name: string): LocationType {
  const n = name.toLowerCase();
  if (/icd|depot/.test(n)) return "Depot";
  if (/cảng|cát lái|cai mep|cái mép|hiep phuoc|hiệp phước|port/.test(n)) return "Seaport";
  if (/sân bay|airport/.test(n)) return "Airport";
  if (/nông trường|farm/.test(n)) return "Farm";
  if (/kho/.test(n)) return "Warehouse";
  return "Customer Site";
}
