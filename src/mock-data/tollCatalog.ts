import type { FeeType } from "@/types";

/**
 * Mock toll gate catalog (Toll Station master data) used by MockRouteProvider and the Toll Station list.
 * Prices per Vietnamese toll class (Nhóm 1..5), VND per pass. Values are realistic but illustrative.
 */
export interface MockTollGate {
  id: string;
  code: string;
  name: string;
  address: string;
  province: string;
  road: string;
  feeType: FeeType;
  lat: number;
  lng: number;
  prices: [number, number, number, number, number];
}

export const MOCK_TOLL_GATES: MockTollGate[] = [
  {
    id: "T-XLHN",
    code: "XLHN-TD",
    name: "Trạm BOT Xa lộ Hà Nội",
    address: "TP. Thủ Đức",
    province: "TP. Hồ Chí Minh",
    road: "Xa lộ Hà Nội",
    feeType: "Toll",
    lat: 10.8622,
    lng: 106.7905,
    prices: [15000, 20000, 25000, 40000, 55000],
  },
  {
    id: "T-PM",
    code: "CPM-TD",
    name: "Trạm BOT Cầu Phú Mỹ",
    address: "TP. Thủ Đức",
    province: "TP. Hồ Chí Minh",
    road: "Cầu Phú Mỹ",
    feeType: "Bridge",
    lat: 10.73,
    lng: 106.757,
    prices: [20000, 30000, 40000, 60000, 80000],
  },
  {
    id: "T-QL13",
    code: "QL13-BP",
    name: "Trạm BOT QL13 (Bình Phước)",
    address: "Thuận An",
    province: "Bình Dương",
    road: "QL13",
    feeType: "Toll",
    lat: 10.9085,
    lng: 106.7145,
    prices: [15000, 20000, 30000, 45000, 60000],
  },
  {
    id: "T-DNAI",
    code: "QL1K-BH",
    name: "Trạm BOT QL1K Biên Hòa",
    address: "Biên Hòa",
    province: "Đồng Nai",
    road: "QL1K",
    feeType: "Toll",
    lat: 10.9405,
    lng: 106.8135,
    prices: [15000, 20000, 25000, 40000, 50000],
  },
  {
    id: "T-LP",
    code: "QL51-LT",
    name: "Trạm Long Thành",
    address: "Long Thành",
    province: "Đồng Nai",
    road: "CT HCM–Long Thành–Dầu Giây",
    feeType: "Toll",
    lat: 10.7632,
    lng: 106.8791,
    prices: [40000, 60000, 85000, 130000, 180000],
  },
  {
    id: "T-DG",
    code: "DGL-DG",
    name: "Trạm Dầu Giây",
    address: "Thống Nhất",
    province: "Đồng Nai",
    road: "CT Dầu Giây–Phan Thiết",
    feeType: "Toll",
    lat: 10.948,
    lng: 107.14,
    prices: [35000, 50000, 70000, 110000, 160000],
  },
  {
    id: "T-TB",
    code: "QL1A-TB",
    name: "Trạm Tam Bình",
    address: "Di Linh",
    province: "Lâm Đồng",
    road: "QL20",
    feeType: "Toll",
    lat: 11.6774,
    lng: 107.9282,
    prices: [35000, 50000, 75000, 120000, 180000],
  },
  {
    id: "T-PT",
    code: "QL1A-PT",
    name: "Trạm Phú Tài",
    address: "TP. Quy Nhơn",
    province: "Bình Định",
    road: "QL1A",
    feeType: "Toll",
    lat: 13.9266,
    lng: 109.1923,
    prices: [35000, 50000, 75000, 120000, 180000],
  },
  {
    id: "T-BN",
    code: "QL1A-BN",
    name: "Trạm Bắc Nam",
    address: "Đức Phổ",
    province: "Quảng Ngãi",
    road: "QL1A",
    feeType: "Toll",
    lat: 15.2112,
    lng: 108.7624,
    prices: [35000, 50000, 75000, 120000, 180000],
  },
  {
    id: "T-HNHP6",
    code: "HNHP-K6",
    name: "Trạm Cao tốc HN–HP (Km 6)",
    address: "Gia Lâm",
    province: "Hà Nội",
    road: "CT Hà Nội–Hải Phòng",
    feeType: "Toll",
    lat: 21.0098,
    lng: 105.9905,
    prices: [140000, 200000, 280000, 420000, 560000],
  },
  {
    id: "T-QL5",
    code: "QL5-HD",
    name: "Trạm BOT QL5 (Hải Dương)",
    address: "Cẩm Giàng",
    province: "Hải Dương",
    road: "QL5",
    feeType: "Toll",
    lat: 20.9599,
    lng: 106.2122,
    prices: [35000, 50000, 75000, 120000, 180000],
  },
  {
    id: "T-DV",
    code: "CDV-HP",
    name: "Trạm Cầu Đình Vũ",
    address: "Hải An",
    province: "Hải Phòng",
    road: "Cầu Đình Vũ",
    feeType: "Bridge",
    lat: 20.8445,
    lng: 106.7425,
    prices: [10000, 15000, 20000, 30000, 40000],
  },
  {
    id: "T-DNQN",
    code: "CT-DNQN",
    name: "Trạm Cao tốc ĐN–QN",
    address: "Điện Bàn",
    province: "Quảng Nam",
    road: "CT Đà Nẵng–Quảng Ngãi",
    feeType: "Toll",
    lat: 15.9312,
    lng: 108.2479,
    prices: [60000, 90000, 120000, 190000, 260000],
  },
  {
    id: "T-PHACL",
    code: "PHA-CL",
    name: "Phà Cát Lái",
    address: "TP. Thủ Đức",
    province: "TP. Hồ Chí Minh",
    road: "Phà Cát Lái – Nhơn Trạch",
    feeType: "Ferry",
    lat: 10.7593,
    lng: 106.794,
    prices: [35000, 45000, 60000, 80000, 100000],
  },
];

/** Gates the routing engine returns that are not (yet) in Toll Station master data — "Chưa đối chiếu". */
export const PROVIDER_ONLY_GATES: { name: string; prices: MockTollGate["prices"] }[] = [
  { name: "Trạm BOT Ninh Lộc", prices: [15000, 20000, 30000, 45000, 60000] },
  { name: "Trạm BOT tuyến tránh Phan Rang", prices: [25000, 35000, 50000, 65000, 90000] },
];
