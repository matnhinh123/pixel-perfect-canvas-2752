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
  VehicleProfile,
  RouteType,
} from "@/types";
import { computeMockRoute } from "@/services/routing/MockRouteProvider";
import { LOCATIONS } from "./locations";
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
  profile: VehicleProfile;
  group: VehicleGroup;
  kg?: number;
  status: RouteRecord["status"];
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
    name: "HCM - Đà Nẵng",
    description: "Tuyến vận chuyển hàng từ TP.HCM đi Đà Nẵng",
    type: "Single Trip",
    o: "L-HCM",
    wps: ["L-DNAI-LT", "L-DNAI-DG", "L-QN"],
    d: "L-DANANG",
    profile: "Truck",
    group: "Heavy Truck",
    kg: 15000,
    status: "Active",
  },
  {
    id: "R001",
    code: "RT-HCM-CL",
    name: "HCM → Cảng Cát Lái",
    type: "Round Trip",
    o: "L-HCM-TB",
    wps: ["L-TD-NT"],
    d: "L-CATLAI",
    profile: "Container",
    group: "Tractor / Container Truck",
    kg: 28000,
    status: "Active",
    returnMode: "auto",
    manual: [
      {
        id: "MC-1",
        costType: "Ferry",
        amount: 50000,
        reason: "Ferry surcharge",
        note: "Phà Cát Lái khi kẹt cầu Phú Mỹ",
      },
    ],
  },
  {
    id: "R002",
    code: "RT-HCM-BD",
    name: "HCM → KCN VSIP Bình Dương",
    type: "Single Trip",
    o: "L-HCM-Q7",
    wps: ["L-BD-ST"],
    d: "L-BD-VSIP",
    profile: "Truck",
    group: "Medium Truck",
    kg: 8000,
    status: "Active",
  },
  {
    id: "R003",
    code: "RT-HCM-DNAI",
    name: "HCM → KCN Biên Hòa 2, Đồng Nai",
    type: "Single Trip",
    o: "L-HCM-TD",
    wps: [],
    d: "L-DNAI-BH2",
    profile: "Truck",
    group: "Medium Truck",
    kg: 9000,
    status: "Active",
  },
  {
    id: "R004",
    code: "RT-HN-HP",
    name: "Hà Nội → Cảng Đình Vũ, Hải Phòng",
    type: "Round Trip",
    o: "L-HN-GL",
    wps: ["L-HD"],
    d: "L-HP-DV",
    profile: "Container",
    group: "Tractor / Container Truck",
    kg: 30000,
    status: "Active",
    returnMode: "custom",
    returnWps: ["L-HP"],
  },
  {
    id: "R005",
    code: "RT-DAD-CL",
    name: "Đà Nẵng → KKT Chu Lai",
    type: "Single Trip",
    o: "L-DANANG-TS",
    wps: ["L-HOIAN"],
    d: "L-CHULAI",
    profile: "Truck",
    group: "Heavy Truck",
    kg: 15000,
    status: "Draft",
    calc: false,
  },
  {
    id: "R006",
    code: "RT-HCM-LT",
    name: "HCM → Long Thành (Van)",
    type: "Single Trip",
    o: "L-HCM",
    wps: [],
    d: "L-DNAI-LT",
    profile: "Car",
    group: "Van / Pickup",
    status: "Inactive",
  },
];

function buildRoute(s: RouteSeed): RouteRecord {
  const origin = pt(s.o),
    destination = pt(s.d),
    waypoints = s.wps.map(pt),
    returnWaypoints = (s.returnWps ?? []).map(pt);
  const req = (pts: RoutePoint[]) => ({
    points: pts,
    vehicle: s.profile,
    ...(s.kg ? { capacityKg: s.kg } : {}),
  });
  const calc = s.calc !== false;
  const outbound = calc
    ? computeMockRoute(req([origin, ...waypoints, destination]), SEED_TIME)
    : null;
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
    vehicleProfile: s.profile,
    vehicleGroup: s.group,
    ...(s.kg ? { capacityKg: s.kg } : {}),
    outbound,
    returnMode: s.returnMode ?? "auto",
    returnWaypoints,
    returnLeg,
    ...(s.returnMode === "custom" && returnLeg
      ? {
          customReturn: {
            distance: returnLeg.distance,
            estimatedTime: returnLeg.estimatedTime + 10,
            tollStations: returnLeg.tollStations,
          },
        }
      : {}),
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
    e("2026-10-06T03:10:00.000Z", "Thuy Vu", "CREATE", "Route", "R000", "RT-HCM-DN", {
      note: "Single Trip · TP.HCM (HCM) → Long Thành → Dầu Giây → Quy Nhơn → Đà Nẵng (DAD)",
    }),
    e("2026-10-06T03:20:00.000Z", "Thuy Vu", "CHANGE_VEHICLE", "Route", "R000", "RT-HCM-DN", {
      field: "Vehicle Group",
      oldValue: "Medium Truck",
      newValue: "Heavy Truck",
    }),
    e("2026-10-06T03:24:00.000Z", "Thuy Vu", "CALCULATE_ROUTE", "Route", "R000", "RT-HCM-DN", {
      field: "Distance",
      oldValue: "938 km",
      newValue: "Recalculated",
      note: "Mock provider",
    }),
    e("2026-10-05T03:20:00.000Z", "Thuy Vu", "CHANGE_VEHICLE", "Route", "R001", "RT-HCM-CL", {
      field: "Vehicle Group",
      oldValue: "Heavy Truck",
      newValue: "Tractor / Container Truck",
    }),
    e("2026-10-05T03:24:00.000Z", "Thuy Vu", "CALCULATE_ROUTE", "Route", "R001", "RT-HCM-CL", {
      field: "Distance",
      oldValue: "24.1 km",
      newValue: "24.6 km",
      note: "Mock provider",
    }),
    e("2026-10-05T03:25:00.000Z", "Thuy Vu", "ADD_MANUAL_COST", "Route", "R001", "RT-HCM-CL", {
      field: "Manual Cost",
      newValue: "Ferry surcharge +50,000 VND",
    }),
    e("2026-09-15T03:05:00.000Z", "Thuy Vu", "CREATE", "Route", "R002", "RT-HCM-BD"),
    e("2026-09-15T03:10:00.000Z", "Thuy Vu", "CREATE", "Route", "R003", "RT-HCM-DNAI"),
    e("2026-09-20T07:00:00.000Z", "Lê Thu Hà", "CHANGE_ROUTE_TYPE", "Route", "R004", "RT-HN-HP", {
      field: "Route Type",
      oldValue: "Single Trip",
      newValue: "Round Trip",
    }),
    e("2026-09-22T02:00:00.000Z", "Trần Quốc Bảo", "DEACTIVATE", "Route", "R006", "RT-HCM-LT", {
      field: "Status",
      oldValue: "Active",
      newValue: "Inactive",
    }),
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
