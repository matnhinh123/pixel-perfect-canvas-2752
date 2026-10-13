import type { BaseRecord, LocationRecord } from "@/types";
import { guessLocationType, normalizeLocationType } from "./locationCatalog";
import { CODE_KINDS, codeKindOf, type CodeKind } from "./standardCodes";

const loc = (
  id: string,
  name: string,
  address: string,
  province: string,
  lat: number,
  lng: number,
): LocationRecord => ({ id, name, address, province, lat, lng });

const coded = (
  code: string,
  name: string,
  address: string,
  province: string,
  lat: number,
  lng: number,
): LocationRecord => ({ ...loc(`LOC-${code}`, name, address, province, lat, lng), code });

/** Seed point that existed before it got its real UN/LOCODE: same id, real code. */
const recoded = (l: LocationRecord, code: string): LocationRecord => ({ ...l, code });

/** Real ports / ICDs (UN/LOCODE) and airports (IATA, OurAirports coordinates). */
const STANDARD_SEED = (): LocationRecord[] => [
  coded("VNHPH", "Cảng Hải Phòng", "Quận Ngô Quyền, Hải Phòng", "Hải Phòng", 20.8651, 106.6838),
  coded(
    "VNHPP",
    "Cảng Tân Cảng Hiệp Phước",
    "Huyện Nhà Bè, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.6333,
    106.75,
  ),
  coded(
    "VNCMT",
    "Cảng Cái Mép (CMIT)",
    "TX. Phú Mỹ, Bà Rịa - Vũng Tàu",
    "Bà Rịa - Vũng Tàu",
    10.5167,
    107.0,
  ),
  // No UN/LOCODE of its own: uses Nhon Trach (VNNHT), the code of its area. Coordinates: OpenStreetMap.
  coded(
    "VNNHT",
    "Cảng Phước An",
    "Xã Phước An, Huyện Nhơn Trạch, Đồng Nai",
    "Đồng Nai",
    10.6176,
    106.9957,
  ),
  coded("VNILB", "ICD Tân Cảng - Long Bình", "TP. Biên Hòa, Đồng Nai", "Đồng Nai", 10.9, 106.8667),
  coded("VNSTC", "ICD Sóng Thần", "TP. Dĩ An, Bình Dương", "Bình Dương", 10.9019, 106.7524),
  coded("VNVCA", "Cảng Cần Thơ (Cái Cui)", "Quận Cái Răng, Cần Thơ", "Cần Thơ", 10.0333, 105.7833),
  coded(
    "SGN",
    "Sân bay Tân Sơn Nhất",
    "Quận Tân Bình, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.8188,
    106.652,
  ),
  coded("HAN", "Sân bay Nội Bài", "Huyện Sóc Sơn, Hà Nội", "Hà Nội", 21.2212, 105.807),
  coded("DAD", "Sân bay Đà Nẵng", "Quận Hải Châu, Đà Nẵng", "Đà Nẵng", 16.0439, 108.199),
  coded("CXR", "Sân bay Cam Ranh", "TP. Cam Ranh, Khánh Hòa", "Khánh Hòa", 11.9982, 109.219),
  coded("PQC", "Sân bay Phú Quốc", "TP. Phú Quốc, Kiên Giang", "Kiên Giang", 10.1698, 103.9935),
  coded("HPH", "Sân bay Cát Bi", "Quận Hải An, Hải Phòng", "Hải Phòng", 20.8174, 106.7243),
  coded("VCA", "Sân bay Cần Thơ", "Quận Bình Thủy, Cần Thơ", "Cần Thơ", 10.0834, 105.7094),
];

/** Location master data (real-world coordinates, used by autocomplete, the mock provider and import checks). */
export const LOCATIONS: LocationRecord[] = [
  // TP. Hồ Chí Minh
  loc(
    "LOC-HCM",
    "TP. Hồ Chí Minh",
    "Quận 1, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.8231,
    106.6297,
  ),
  loc(
    "LOC-CATLAI",
    "Cát Lái",
    "TP. Thủ Đức, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.7704,
    106.7858,
  ),
  loc(
    "LOC-HCM-TB",
    "Kho Tân Bình",
    "Tân Bình, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.8016,
    106.6527,
  ),
  loc("LOC-HCM-Q7", "Kho Quận 7", "Quận 7, TP. Hồ Chí Minh", "TP. Hồ Chí Minh", 10.734, 106.7218),
  loc(
    "LOC-HCM-TD",
    "Kho Thủ Đức",
    "TP. Thủ Đức, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.8494,
    106.7537,
  ),
  loc(
    "LOC-TD-NT",
    "Ngã tư Thủ Đức",
    "TP. Thủ Đức, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.8497,
    106.7726,
  ),
  // Đồng Nai
  loc("LOC-LONGTHANH", "Long Thành", "Huyện Long Thành, Đồng Nai", "Đồng Nai", 10.7898, 106.9502),
  loc("LOC-LONGBINH", "Long Bình", "TP. Biên Hòa, Đồng Nai", "Đồng Nai", 10.9447, 106.8752),
  loc("LOC-LONGKHANH", "Long Khánh", "TP. Long Khánh, Đồng Nai", "Đồng Nai", 10.9318, 107.2412),
  loc("LOC-DAUGIAY", "Dầu Giây", "Huyện Thống Nhất, Đồng Nai", "Đồng Nai", 10.9277, 107.1537),
  loc("LOC-BIENHOA", "Biên Hòa", "TP. Biên Hòa, Đồng Nai", "Đồng Nai", 10.9574, 106.8426),
  loc("LOC-BIENHOA2", "KCN Biên Hòa 2", "TP. Biên Hòa, Đồng Nai", "Đồng Nai", 10.9367, 106.8526),
  loc("LOC-CATTIEN", "Cát Tiên", "Huyện Tân Phú, Đồng Nai", "Đồng Nai", 11.4247, 107.4286),
  // Bình Dương
  loc(
    "LOC-BINHDUONG",
    "Thủ Dầu Một",
    "TP. Thủ Dầu Một, Bình Dương",
    "Bình Dương",
    10.9804,
    106.6519,
  ),
  loc("LOC-VSIP", "KCN VSIP I", "TP. Thuận An, Bình Dương", "Bình Dương", 10.9271, 106.7155),
  loc("LOC-SONGTHAN", "Ngã tư Sóng Thần", "TP. Dĩ An, Bình Dương", "Bình Dương", 10.8985, 106.7466),
  // Miền Trung & Tây Nguyên
  loc("LOC-DALAT", "Đà Lạt", "TP. Đà Lạt, Lâm Đồng", "Lâm Đồng", 11.9404, 108.4583),
  loc("LOC-PHANTHIET", "Phan Thiết", "TP. Phan Thiết, Bình Thuận", "Bình Thuận", 10.9289, 108.1021),
  loc("LOC-NHATRANG", "Nha Trang", "TP. Nha Trang, Khánh Hòa", "Khánh Hòa", 12.2388, 109.1967),
  loc("LOC-QUYNHON", "Quy Nhơn", "TP. Quy Nhơn, Bình Định", "Bình Định", 13.782, 109.219),
  loc("LOC-TAMKY", "Tam Kỳ", "TP. Tam Kỳ, Quảng Nam", "Quảng Nam", 15.5736, 108.474),
  loc("LOC-CHULAI", "KKT Chu Lai", "Huyện Núi Thành, Quảng Nam", "Quảng Nam", 15.414, 108.68),
  loc("LOC-HOIAN", "Hội An", "TP. Hội An, Quảng Nam", "Quảng Nam", 15.8801, 108.338),
  loc("LOC-DANANG", "Đà Nẵng", "TP. Đà Nẵng", "Đà Nẵng", 16.0544, 108.2022),
  recoded(
    loc("LOC-TIENSA", "Cảng Tiên Sa", "Quận Sơn Trà, Đà Nẵng", "Đà Nẵng", 16.1225, 108.218),
    "VNDTS",
  ),
  loc("LOC-HUE", "Huế", "TP. Huế, Thừa Thiên Huế", "Thừa Thiên Huế", 16.4637, 107.5909),
  // Miền Bắc
  loc("LOC-HANOI", "Hà Nội", "Quận Hoàn Kiếm, Hà Nội", "Hà Nội", 21.0285, 105.8542),
  recoded(
    loc("LOC-GIALAM", "ICD Gia Lâm", "Quận Long Biên, Hà Nội", "Hà Nội", 21.0359, 105.9257),
    "VNGIL",
  ),
  loc("LOC-HAIDUONG", "Hải Dương", "TP. Hải Dương, Hải Dương", "Hải Dương", 20.9373, 106.3146),
  loc("LOC-HAIPHONG", "Hải Phòng", "Quận Hồng Bàng, Hải Phòng", "Hải Phòng", 20.8449, 106.6881),
  recoded(
    loc("LOC-DINHVU", "Cảng Đình Vũ", "Quận Hải An, Hải Phòng", "Hải Phòng", 20.8379, 106.7737),
    "VNDVU",
  ),
  // Địa điểm có mã (port / KCX / nông trường) — toạ độ ước lượng theo vị trí thực tế
  coded(
    "DKCBF",
    "Nông Trường Cư Bao",
    "Phường Cư Bao, TX. Buôn Hồ, Đắk Lắk",
    "Đắk Lắk",
    12.939,
    108.258,
  ),
  coded(
    "DLVBW",
    "Vụ Bồn, Đak Lăk",
    "Xã Vụ Bổn, Huyện Krông Pắc, Đắk Lắk",
    "Đắk Lắk",
    12.63,
    108.28,
  ),
  coded(
    "VTXMW",
    "Xuyên Mộc, Vũng Tàu",
    "Huyện Xuyên Mộc, Bà Rịa - Vũng Tàu",
    "Bà Rịa - Vũng Tàu",
    10.5413,
    107.3996,
  ),
  coded("VNTTI", "KCX Tân Thuận", "Quận 7, TP. Hồ Chí Minh", "TP. Hồ Chí Minh", 10.7457, 106.7295),
  coded(
    "VNCPH",
    "Cảng Cẩm Phả (Cam Pha)",
    "TP. Cẩm Phả, Quảng Ninh",
    "Quảng Ninh",
    21.015,
    107.345,
  ),
  coded(
    "VNVUT",
    "Hoa Lư - Cái Mép",
    "TX. Phú Mỹ, Bà Rịa - Vũng Tàu",
    "Bà Rịa - Vũng Tàu",
    10.529,
    107.03,
  ),
  coded(
    "VNCVE",
    "Cảng Chùa Vẽ (Chua Ve Terminal)",
    "Quận Ngô Quyền, Hải Phòng",
    "Hải Phòng",
    20.853,
    106.713,
  ),
  coded(
    "VNBNO",
    "Cảng Ba Ngòi / Cam Ranh",
    "TP. Cam Ranh, Khánh Hòa",
    "Khánh Hòa",
    11.993,
    109.195,
  ),
  coded(
    "VNCLI",
    "Tan Cang Cat Lai Port",
    "TP. Thủ Đức, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.7704,
    106.7858,
  ),
  recoded(
    loc(
      "LOC-VNCLN",
      "Cảng Quảng Ninh / Cái Lân",
      "TP. Hạ Long, Quảng Ninh",
      "Quảng Ninh",
      20.961,
      107.062,
    ),
    "VNHLG",
  ),
  coded(
    "VNSGN",
    "Cảng TP. Hồ Chí Minh (Saigon Port)",
    "Quận 4, TP. Hồ Chí Minh",
    "TP. Hồ Chí Minh",
    10.768,
    106.708,
  ),
  coded(
    "VNNGH",
    "Cảng Nghi Sơn (Nghi Son)",
    "Khu KT Nghi Sơn, Thanh Hóa",
    "Thanh Hóa",
    19.334,
    105.774,
  ),
  // Real UN/LOCODE ports / ICDs and IATA airports (codes from the reference data).
  ...STANDARD_SEED(),
];

export const findLocation = (id: string | undefined) =>
  id ? LOCATIONS.find((l) => l.id === id) : undefined;

export const findLocationByName = (name: string) => {
  const n = name.trim().toLowerCase();
  return LOCATIONS.find(
    (l) =>
      l.code?.toLowerCase() === n ||
      l.name.toLowerCase() === n ||
      `${l.name}, ${l.address}`.toLowerCase() === n,
  );
};

/** Location master record (editable on the Location screen; used by Routing stop pickers). */
export type LocationMasterRecord = LocationRecord &
  BaseRecord & {
    // Location fields. Optional: rows saved before these existed simply lack them.
    country?: string;
    /** Seaport / Airport / Warehouse / Farm / Customer Site (legacy values are normalized on read). */
    locationType?: string;
    /** UN/LOCODE / IATA Code / Local Code, chosen on the form (older rows: derived from the code). */
    codeType?: string;
    unLocode?: string;
    iataCode?: string;
    remark?: string;
    // Legacy fields (no longer in scope) — kept so older stored rows still type-check.
    /** Removed: one Location Type only. Dropped when the row is saved again. */
    locationSubType?: string;
    serviceMode?: string;
    externalCode?: string;
    operatorName?: string;
    customsControlled?: boolean;
    bonded?: boolean;
  };

/** What the code is: a UN/LOCODE or IATA Code from the reference data, else a tenant Local Code. */
export const locationOrigin = (l: Pick<LocationMasterRecord, "code" | "codeType">): CodeKind =>
  (CODE_KINDS as readonly string[]).includes(l.codeType ?? "")
    ? (l.codeType as CodeKind)
    : codeKindOf(l.code);

/** Brings a stored row (possibly saved before the scope sign-off) to the current model. */
export function normalizeLocation(l: LocationMasterRecord): LocationMasterRecord {
  const type = normalizeLocationType(l.locationType);
  // The code itself says whether it is a UN/LOCODE or an IATA code.
  const kind = locationOrigin(l);
  const unLocode = kind === "UN/LOCODE" ? (l.code ?? "") : "";
  const iataCode = kind === "IATA Code" ? (l.code ?? "") : "";
  if (
    type === (l.locationType ?? "") &&
    unLocode === (l.unLocode ?? "") &&
    iataCode === (l.iataCode ?? "")
  )
    return l;
  return { ...l, locationType: type, unLocode, iataCode };
}

export const seedLocations = (): LocationMasterRecord[] =>
  LOCATIONS.map((l) => {
    const kind = codeKindOf(l.code);
    return {
      ...l,
      country: "Vietnam",
      locationType: guessLocationType(l.name),
      codeType: kind,
      unLocode: kind === "UN/LOCODE" ? (l.code ?? "") : "",
      iataCode: kind === "IATA Code" ? (l.code ?? "") : "",
      status: "Active",
      createdAt: "2026-09-01T02:00:00.000Z",
      createdBy: "Nguyễn Minh Anh",
      updatedAt: "2026-09-01T02:00:00.000Z",
      updatedBy: "Nguyễn Minh Anh",
    };
  });

/** Seed rows added after the first release: inserted once into existing storage when missing. */
export const seedStandardLocations = (): LocationMasterRecord[] => {
  const ids = new Set(STANDARD_SEED().map((l) => l.id));
  return seedLocations().filter((l) => ids.has(l.id));
};

/** Seed points that got their real UN/LOCODE: id → code they had before (undefined = none). */
export const SEED_CODE_FIXES: Record<string, { from: string | undefined; to: string }> = {
  "LOC-TIENSA": { from: undefined, to: "VNDTS" },
  "LOC-GIALAM": { from: undefined, to: "VNGIL" },
  "LOC-DINHVU": { from: undefined, to: "VNDVU" },
  "LOC-VNCLN": { from: "VNCLN", to: "VNHLG" },
};
