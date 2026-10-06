// Mock data for the MoveX demo. Replace with real API responses later (see src/lib/api.ts).

export type RouteType = "Single Trip" | "Round Trip";
export type VehicleProfile = "Car" | "Motorcycle" | "Truck" | "Container";
export type VehicleGroup = "Light Truck" | "Medium Truck" | "Heavy Truck" | "Tractor / Container Truck";
export type Status = "Active" | "Draft" | "Inactive";

export interface Point { name: string; x: number; y: number }
export interface TollLine {
  order: number;
  station: string;
  feeType: "Per pass" | "Ferry" | "Bridge";
  tollGroup: string;
  unitPrice: number;
  passCount: number;
  source: "Auto" | "Manual";
  x: number;
  y: number;
}
export interface ManualCost { id: string; reason: string; amount: number }
export interface AuditEntry { id: string; user: string; time: string; action: string; detail?: string; entity?: string }

export interface RouteRecord {
  id: string;
  code: string;
  name: string;
  origin: Point;
  waypoints: Point[];
  destination: Point;
  type: RouteType;
  vehicleProfile: VehicleProfile;
  vehicleGroup: VehicleGroup;
  capacityKg?: number;
  distanceKm: number;
  durationMin: number;
  status: Status;
  tolls: TollLine[];
  manualCosts: ManualCost[];
  returnMode?: "auto" | "custom";
  audit: AuditEntry[];
}

const baseAudit = (code: string): AuditEntry[] => [
  { id: "a1", user: "Nguyễn Minh Anh", time: "2026-09-12 08:24", action: "Created route", detail: `Route ${code} created` },
  { id: "a2", user: "Trần Quốc Bảo", time: "2026-09-14 10:02", action: "Updated route points", detail: "Added waypoint" },
  { id: "a3", user: "Trần Quốc Bảo", time: "2026-09-14 10:05", action: "Changed vehicle profile", detail: "Truck → Container" },
  { id: "a4", user: "System", time: "2026-09-14 10:06", action: "Recalculated toll cost", detail: "Toll engine v2.3" },
  { id: "a5", user: "Lê Thu Hà", time: "2026-09-20 15:41", action: "Added manual ferry surcharge", detail: "+ 120.000 ₫" },
  { id: "a6", user: "Lê Thu Hà", time: "2026-09-21 09:12", action: "Changed route type", detail: "Single Trip → Round Trip" },
];

export const routes: RouteRecord[] = [
  {
    id: "R001", code: "RT-HCM-CL", name: "HCM → Cảng Cát Lái",
    origin: { name: "Kho Tân Bình, TP.HCM", x: 80, y: 220 },
    waypoints: [{ name: "Ngã tư Thủ Đức", x: 260, y: 160 }],
    destination: { name: "Cảng Cát Lái, TP. Thủ Đức", x: 470, y: 120 },
    type: "Round Trip", vehicleProfile: "Container", vehicleGroup: "Tractor / Container Truck", capacityKg: 28000,
    distanceKm: 24.5, durationMin: 55, status: "Active", returnMode: "auto",
    tolls: [
      { order: 1, station: "Trạm Xa lộ Hà Nội", feeType: "Per pass", tollGroup: "Nhóm 5", unitPrice: 180000, passCount: 1, source: "Auto", x: 200, y: 180 },
      { order: 2, station: "Phà Cát Lái", feeType: "Ferry", tollGroup: "Nhóm 5", unitPrice: 120000, passCount: 1, source: "Manual", x: 400, y: 135 },
    ],
    manualCosts: [{ id: "m1", reason: "Ferry surcharge giờ cao điểm", amount: 120000 }],
    audit: baseAudit("RT-HCM-CL"),
  },
  {
    id: "R002", code: "RT-HCM-BD", name: "HCM → KCN VSIP Bình Dương",
    origin: { name: "Kho Quận 7, TP.HCM", x: 90, y: 240 },
    waypoints: [{ name: "Trạm Sóng Thần", x: 240, y: 150 }],
    destination: { name: "KCN VSIP I, Thuận An", x: 450, y: 70 },
    type: "Single Trip", vehicleProfile: "Truck", vehicleGroup: "Medium Truck", capacityKg: 8000,
    distanceKm: 38.2, durationMin: 80, status: "Active",
    tolls: [
      { order: 1, station: "Trạm Quốc lộ 13", feeType: "Per pass", tollGroup: "Nhóm 3", unitPrice: 75000, passCount: 1, source: "Auto", x: 320, y: 115 },
    ],
    manualCosts: [], audit: baseAudit("RT-HCM-BD").slice(0, 4),
  },
  {
    id: "R003", code: "RT-HN-HP", name: "Hà Nội → Cảng Hải Phòng",
    origin: { name: "ICD Gia Lâm, Hà Nội", x: 70, y: 150 },
    waypoints: [{ name: "Hải Dương", x: 270, y: 170 }],
    destination: { name: "Cảng Đình Vũ, Hải Phòng", x: 490, y: 200 },
    type: "Round Trip", vehicleProfile: "Container", vehicleGroup: "Tractor / Container Truck", capacityKg: 30000,
    distanceKm: 105.4, durationMin: 130, status: "Active", returnMode: "custom",
    tolls: [
      { order: 1, station: "Trạm Cao tốc HN-HP (km 6)", feeType: "Per pass", tollGroup: "Nhóm 5", unitPrice: 480000, passCount: 1, source: "Auto", x: 150, y: 158 },
      { order: 2, station: "Trạm Cầu Bạch Đằng", feeType: "Bridge", tollGroup: "Nhóm 5", unitPrice: 160000, passCount: 1, source: "Auto", x: 410, y: 190 },
    ],
    manualCosts: [], audit: baseAudit("RT-HN-HP"),
  },
  {
    id: "R004", code: "RT-DN-CL", name: "Đà Nẵng → KKT Chu Lai",
    origin: { name: "Cảng Tiên Sa, Đà Nẵng", x: 90, y: 60 },
    waypoints: [{ name: "Hội An", x: 200, y: 140 }, { name: "Tam Kỳ", x: 360, y: 210 }],
    destination: { name: "KKT Chu Lai, Quảng Nam", x: 480, y: 250 },
    type: "Single Trip", vehicleProfile: "Truck", vehicleGroup: "Heavy Truck", capacityKg: 15000,
    distanceKm: 96.7, durationMin: 120, status: "Draft",
    tolls: [
      { order: 1, station: "Trạm Cao tốc ĐN-QN", feeType: "Per pass", tollGroup: "Nhóm 4", unitPrice: 340000, passCount: 1, source: "Auto", x: 280, y: 175 },
    ],
    manualCosts: [], audit: baseAudit("RT-DN-CL").slice(0, 2),
  },
  {
    id: "R005", code: "RT-HCM-VT", name: "HCM → Cảng Cái Mép",
    origin: { name: "Kho Bình Chánh, TP.HCM", x: 60, y: 90 },
    waypoints: [{ name: "Long Thành", x: 230, y: 130 }],
    destination: { name: "Cảng Cái Mép, BR-VT", x: 480, y: 240 },
    type: "Round Trip", vehicleProfile: "Container", vehicleGroup: "Tractor / Container Truck", capacityKg: 30000,
    distanceKm: 82.3, durationMin: 110, status: "Active", returnMode: "auto",
    tolls: [
      { order: 1, station: "Trạm Long Phước", feeType: "Per pass", tollGroup: "Nhóm 5", unitPrice: 260000, passCount: 1, source: "Auto", x: 170, y: 115 },
      { order: 2, station: "Trạm Cầu Phú Mỹ", feeType: "Bridge", tollGroup: "Nhóm 5", unitPrice: 175000, passCount: 1, source: "Auto", x: 330, y: 175 },
    ],
    manualCosts: [], audit: baseAudit("RT-HCM-VT"),
  },
  {
    id: "R006", code: "RT-HCM-DN", name: "HCM → KCN Biên Hòa (Dầu Giây)",
    origin: { name: "Kho Thủ Đức, TP.HCM", x: 70, y: 200 },
    waypoints: [],
    destination: { name: "KCN Dầu Giây, Đồng Nai", x: 470, y: 90 },
    type: "Single Trip", vehicleProfile: "Car", vehicleGroup: "Light Truck",
    distanceKm: 62.0, durationMin: 75, status: "Inactive",
    tolls: [
      { order: 1, station: "Trạm Dầu Giây", feeType: "Per pass", tollGroup: "Nhóm 1", unitPrice: 45000, passCount: 1, source: "Auto", x: 380, y: 115 },
    ],
    manualCosts: [], audit: baseAudit("RT-HCM-DN").slice(0, 3),
  },
];

export const tollStations = ["Trạm Long Phước", "Trạm Dầu Giây", "Trạm Cầu Phú Mỹ", "Phà Cát Lái", "Trạm Xa lộ Hà Nội", "Trạm Quốc lộ 13"];

// ---------- Services ----------
export type TemplateType = "Trucking" | "Customs" | "Freight";
export interface FieldConfig { key: string; label: string; visible: boolean; required: boolean; mandatory?: boolean }
export interface ServiceRecord {
  id: string; code: string; name: string; group: string; template: TemplateType;
  childCount: number; status: Status; description: string;
}

export const services: ServiceRecord[] = [
  { id: "S001", code: "SV-TRK-DOM", name: "Trucking - Nội địa", group: "Vận tải đường bộ", template: "Trucking", childCount: 6, status: "Active", description: "Vận chuyển hàng nội địa bằng xe tải / container." },
  { id: "S002", code: "SV-TRK-CB", name: "Trucking - Xuyên biên giới", group: "Vận tải đường bộ", template: "Trucking", childCount: 3, status: "Active", description: "Vận chuyển VN – Lào – Campuchia." },
  { id: "S003", code: "SV-CUS-IMP", name: "Customs - Nhập khẩu", group: "Thủ tục hải quan", template: "Customs", childCount: 4, status: "Active", description: "Khai báo hải quan hàng nhập khẩu." },
  { id: "S004", code: "SV-CUS-EXP", name: "Customs - Xuất khẩu", group: "Thủ tục hải quan", template: "Customs", childCount: 4, status: "Draft", description: "Khai báo hải quan hàng xuất khẩu." },
  { id: "S005", code: "SV-FRT-SEX", name: "Freight - Sea Export", group: "Cước quốc tế", template: "Freight", childCount: 5, status: "Active", description: "Cước biển xuất khẩu FCL/LCL." },
  { id: "S006", code: "SV-FRT-AIR", name: "Freight - Air Import", group: "Cước quốc tế", template: "Freight", childCount: 2, status: "Inactive", description: "Cước hàng không nhập khẩu." },
];

export const templateFields: Record<TemplateType, FieldConfig[]> = {
  Trucking: [
    { key: "origin", label: "Origin", visible: true, required: true, mandatory: true },
    { key: "destination", label: "Destination", visible: true, required: true, mandatory: true },
    { key: "vehicleType", label: "Vehicle Type", visible: true, required: true },
    { key: "containerSize", label: "Container Size", visible: true, required: false },
    { key: "containerType", label: "Container Type", visible: false, required: false },
  ],
  Customs: [
    { key: "declarationType", label: "Declaration Type", visible: true, required: true, mandatory: true },
    { key: "borderGate", label: "Border Gate", visible: true, required: false },
    { key: "ieType", label: "Import/Export Type", visible: true, required: true },
  ],
  Freight: [
    { key: "bl", label: "B/L Number", visible: true, required: true, mandatory: true },
    { key: "polpod", label: "POL / POD / Airport", visible: true, required: true },
    { key: "carrier", label: "Carrier / Airline", visible: true, required: false },
  ],
};

// ---------- Costs ----------
export interface OperatingCost { code: string; name: string; category: string; unit: string; amount: number; vehicleGroup: string; status: Status }
export const operatingCosts: OperatingCost[] = [
  { code: "OP-FUEL", name: "Nhiên liệu dầu DO", category: "Variable", unit: "₫/km", amount: 9500, vehicleGroup: "Tractor / Container Truck", status: "Active" },
  { code: "OP-DRV", name: "Lương tài xế", category: "Driver", unit: "₫/chuyến", amount: 450000, vehicleGroup: "All", status: "Active" },
  { code: "OP-DEP", name: "Khấu hao xe", category: "Fixed", unit: "₫/ngày", amount: 650000, vehicleGroup: "Heavy Truck", status: "Active" },
  { code: "OP-TIRE", name: "Hao mòn lốp", category: "Variable", unit: "₫/km", amount: 1200, vehicleGroup: "All", status: "Draft" },
  { code: "OP-INS", name: "Bảo hiểm xe", category: "Fixed", unit: "₫/tháng", amount: 3200000, vehicleGroup: "All", status: "Active" },
];
export interface PricingInput { code: string; route: string; service: string; cogs: number; margin: number; status: Status }
export const pricingInputs: PricingInput[] = [
  { code: "PI-001", route: "RT-HCM-CL", service: "Trucking - Nội địa", cogs: 2150000, margin: 18, status: "Active" },
  { code: "PI-002", route: "RT-HN-HP", service: "Trucking - Nội địa", cogs: 5480000, margin: 15, status: "Active" },
  { code: "PI-003", route: "RT-HCM-VT", service: "Freight - Sea Export", cogs: 4320000, margin: 20, status: "Draft" },
  { code: "PI-004", route: "RT-DN-CL", service: "Trucking - Nội địa", cogs: 3900000, margin: 16, status: "Draft" },
];

export const globalAudit: AuditEntry[] = [
  { id: "g1", user: "Lê Thu Hà", time: "2026-10-05 16:20", action: "Added manual ferry surcharge", entity: "Route RT-HCM-CL", detail: "+ 120.000 ₫" },
  { id: "g2", user: "System", time: "2026-10-05 09:00", action: "Recalculated toll cost", entity: "Route RT-HN-HP" },
  { id: "g3", user: "Trần Quốc Bảo", time: "2026-10-04 14:11", action: "Toggled field required", entity: "Service SV-TRK-DOM", detail: "Container Size → optional" },
  { id: "g4", user: "Nguyễn Minh Anh", time: "2026-10-03 11:45", action: "Created route", entity: "Route RT-DN-CL" },
  { id: "g5", user: "Phạm Gia Huy", time: "2026-10-02 08:30", action: "Updated operating cost", entity: "Cost OP-FUEL", detail: "9.200 → 9.500 ₫/km" },
  { id: "g6", user: "Lê Thu Hà", time: "2026-10-01 17:02", action: "Changed route type", entity: "Route RT-HCM-VT", detail: "Single Trip → Round Trip" },
];
