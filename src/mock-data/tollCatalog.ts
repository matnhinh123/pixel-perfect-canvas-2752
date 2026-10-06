import type { FeeType } from "@/types";

/**
 * Mock toll gate catalog used ONLY by MockRouteProvider.
 * Prices per Vietnamese toll class (Nhóm 1..5), VND per pass. Values are realistic but illustrative.
 */
export interface MockTollGate {
  id: string;
  name: string;
  address: string;
  feeType: FeeType;
  lat: number;
  lng: number;
  prices: [number, number, number, number, number];
}

export const MOCK_TOLL_GATES: MockTollGate[] = [
  {
    id: "T-XLHN",
    name: "Trạm BOT Xa lộ Hà Nội",
    address: "TP. Thủ Đức, TP.HCM",
    feeType: "Toll",
    lat: 10.8622,
    lng: 106.7905,
    prices: [15000, 20000, 25000, 40000, 55000],
  },
  {
    id: "T-PM",
    name: "Trạm BOT Cầu Phú Mỹ",
    address: "TP. Thủ Đức, TP.HCM",
    feeType: "Bridge",
    lat: 10.7636,
    lng: 106.7536,
    prices: [20000, 30000, 40000, 60000, 80000],
  },
  {
    id: "T-QL13",
    name: "Trạm BOT QL13 (Bình Phước)",
    address: "Thuận An, Bình Dương",
    feeType: "Toll",
    lat: 10.9085,
    lng: 106.7145,
    prices: [15000, 20000, 30000, 45000, 60000],
  },
  {
    id: "T-DNAI",
    name: "Trạm BOT QL1K Biên Hòa",
    address: "Biên Hòa, Đồng Nai",
    feeType: "Toll",
    lat: 10.9405,
    lng: 106.8135,
    prices: [15000, 20000, 25000, 40000, 50000],
  },
  {
    id: "T-LP",
    name: "Trạm Long Phước (CT HCM–LT–DG)",
    address: "TP. Thủ Đức, TP.HCM",
    feeType: "Toll",
    lat: 10.8076,
    lng: 106.8458,
    prices: [40000, 60000, 85000, 130000, 180000],
  },
  {
    id: "T-HNHP6",
    name: "Trạm Cao tốc HN–HP (Km 6)",
    address: "Gia Lâm, Hà Nội",
    feeType: "Toll",
    lat: 21.0098,
    lng: 105.9905,
    prices: [140000, 200000, 280000, 420000, 560000],
  },
  {
    id: "T-QL5",
    name: "Trạm BOT QL5 (Hải Dương)",
    address: "Cẩm Giàng, Hải Dương",
    feeType: "Toll",
    lat: 20.9599,
    lng: 106.2122,
    prices: [35000, 50000, 75000, 120000, 180000],
  },
  {
    id: "T-DV",
    name: "Trạm Cầu Đình Vũ",
    address: "Hải An, Hải Phòng",
    feeType: "Bridge",
    lat: 20.8445,
    lng: 106.7425,
    prices: [10000, 15000, 20000, 30000, 40000],
  },
  {
    id: "T-DNQN",
    name: "Trạm Cao tốc ĐN–QN",
    address: "Điện Bàn, Quảng Nam",
    feeType: "Toll",
    lat: 15.9312,
    lng: 108.2479,
    prices: [60000, 90000, 120000, 190000, 260000],
  },
];
