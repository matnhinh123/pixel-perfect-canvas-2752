// Demo seed data. Loaded into localStorage on first visit (or after "Reset demo data").
import type {
  AuditEvent,
  CostLine,
  CostRecord,
  ImportBatch,
  RouteRecord,
  RoutePoint,
  ServiceRecord,
  TenantTemplateConfig,
  VehicleGroup,
  RouteType,
} from "@/types";
import { computeMockRoute, computeMockRoutes } from "@/services/routing/MockRouteProvider";
import { LOCATIONS } from "./locations";
import { findVehicle, routeVehicleFields } from "./vehicles";
import { TEMPLATE_FIELDS } from "./templates";
import { defaultCostLines } from "./rates";
import { snapshotOf, summarize } from "@/services/cost/costMath";

const pt = (id: string): RoutePoint => {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown location ${id}`);
  return { name: l.name, address: l.province, lat: l.lat, lng: l.lng, locationId: l.id };
};

const SEED_TIME = "2026-09-15T08:00:00.000Z";
const meta = (by: string, at = SEED_TIME) => ({
  createdAt: at,
  createdBy: by,
  updatedAt: at,
  updatedBy: by,
});

interface RouteSeed {
  id: string;
  code: string;
  name: string;
  type: RouteType;
  o: string;
  wps: string[];
  d: string;
  vehicle: string;
  status: RouteRecord["status"];
  departure: string;
  avoidFerry?: boolean;
  /** Index of the alternative the user picked (0 = recommended). */
  selected?: number;
  returnMode?: "auto" | "custom";
  returnWps?: string[];
  calc?: boolean;
  manual?: RouteRecord["manualCosts"];
  description?: string;
}

const routeSeeds: RouteSeed[] = [
  {
    id: "R000",
    code: "RT-HCM-DN",
    name: "HCM → Đà Nẵng",
    description:
      "Tuyến vận chuyển hàng từ TP.HCM đi Đà Nẵng qua QL1A và cao tốc, áp dụng cho xe tải.",
    type: "Single Trip",
    o: "LOC-HCM",
    wps: ["LOC-LONGTHANH", "LOC-DAUGIAY", "LOC-QUYNHON"],
    d: "LOC-DANANG",
    vehicle: "V-51D12345",
    departure: "2026-10-06T14:30",
    avoidFerry: true,
    status: "Active",
  },
  {
    id: "R001",
    code: "RT-HCM-CL",
    name: "HCM → Cảng Cát Lái",
    type: "Round Trip",
    o: "LOC-HCM-TB",
    wps: ["LOC-TD-NT"],
    d: "LOC-CATLAI",
    vehicle: "V-51R88888",
    departure: "2026-10-06T07:00",
    status: "Active",
    returnMode: "auto",
    manual: [
      {
        id: "MC-1",
        costType: "Peak-hour surcharge",
        amount: 50000,
        reason: "Phụ phí vào cảng giờ cao điểm",
        note: "Áp dụng khung 6h–9h",
      },
    ],
  },
  {
    id: "R002",
    code: "RT-HCM-BD",
    name: "HCM → Bình Dương",
    type: "Single Trip",
    o: "LOC-HCM-Q7",
    wps: ["LOC-SONGTHAN"],
    d: "LOC-BINHDUONG",
    vehicle: "V-51C67890",
    departure: "2026-10-07T09:30",
    status: "Active",
  },
  {
    id: "R003",
    code: "RT-HCM-DN01",
    name: "HCM → Đồng Nai",
    type: "Single Trip",
    o: "LOC-HCM-TD",
    wps: [],
    d: "LOC-BIENHOA2",
    vehicle: "V-29H13579",
    departure: "2026-10-07T13:00",
    status: "Active",
  },
  {
    id: "R004",
    code: "RT-HN-HP",
    name: "Hà Nội → Hải Phòng",
    type: "Round Trip",
    o: "LOC-GIALAM",
    wps: ["LOC-HAIDUONG"],
    d: "LOC-DINHVU",
    vehicle: "V-51R88888",
    departure: "2026-10-08T05:30",
    selected: 1,
    status: "Active",
    returnMode: "custom",
    returnWps: ["LOC-HAIPHONG"],
  },
  {
    id: "R005",
    code: "RT-DAD-CL",
    name: "Đà Nẵng → KKT Chu Lai",
    type: "Single Trip",
    o: "LOC-TIENSA",
    wps: ["LOC-HOIAN"],
    d: "LOC-CHULAI",
    vehicle: "V-51D12345",
    departure: "2026-10-09T08:00",
    status: "Draft",
    calc: false,
  },
  {
    id: "R006",
    code: "RT-HCM-LT",
    name: "HCM → Long Thành",
    type: "Single Trip",
    o: "LOC-HCM",
    wps: [],
    d: "LOC-LONGTHANH",
    vehicle: "V-50H24680",
    departure: "2026-09-20T10:00",
    status: "Inactive",
  },
  {
    id: "R007",
    code: "RT-DN-QN",
    name: "Đà Nẵng → Quy Nhơn",
    type: "Single Trip",
    o: "LOC-DANANG",
    wps: ["LOC-TAMKY"],
    d: "LOC-QUYNHON",
    vehicle: "V-51D12345",
    departure: "2026-10-10T20:00",
    selected: 2,
    status: "Active",
  },
];

function buildRoute(s: RouteSeed): RouteRecord {
  const vehicle = findVehicle(s.vehicle);
  if (!vehicle) throw new Error(`Unknown vehicle ${s.vehicle}`);
  const origin = pt(s.o),
    destination = pt(s.d),
    waypoints = s.wps.map(pt),
    returnWaypoints = (s.returnWps ?? []).map(pt);
  const req = (pts: RoutePoint[]) => ({
    points: pts,
    vehicle: vehicle.profile,
    capacityKg: vehicle.weightKg,
    avoidFerry: !!s.avoidFerry,
    departureTime: s.departure,
  });
  const calc = s.calc !== false;
  const alternatives = calc
    ? computeMockRoutes(req([origin, ...waypoints, destination]), SEED_TIME)
    : [];
  const outbound = alternatives[s.selected ?? 0] ?? null;
  const back = s.returnMode === "custom" ? returnWaypoints : [...waypoints].reverse();
  const returnLeg =
    calc && s.type === "Round Trip"
      ? computeMockRoute(req([destination, ...back, origin]), SEED_TIME)
      : null;
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description ?? `Tuyến ${s.name}`,
    type: s.type,
    origin,
    waypoints,
    destination,
    ...routeVehicleFields(vehicle),
    departureTime: s.departure,
    avoidFerry: !!s.avoidFerry,
    alternatives,
    selectedRouteId: outbound?.id ?? null,
    outbound,
    returnMode: s.returnMode ?? "auto",
    returnWaypoints,
    returnLeg,
    manualCosts: s.manual ?? [],
    status: s.status,
    ...meta("Thuy Vu"),
  };
}

export const seedRoutes = (): RouteRecord[] => routeSeeds.map(buildRoute);

// ---------- Services ----------
export const seedServices = (): ServiceRecord[] => {
  const m = meta("Nguyễn Minh Anh", "2026-09-01T03:00:00.000Z");
  const root = (
    id: string,
    code: string,
    name: string,
    template: ServiceRecord["template"],
    description: string,
  ): ServiceRecord => ({
    id,
    code,
    name,
    parentId: null,
    template,
    description,
    status: "Active",
    ...m,
  });
  const child = (
    id: string,
    code: string,
    name: string,
    parentId: string,
    description: string,
    status: ServiceRecord["status"] = "Active",
  ): ServiceRecord => ({ id, code, name, parentId, template: null, description, status, ...m });
  return [
    root("S-TRK", "SG-TRK", "Trucking Services", "Trucking", "Nhóm dịch vụ vận tải đường bộ."),
    root("S-CUS", "SG-CUS", "Customs Services", "Customs", "Nhóm dịch vụ thủ tục hải quan."),
    root(
      "S-FRT",
      "SG-FRT",
      "Freight Services",
      "Freight",
      "Nhóm dịch vụ cước quốc tế (biển / hàng không).",
    ),
    child(
      "S001",
      "SV-TRK-DOM",
      "Domestic Trucking",
      "S-TRK",
      "Vận chuyển hàng nội địa bằng xe tải.",
    ),
    child("S002", "SV-TRK-CTN", "Container Trucking", "S-TRK", "Kéo container cảng – kho – KCN."),
    child("S003", "SV-CUS-IMP", "Import Customs", "S-CUS", "Khai báo hải quan hàng nhập khẩu."),
    child(
      "S004",
      "SV-CUS-EXP",
      "Export Customs",
      "S-CUS",
      "Khai báo hải quan hàng xuất khẩu.",
      "Draft",
    ),
    child("S005", "SV-FRT-SEX", "Sea Freight Export", "S-FRT", "Cước biển xuất khẩu FCL/LCL."),
    child(
      "S006",
      "SV-FRT-AIR",
      "Air Freight Import",
      "S-FRT",
      "Cước hàng không nhập khẩu.",
      "Inactive",
    ),
  ];
};

export const seedTemplateConfig = (): TenantTemplateConfig => {
  const cfg = {} as TenantTemplateConfig;
  for (const [t, fields] of Object.entries(TEMPLATE_FIELDS) as [
    keyof typeof TEMPLATE_FIELDS,
    (typeof TEMPLATE_FIELDS)["Trucking"],
  ][]) {
    cfg[t] = Object.fromEntries(
      fields.map((f) => [f.key, { visible: f.defaultVisible, required: f.defaultRequired }]),
    );
  }
  cfg.Trucking["containerType"] = { visible: false, required: false };
  return cfg;
};

// ---------- Costs ----------
export const seedCosts = (routes: RouteRecord[]): CostRecord[] => {
  const byId = (id: string) => routes.find((r) => r.id === id)!;
  const make = (
    id: string,
    code: string,
    routeId: string,
    group: VehicleGroup,
    versions: {
      v: number;
      eff: string;
      status: "Active" | "Superseded" | "Draft";
      bump?: number;
      note?: string;
    }[],
    status: CostRecord["status"] = "Active",
  ): CostRecord => {
    const r = byId(routeId);
    const s = snapshotOf(r);
    return {
      id,
      code,
      name: `${r.code} · ${group}`,
      routeId,
      vehicleGroup: group,
      status,
      versions: versions.map((x) => {
        const lines: CostLine[] = defaultCostLines(group).map((l) =>
          x.bump && l.category === "Fuel" ? { ...l, rate: Math.round(l.rate * x.bump) } : l,
        );
        return {
          version: x.v,
          effectiveFrom: x.eff,
          status: x.status,
          lines,
          routeSnapshot: s,
          totalEstimated: summarize(lines, s).total,
          createdAt: `${x.eff}T02:00:00.000Z`,
          createdBy: "Thuy Vu",
          ...(x.note ? { note: x.note } : {}),
        };
      }),
      ...meta("Thuy Vu"),
    };
  };
  return [
    make("C001", "CST-HCM-CL-TRC", "R001", "Tractor / Container Truck", [
      { v: 1, eff: "2026-09-01", status: "Superseded", note: "Initial cost" },
      { v: 2, eff: "2026-10-01", status: "Active", bump: 1.06, note: "Fuel price +6%" },
    ]),
    make("C002", "CST-HCM-BD-MED", "R002", "Medium Truck", [
      { v: 1, eff: "2026-09-01", status: "Active" },
    ]),
    make("C003", "CST-HCM-DNAI-LGT", "R003", "Light Truck", [
      { v: 1, eff: "2026-09-01", status: "Active" },
    ]),
    make("C004", "CST-HCM-DNAI-MED", "R003", "Medium Truck", [
      { v: 1, eff: "2026-09-01", status: "Active" },
    ]),
    make(
      "C005",
      "CST-HCM-DNAI-HVY",
      "R003",
      "Heavy Truck",
      [{ v: 1, eff: "2026-09-15", status: "Draft" }],
      "Draft",
    ),
    make("C006", "CST-HN-HP-TRC", "R004", "Tractor / Container Truck", [
      { v: 1, eff: "2026-09-01", status: "Active" },
      { v: 2, eff: "2026-11-01", status: "Draft", bump: 1.04, note: "Draft for Q4 fuel update" },
    ]),
  ];
};

// ---------- Audit ----------
export const seedAudit = (): AuditEvent[] => {
  let n = 0;
  const e = (
    timestamp: string,
    user: string,
    action: AuditEvent["action"],
    entityType: AuditEvent["entityType"],
    entityId: string,
    entityLabel: string,
    extra: Partial<AuditEvent> = {},
  ): AuditEvent => ({
    id: `seed-${++n}`,
    timestamp,
    user,
    action,
    entityType,
    entityId,
    entityLabel,
    ...extra,
  });
  return [
    e("2026-09-15T03:00:00.000Z", "Thuy Vu", "CREATE", "Route", "R001", "RT-HCM-CL"),
    // RT-HCM-DN — full editing story for the demo audit drawer.
    e("2026-10-05T02:10:00.000Z", "Thuy Vu", "CREATE", "Route", "R000", "RT-HCM-DN", {
      note: "Single Trip · TP. Hồ Chí Minh → Long Thành → Dầu Giây → Đà Nẵng",
    }),
    e("2026-10-05T02:15:00.000Z", "Thuy Vu", "CHANGE_VEHICLE", "Route", "R000", "RT-HCM-DN", {
      field: "Vehicle",
      oldValue: "51C-67890 — Isuzu 5T",
      newValue: "51D-12345 — Hino 15T",
    }),
    e("2026-10-05T02:18:00.000Z", "Thuy Vu", "ADD_WAYPOINT", "Route", "R000", "RT-HCM-DN", {
      field: "Waypoints",
      oldValue: "Long Thành → Dầu Giây",
      newValue: "Long Thành → Dầu Giây → Quy Nhơn",
    }),
    e(
      "2026-10-05T02:20:00.000Z",
      "Thuy Vu",
      "CHANGE_DEPARTURE_TIME",
      "Route",
      "R000",
      "RT-HCM-DN",
      { field: "Departure Time", oldValue: "06/10/2026 08:00", newValue: "06/10/2026 14:30" },
    ),
    e("2026-10-05T02:22:00.000Z", "Thuy Vu", "CALCULATE_ROUTE", "Route", "R000", "RT-HCM-DN", {
      field: "Alternatives",
      newValue: "3 tuyến",
      note: "Mock provider · Tuyến 1 (đề xuất) được chọn mặc định",
    }),
    e("2026-10-05T02:24:00.000Z", "Thuy Vu", "SELECT_ALTERNATIVE", "Route", "R000", "RT-HCM-DN", {
      field: "Selected Route",
      oldValue: "Tuyến 2",
      newValue: "Tuyến 1 (Đề xuất)",
    }),
    e("2026-10-05T02:30:00.000Z", "Thuy Vu", "UPDATE_STATUS", "Route", "R000", "RT-HCM-DN", {
      field: "Status",
      oldValue: "Draft",
      newValue: "Active",
    }),
    e("2026-10-05T03:20:00.000Z", "Thuy Vu", "CHANGE_VEHICLE", "Route", "R001", "RT-HCM-CL", {
      field: "Vehicle",
      oldValue: "51D-12345 — Hino 15T",
      newValue: "51R-88888 — Đầu kéo Container 40FT",
    }),
    e("2026-10-05T03:24:00.000Z", "Thuy Vu", "CALCULATE_ROUTE", "Route", "R001", "RT-HCM-CL", {
      field: "Alternatives",
      newValue: "3 tuyến",
      note: "Mock provider",
    }),
    e("2026-10-05T03:25:00.000Z", "Thuy Vu", "ADD_MANUAL_COST", "Route", "R001", "RT-HCM-CL", {
      field: "Peak-hour surcharge",
      newValue: "Phụ phí vào cảng giờ cao điểm +50.000 ₫",
    }),
    e("2026-09-15T03:05:00.000Z", "Thuy Vu", "CREATE", "Route", "R002", "RT-HCM-BD"),
    e("2026-09-15T03:10:00.000Z", "Thuy Vu", "CREATE", "Route", "R003", "RT-HCM-DN01"),
    e("2026-09-20T07:00:00.000Z", "Lê Thu Hà", "CHANGE_ROUTE_TYPE", "Route", "R004", "RT-HN-HP", {
      field: "Route Type",
      oldValue: "Single Trip",
      newValue: "Round Trip",
    }),
    e("2026-09-20T07:05:00.000Z", "Lê Thu Hà", "SELECT_ALTERNATIVE", "Route", "R004", "RT-HN-HP", {
      field: "Selected Route",
      oldValue: "Tuyến 1 (Đề xuất)",
      newValue: "Tuyến 2",
    }),
    e("2026-09-22T02:00:00.000Z", "Trần Quốc Bảo", "UPDATE_STATUS", "Route", "R006", "RT-HCM-LT", {
      field: "Status",
      oldValue: "Active",
      newValue: "Inactive",
    }),
    e("2026-10-01T04:00:00.000Z", "Thuy Vu", "CREATE", "Route", "R007", "RT-DN-QN"),
    e("2026-09-01T03:00:00.000Z", "Nguyễn Minh Anh", "CREATE", "Service", "S-TRK", "SG-TRK"),
    e(
      "2026-10-04T07:11:00.000Z",
      "Trần Quốc Bảo",
      "CHANGE_REQUIRED",
      "Service",
      "S-TRK",
      "Trucking template",
      { field: "Container Size", oldValue: "Required", newValue: "Optional" },
    ),
    e(
      "2026-10-04T07:12:00.000Z",
      "Trần Quốc Bảo",
      "CHANGE_VISIBLE",
      "Service",
      "S-TRK",
      "Trucking template",
      { field: "Container Type", oldValue: "Visible", newValue: "Hidden" },
    ),
    e("2026-09-01T02:00:00.000Z", "Thuy Vu", "CREATE", "Cost", "C001", "CST-HCM-CL-TRC", {
      note: "v1 effective 2026-09-01",
    }),
    e("2026-10-01T02:00:00.000Z", "Thuy Vu", "CREATE_VERSION", "Cost", "C001", "CST-HCM-CL-TRC", {
      field: "Version",
      oldValue: "v1",
      newValue: "v2 (effective 2026-10-01)",
    }),
    e("2026-10-01T02:01:00.000Z", "Thuy Vu", "CHANGE_AMOUNT", "Cost", "C001", "CST-HCM-CL-TRC", {
      field: "Fuel rate",
      oldValue: "10,500 ₫/km",
      newValue: "11,130 ₫/km",
    }),
  ];
};

export const seedImportHistory = (): ImportBatch[] => [
  {
    id: "IMP-001",
    fileName: "routes_sep_2026.csv",
    entityType: "Route",
    importedBy: "Thuy Vu",
    importedAt: "2026-09-10T02:30:00.000Z",
    totalRows: 20,
    successRows: 20,
    failedRows: 0,
    status: "Success",
    createdIds: [],
    rollbackable: false,
  },
  {
    id: "IMP-002",
    fileName: "services_catalog.csv",
    entityType: "Service",
    importedBy: "Nguyễn Minh Anh",
    importedAt: "2026-09-12T04:00:00.000Z",
    totalRows: 12,
    successRows: 10,
    failedRows: 2,
    status: "Partial Success",
    createdIds: [],
    rollbackable: false,
  },
  {
    id: "IMP-003",
    fileName: "cost_q4_draft.csv",
    entityType: "Cost",
    importedBy: "Thuy Vu",
    importedAt: "2026-09-28T09:15:00.000Z",
    totalRows: 8,
    successRows: 0,
    failedRows: 8,
    status: "Failed",
    createdIds: [],
    rollbackable: false,
  },
  {
    id: "IMP-004",
    fileName: "routes_hn_hp.csv",
    entityType: "Route",
    importedBy: "Lê Thu Hà",
    importedAt: "2026-10-02T06:45:00.000Z",
    totalRows: 5,
    successRows: 5,
    failedRows: 0,
    status: "Rolled Back",
    createdIds: [],
    rollbackable: false,
  },
];
