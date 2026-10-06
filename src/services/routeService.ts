import type { RouteRecord, RoutePoint } from "@/types";
import { profileNeedsCapacity } from "@/types";
import { costRepository, routeRepository, uid } from "@/repositories";
import { findLocationByName, LOCATIONS } from "@/mock-data/locations";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { routeTotals } from "./cost/costMath";
import { formatVnd } from "@/lib/format";
import type { ImportEntityConfig } from "./importExportService";

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
  name: "",
  type: "Single Trip",
  origin: emptyPoint(),
  waypoints: [],
  destination: emptyPoint(),
  vehicleProfile: "Truck",
  vehicleGroup: "Medium Truck",
  capacityKg: 8000,
  outbound: null,
  returnMode: "auto",
  returnWaypoints: [],
  returnLeg: null,
  manualCosts: [],
  status: "Draft",
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
  if (profileNeedsCapacity(r.vehicleProfile) && !(r.capacityKg && r.capacityKg > 0))
    e["capacityKg"] = "Capacity / Weight is required for Truck / Container.";
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
  upd("CHANGE_ROUTE_TYPE", "Route Type", prev.type, next.type);
  upd("UPDATE", "Origin", prev.origin.name, next.origin.name);
  upd("UPDATE", "Destination", prev.destination.name, next.destination.name);
  upd("CHANGE_WAYPOINT", "Waypoints", pts(prev.waypoints), pts(next.waypoints));
  upd("CHANGE_WAYPOINT", "Return Waypoints", pts(prev.returnWaypoints), pts(next.returnWaypoints));
  upd("UPDATE", "Return Mode", prev.returnMode, next.returnMode);
  upd("CHANGE_VEHICLE", "Vehicle Profile", prev.vehicleProfile, next.vehicleProfile);
  upd("CHANGE_VEHICLE", "Vehicle Group", prev.vehicleGroup, next.vehicleGroup);
  upd(
    "CHANGE_VEHICLE",
    "Capacity (kg)",
    String(prev.capacityKg ?? "—"),
    String(next.capacityKg ?? "—"),
  );
  if (
    prev.outbound?.calculatedAt !== next.outbound?.calculatedAt ||
    prev.returnLeg?.calculatedAt !== next.returnLeg?.calculatedAt
  ) {
    const a = routeTotals(prev),
      b = routeTotals(next);
    out.push({
      ...base,
      action: "CALCULATE_ROUTE",
      field: "Distance",
      oldValue: fmtKm(a.calculated ? a.distanceKm : undefined),
      newValue: fmtKm(b.distanceKm),
      note: `Toll ${formatVnd(a.tollCost)} → ${formatVnd(b.tollCost)} · provider ${next.outbound?.provider ?? "—"}`,
    });
  }
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
      action:
        next.status === "Inactive"
          ? "DEACTIVATE"
          : next.status === "Active"
            ? "ACTIVATE"
            : "UPDATE",
      field: "Status",
      oldValue: prev.status,
      newValue: next.status,
    });
  return out;
}

export const routeService = {
  ...routeCrud,
  costReferences: costRefs,

  save(draft: RouteRecord): RouteRecord {
    const errors = validateRoute(draft);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please fix the highlighted fields.", errors);
    const clean = { ...draft, code: draft.code.trim().toUpperCase(), name: draft.name.trim() };
    const existing = draft.id ? routeRepository.get(draft.id) : undefined;
    if (!existing) {
      const rec: RouteRecord = { ...clean, id: uid("R-"), ...stampCreate() };
      routeRepository.insert(rec);
      const totals = routeTotals(rec);
      auditService.logMany([
        {
          action: "CREATE",
          entityType: "Route",
          entityId: rec.id,
          entityLabel: rec.code,
          note: `${rec.type} · ${pts([rec.origin, ...rec.waypoints, rec.destination])}`,
        },
        ...(rec.outbound
          ? [
              {
                action: "CALCULATE_ROUTE" as const,
                entityType: "Route" as const,
                entityId: rec.id,
                entityLabel: rec.code,
                field: "Distance",
                newValue: fmtKm(totals.distanceKm),
                note: `Toll ${formatVnd(totals.tollCost)}`,
              },
            ]
          : []),
        ...rec.manualCosts.map((m) => ({
          action: "ADD_MANUAL_COST" as const,
          entityType: "Route" as const,
          entityId: rec.id,
          entityLabel: rec.code,
          field: m.costType,
          newValue: `${m.reason} +${formatVnd(m.amount)}`,
        })),
      ]);
      return rec;
    }
    const next = stampUpdate({
      ...existing,
      ...clean,
      id: existing.id,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    });
    routeRepository.update(existing.id, () => next);
    auditService.logMany(diffRoute(existing, next));
    return next;
  },
};

// ---------- Import config ----------
export const routeImportConfig: ImportEntityConfig = {
  entityType: "Route",
  screen: "routing",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Route Code", required: true, example: "RT-HCM-BD-02" },
    { key: "name", header: "Route Name", required: true, example: "HCM → Bình Dương (ca đêm)" },
    { key: "type", header: "Route Type", required: true, example: "Single Trip" },
    { key: "origin", header: "Origin", required: true, example: "Kho Quận 7" },
    { key: "destination", header: "Destination", required: true, example: "KCN VSIP I" },
    { key: "vehicleProfile", header: "Vehicle Profile", required: true, example: "Truck" },
    { key: "vehicleGroup", header: "Vehicle Group", required: true, example: "Medium Truck" },
    { key: "capacityKg", header: "Capacity (kg)", example: "8000" },
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
    if (!["Single Trip", "Round Trip"].includes(r["type"] ?? ""))
      e.push({ field: "type", error: "Must be Single Trip or Round Trip" });
    if (!["Car", "Motorcycle", "Truck", "Container"].includes(r["vehicleProfile"] ?? ""))
      e.push({ field: "vehicleProfile", error: "Unknown vehicle profile" });
    if (
      ![
        "Van / Pickup",
        "Light Truck",
        "Medium Truck",
        "Heavy Truck",
        "Tractor / Container Truck",
      ].includes(r["vehicleGroup"] ?? "")
    )
      e.push({ field: "vehicleGroup", error: "Unknown vehicle group" });
    const kg = Number(r["capacityKg"] || 0);
    if ((r["vehicleProfile"] === "Truck" || r["vehicleProfile"] === "Container") && !(kg > 0))
      e.push({ field: "capacityKg", error: "Capacity is required for Truck / Container" });
    return e;
  },
  commit: (rows) => {
    const recs: RouteRecord[] = rows.map((r) => {
      const o = findLocationByName(r["origin"]!)!,
        d = findLocationByName(r["destination"]!)!;
      const kg = Number(r["capacityKg"] || 0);
      return {
        ...newRouteDraft(),
        id: uid("R-"),
        code: r["code"]!.toUpperCase(),
        name: r["name"]!,
        type: r["type"] as RouteRecord["type"],
        origin: { name: o.name, address: o.address, lat: o.lat, lng: o.lng, locationId: o.id },
        destination: { name: d.name, address: d.address, lat: d.lat, lng: d.lng, locationId: d.id },
        vehicleProfile: r["vehicleProfile"] as RouteRecord["vehicleProfile"],
        vehicleGroup: r["vehicleGroup"] as RouteRecord["vehicleGroup"],
        ...(kg > 0 ? { capacityKg: kg } : {}),
        status: "Draft",
        ...stampCreate(),
      };
    });
    routeRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => routeCrud.removeMany(ids),
  sampleFile: () => {
    const header = routeImportConfig.columns.map((c) => c.header);
    const locs = LOCATIONS.filter(
      (l) =>
        l.id.startsWith("L-HCM") ||
        l.id.startsWith("L-BD") ||
        l.id.startsWith("L-DNAI") ||
        l.id === "L-CATLAI",
    );
    const rows: string[][] = [];
    for (let i = 0; i < 20; i++) {
      const o = locs[i % locs.length]!,
        d = locs[(i + 3) % locs.length]!;
      const container = i % 4 === 0;
      rows.push([
        `RT${String(i + 1).padStart(3, "0")}`,
        `${o.name} → ${d.name}`,
        i % 3 === 0 ? "Round Trip" : "Single Trip",
        o.name,
        d.name,
        container ? "Container" : "Truck",
        container ? "Tractor / Container Truck" : i % 2 ? "Light Truck" : "Medium Truck",
        container ? "28000" : "6000",
      ]);
    }
    rows[1]![0] = "RT001"; // row 3 → duplicate of row 2
    rows[6]![3] = "ABC"; // row 8 → unknown location
    return [header, ...rows];
  },
};
