import {
  VEHICLE_PROFILES,
  profileNeedsCapacity,
  type RouteRecord,
  type RoutePoint,
  type RouteType,
  type Terrain,
  type VehicleProfile,
} from "@/types";
import { costRepository, routeRepository, uid } from "@/repositories";
import { activeLocations, findLocationByName } from "@/services/routing/locationStore";
import { findVehicle, routeVehicleFields, vehicleLabel, VEHICLES } from "@/mock-data/vehicles";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { syncRouteTollsToMaster } from "./routing/tollMasterSync";
import { vehicleGroupFor } from "./routing/RouteProvider";
import { formatDate, formatVnd, todayYmd } from "@/lib/format";

/** An editor action (recalculate, pick an alternative…) recorded in the audit trail on Save. */
export type RouteAuditAction = Omit<AuditInput, "entityType" | "entityId" | "entityLabel">;

export const formatDeparture = (s: string) => (s ? `${formatDate(s)} ${s.slice(11, 16)}` : "—");
import { pick, type ImportEntityConfig } from "./importExportService";

const ROUTE_TYPES: readonly RouteType[] = ["Single Trip", "Round Trip"];
const TERRAINS: readonly Terrain[] = ["Plain", "Highland"];

const costRefs = (routeId: string) =>
  costRepository.all().filter((c) => !c.deleted && c.routeId === routeId);

export const routeCrud = makeCrud<RouteRecord>({
  entityType: "Route",
  repo: routeRepository,
  labelOf: (r) => r.code,
  references: (r) => {
    const n = costRefs(r.id).length;
    return n ? `is currently referenced by ${n} Cost record${n > 1 ? "s" : ""}` : null;
  },
});

export const emptyPoint = (): RoutePoint => ({ name: "", lat: NaN, lng: NaN });

export const newRouteDraft = (): RouteRecord => ({
  id: "",
  code: "",
  description: "",
  name: "",
  type: "Single Trip",
  origin: emptyPoint(),
  waypoints: [],
  destination: emptyPoint(),
  vehicleProfile: "Truck",
  vehicleGroup: "Medium Truck",
  capacityKg: 8000,
  departureTime: `${todayYmd()}T08:00`,
  avoidFerry: false,
  alternatives: [],
  selectedRouteId: null,
  outbound: null,
  returnMode: "auto",
  returnWaypoints: [],
  returnLeg: null,
  manualCosts: [],
  status: "Active",
  createdAt: "",
  createdBy: "",
  updatedAt: "",
  updatedBy: "",
});

export function validateRoute(r: RouteRecord): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.code.trim()) e["code"] = "Route Code is required.";
  else if (!/^[A-Z0-9-]{3,30}$/i.test(r.code.trim()))
    e["code"] = "Use 3–30 letters, digits or dashes.";
  else if (
    routeRepository
      .all()
      .some(
        (x) => !x.deleted && x.id !== r.id && x.code.toLowerCase() === r.code.trim().toLowerCase(),
      )
  )
    e["code"] = `Route Code ${r.code} already exists.`;
  if (!r.name.trim()) e["name"] = "Route Name is required.";
  if (!r.origin.name || !Number.isFinite(r.origin.lat))
    e["origin"] = "Pick an Origin from the search list.";
  if (!r.destination.name || !Number.isFinite(r.destination.lat))
    e["destination"] = "Pick a Destination from the search list.";
  if (r.waypoints.some((w) => !w.name || !Number.isFinite(w.lat)))
    e["waypoints"] = "Every waypoint needs a location (or remove empty ones).";
  if (r.status === "Active" && !r.outbound)
    e["status"] = "Calculate the route before activating it.";
  return e;
}

const pts = (ps: RoutePoint[]) => ps.map((p) => p.name).join(" → ") || "(none)";
const fmtKm = (n?: number) => (n == null ? "—" : `${n} km`);

function diffRoute(prev: RouteRecord, next: RouteRecord): AuditInput[] {
  const base = { entityType: "Route" as const, entityId: next.id, entityLabel: next.code };
  const out: AuditInput[] = [];
  const upd = (action: AuditInput["action"], field: string, a: string, b: string) =>
    a !== b && out.push({ ...base, action, field, oldValue: a, newValue: b });
  upd("UPDATE", "Route Code", prev.code, next.code);
  upd("UPDATE", "Route Name", prev.name, next.name);
  upd("UPDATE", "Description", prev.description ?? "", next.description ?? "");
  upd("CHANGE_ROUTE_TYPE", "Route Type", prev.type, next.type);
  upd("UPDATE", "Origin", prev.origin.name, next.origin.name);
  upd("UPDATE", "Destination", prev.destination.name, next.destination.name);
  upd(
    next.waypoints.length > prev.waypoints.length ? "ADD_WAYPOINT" : "CHANGE_WAYPOINT",
    "Waypoints",
    pts(prev.waypoints),
    pts(next.waypoints),
  );
  upd("CHANGE_WAYPOINT", "Return Waypoints", pts(prev.returnWaypoints), pts(next.returnWaypoints));
  upd("UPDATE", "Return Mode", prev.returnMode, next.returnMode);
  const veh = (id?: string) => {
    const v = findVehicle(id);
    return v ? vehicleLabel(v) : "—";
  };
  upd("CHANGE_VEHICLE", "Vehicle", veh(prev.vehicleId), veh(next.vehicleId));
  upd("CHANGE_VEHICLE", "Vehicle Group", prev.vehicleGroup ?? "—", next.vehicleGroup ?? "—");
  upd("UPDATE", "Terrain", prev.terrain ?? "Plain", next.terrain ?? "Plain");
  upd(
    "CHANGE_DEPARTURE_TIME",
    "Departure Time",
    formatDeparture(prev.departureTime),
    formatDeparture(next.departureTime),
  );
  upd("UPDATE", "Avoid Ferry", prev.avoidFerry ? "Yes" : "No", next.avoidFerry ? "Yes" : "No");
  if (
    JSON.stringify(prev.customReturn) !== JSON.stringify(next.customReturn) &&
    next.returnMode === "custom"
  )
    out.push({
      ...base,
      action: "UPDATE",
      field: "Custom return leg",
      note: `${fmtKm(next.customReturn?.distance)}, ${next.customReturn?.tollStations.length ?? 0} toll stations`,
    });
  const prevIds = new Set(prev.manualCosts.map((m) => m.id));
  const nextIds = new Set(next.manualCosts.map((m) => m.id));
  next.manualCosts
    .filter((m) => !prevIds.has(m.id))
    .forEach((m) =>
      out.push({
        ...base,
        action: "ADD_MANUAL_COST",
        field: m.costType,
        newValue: `${m.reason} +${formatVnd(m.amount)}`,
        ...(m.note ? { note: m.note } : {}),
      }),
    );
  prev.manualCosts
    .filter((m) => !nextIds.has(m.id))
    .forEach((m) =>
      out.push({
        ...base,
        action: "REMOVE_MANUAL_COST",
        field: m.costType,
        oldValue: `${m.reason} ${formatVnd(m.amount)}`,
      }),
    );
  if (prev.status !== next.status)
    out.push({
      ...base,
      action: "UPDATE_STATUS",
      field: "Status",
      oldValue: prev.status,
      newValue: next.status,
    });
  return out;
}

/** Shown when the code of a route that is already used can't be changed. */
export const routeCodeLockedHint = (n: number) =>
  `Used by ${n} cost record${n === 1 ? "" : "s"} — code can't be changed`;

/** After a save: store the route's map tolls in Toll Station master and link the toll lines to it. */
function syncTolls(rec: RouteRecord): RouteRecord {
  try {
    const { route } = syncRouteTollsToMaster(rec);
    if (route === rec || JSON.stringify(route) === JSON.stringify(rec)) return rec;
    return routeRepository.update(rec.id, () => route);
  } catch (e) {
    // The route itself is saved; a toll master sync failure must not lose it.
    console.error("Toll Station sync failed", e);
    return rec;
  }
}

export const routeService = {
  ...routeCrud,
  costReferences: costRefs,

  save(draft: RouteRecord, actions: RouteAuditAction[] = []): RouteRecord {
    const errors = validateRoute(draft);
    const existing = draft.id ? routeRepository.get(draft.id) : undefined;
    // Route Code is editable only while no Cost record uses the route.
    if (existing && existing.code.toUpperCase() !== draft.code.trim().toUpperCase()) {
      const n = costRefs(existing.id).length;
      if (n) errors["code"] = `${routeCodeLockedHint(n)} (keep ${existing.code}).`;
    }
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please fix the highlighted fields.", errors);
    const clean = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      // Vehicle Group always follows the vehicle chosen on the route map (no separate input).
      vehicleGroup: vehicleGroupFor(draft.vehicleProfile, draft.vehicleClass, draft.capacityKg),
    };
    if (!existing) {
      const rec: RouteRecord = { ...clean, id: uid("R-"), ...stampCreate() };
      routeRepository.insert(rec);
      const ref = { entityType: "Route" as const, entityId: rec.id, entityLabel: rec.code };
      auditService.logMany([
        {
          action: "CREATE",
          ...ref,
          note: `${rec.type} · ${pts([rec.origin, ...rec.waypoints, rec.destination])}`,
        },
        ...actions.map((a) => ({ ...a, ...ref })),
        ...rec.manualCosts.map((m) => ({
          action: "ADD_MANUAL_COST" as const,
          entityType: "Route" as const,
          entityId: rec.id,
          entityLabel: rec.code,
          field: m.costType,
          newValue: `${m.reason} +${formatVnd(m.amount)}`,
        })),
      ]);
      return syncTolls(rec);
    }
    const next = stampUpdate({
      ...existing,
      ...clean,
      id: existing.id,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    });
    routeRepository.update(existing.id, () => next);
    auditService.logMany([
      ...diffRoute(existing, next),
      ...actions.map((a) => ({
        ...a,
        entityType: "Route" as const,
        entityId: next.id,
        entityLabel: next.code,
      })),
    ]);
    return syncTolls(next);
  },
};

// ---------- Import config ----------
export const routeImportConfig: ImportEntityConfig = {
  entityType: "Route",
  screen: "routing",
  keyColumn: "code",
  // Aliases = the Routing list labels (VI / EN), so an exported list can be imported back.
  // Origin / Destination take a location code or name; the code column wins when both exist.
  columns: [
    {
      key: "code",
      header: "Route Code",
      required: true,
      example: "RT-HCM-BD-02",
      aliases: ["Mã route"],
    },
    {
      key: "name",
      header: "Route Name",
      required: true,
      example: "HCM → Bình Dương (ca đêm)",
      aliases: ["Tên route"],
    },
    {
      key: "origin",
      header: "Origin",
      required: true,
      example: "Kho Quận 7",
      aliases: ["Departure code", "Mã đi", "Departure", "Điểm đi"],
    },
    {
      key: "destination",
      header: "Destination",
      required: true,
      example: "KCN VSIP I",
      aliases: ["Dest. code", "Mã đến", "Điểm đến"],
    },
    {
      key: "vehicleProfile",
      header: "Vehicle Profile",
      required: true,
      example: "Truck",
      // Older exports have both "Truck / Container" and a Vehicle (group) column: prefer the former.
      aliases: ["Truck / Container", "Loại xe", "Vehicle", "Phương tiện"],
    },
    // No Vehicle Group column: it follows Vehicle Profile + Capacity (the toll vehicle class).
    { key: "capacityKg", header: "Capacity (kg)", example: "8000", aliases: ["Tải trọng (kg)"] },
    { key: "type", header: "Route Type", example: "Single Trip", aliases: ["Loại tuyến"] },
    { key: "terrain", header: "Terrain", example: "Plain", aliases: ["Địa hình"] },
    { key: "description", header: "Note", example: "", aliases: ["Ghi chú"] },
  ],
  existingKeys: () =>
    new Set(
      routeRepository
        .all()
        .filter((r) => !r.deleted)
        .map((r) => r.code.toLowerCase()),
    ),
  referenceCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    if (!findLocationByName(r["origin"] ?? ""))
      e.push({ field: "origin", error: "Location not found" });
    if (!findLocationByName(r["destination"] ?? ""))
      e.push({ field: "destination", error: "Location not found" });
    return e;
  },
  rowCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    const profile = pick(r["vehicleProfile"], VEHICLE_PROFILES);
    if (!profile)
      e.push({ field: "vehicleProfile", error: `Use one of: ${VEHICLE_PROFILES.join(", ")}` });
    if (pick(r["type"], ROUTE_TYPES) === undefined)
      e.push({ field: "type", error: "Single Trip or Round Trip (empty = Single Trip)" });
    if (pick(r["terrain"], TERRAINS) === undefined)
      e.push({ field: "terrain", error: "Plain or Highland (empty = Plain)" });
    const kg = Number(r["capacityKg"] || 0);
    if (profile && profileNeedsCapacity(profile) && !(kg > 0))
      e.push({ field: "capacityKg", error: "Capacity is required for Truck / Container" });
    return e;
  },
  commit: (rows) => {
    const recs: RouteRecord[] = rows.map((r) => {
      const o = findLocationByName(r["origin"]!)!,
        d = findLocationByName(r["destination"]!)!;
      const kg = Number(r["capacityKg"] || 0);
      const profile = pick(r["vehicleProfile"], VEHICLE_PROFILES) as VehicleProfile;
      const group = vehicleGroupFor(profile, undefined, kg || undefined);
      // Link the first vehicle of that group from Vehicle Master.
      const vehicle = VEHICLES.find((v) => v.group === group);
      return {
        ...newRouteDraft(),
        id: uid("R-"),
        code: r["code"]!.toUpperCase(),
        name: r["name"]!,
        description: r["description"] ?? "",
        type: pick(r["type"], ROUTE_TYPES) || "Single Trip",
        terrain: pick(r["terrain"], TERRAINS) || "Plain",
        origin: { name: o.name, address: o.address, lat: o.lat, lng: o.lng, locationId: o.id },
        destination: { name: d.name, address: d.address, lat: d.lat, lng: d.lng, locationId: d.id },
        vehicleProfile: profile,
        vehicleGroup: group,
        ...(kg > 0 ? { capacityKg: kg } : {}),
        ...(vehicle ? { vehicleId: vehicle.id } : {}),
        // Distances are not calculated yet: the route is activated after "Calculate Route".
        status: "Inactive",
        ...stampCreate(),
      };
    });
    routeRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => routeCrud.removeMany(ids),
  sampleFile: () => {
    const header = routeImportConfig.columns.map((c) => c.header);
    const locs = activeLocations().filter(
      (l) =>
        l.province === "TP. Hồ Chí Minh" ||
        l.province === "Bình Dương" ||
        l.province === "Đồng Nai",
    );
    const rows: string[][] = [];
    for (let i = 0; i < 20; i++) {
      const o = locs[i % locs.length]!,
        d = locs[(i + 3) % locs.length]!;
      const container = i % 4 === 0;
      rows.push([
        `RT${String(i + 1).padStart(3, "0")}`,
        `${o.name} → ${d.name}`,
        o.name,
        d.name,
        container ? "Container" : "Truck",
        container ? "28000" : i % 2 ? "3000" : "6000",
        i % 3 === 0 ? "Round Trip" : "Single Trip",
        i % 5 === 0 ? "Highland" : "Plain",
        "",
      ]);
    }
    rows[1]![0] = "RT001"; // row 3 → duplicate of row 2
    rows[6]![2] = "ABC"; // row 8 → unknown location
    return [header, ...rows];
  },
};
