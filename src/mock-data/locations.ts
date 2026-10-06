import type { LocationRecord } from "@/types";

const loc = (
  id: string,
  name: string,
  address: string,
  province: string,
  lat: number,
  lng: number,
): LocationRecord => ({ id, name, address, province, lat, lng });

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
  loc("LOC-TIENSA", "Cảng Tiên Sa", "Quận Sơn Trà, Đà Nẵng", "Đà Nẵng", 16.1225, 108.218),
  loc("LOC-HUE", "Huế", "TP. Huế, Thừa Thiên Huế", "Thừa Thiên Huế", 16.4637, 107.5909),
  // Miền Bắc
  loc("LOC-HANOI", "Hà Nội", "Quận Hoàn Kiếm, Hà Nội", "Hà Nội", 21.0285, 105.8542),
  loc("LOC-GIALAM", "ICD Gia Lâm", "Quận Long Biên, Hà Nội", "Hà Nội", 21.0359, 105.9257),
  loc("LOC-HAIDUONG", "Hải Dương", "TP. Hải Dương, Hải Dương", "Hải Dương", 20.9373, 106.3146),
  loc("LOC-HAIPHONG", "Hải Phòng", "Quận Hồng Bàng, Hải Phòng", "Hải Phòng", 20.8449, 106.6881),
  loc("LOC-DINHVU", "Cảng Đình Vũ", "Quận Hải An, Hải Phòng", "Hải Phòng", 20.8379, 106.7737),
];

export const findLocation = (id: string | undefined) =>
  id ? LOCATIONS.find((l) => l.id === id) : undefined;

export const findLocationByName = (name: string) => {
  const n = name.trim().toLowerCase();
  return LOCATIONS.find(
    (l) => l.name.toLowerCase() === n || `${l.name}, ${l.address}`.toLowerCase() === n,
  );
};
