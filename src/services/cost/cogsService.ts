// COGS records: one per route × vehicle type, saved with a snapshot of the costs picked.
import type { CogsOtherCost, CogsRecord, RouteRecord } from "@/types";
import {
  cogsRepository,
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollStationRepository,
  tollFeeRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import { formatNumber } from "@/lib/format";
import { buildCogs } from "./cogsBuild";
import { cogsVehicleTypes, type CogsVehicleType } from "./cogsVehicle";
import { liveContainerTypes } from "./containerTypes";
import { vehicleClassFor } from "@/services/routing/RouteProvider";
import { mappingsFor } from "./cogsBuild";
import { syncTollFees } from "./tollFee";

/** Vehicle types of the current Vehicle master. */
/** Vehicle types worked out once for a whole sync run (instead of once per COGS). */
let typesInSync: CogsVehicleType[] | null = null;
export const currentCogsVehicleTypes = () =>
  typesInSync ?? cogsVehicleTypes(vehicleMasterRepository.all(), liveContainerTypes());

export const cogsCrud = makeCrud<CogsRecord>({
  entityType: "COGS",
  repo: cogsRepository,
  labelOf: (c) => c.code,
  references: () => null,
});

export interface CogsDraft {
  code: string;
  name: string;
  routeId: string;
  vehicleType: string;
  mappingIds: string[];
  /** Utilization Factor (trips per day); text while typed. */
  utilizationFactor: string;
  excluded: string[];
  overrides: Record<string, number>;
  others: CogsOtherCost[];
  /** Remark per cost line, by line key. */
  remarks: Record<string, string>;
  remark: string;
  status: "Active" | "Inactive";
}

export const newCogsDraft = (): CogsDraft => ({
  code: "",
  name: "",
  routeId: "",
  vehicleType: "",
  mappingIds: [],
  utilizationFactor: "1",
  excluded: [],
  overrides: {},
  others: [],
  remarks: {},
  remark: "",
  status: "Active",
});

export const draftOfCogs = (c: CogsRecord): CogsDraft => ({
  code: c.code,
  name: c.name ?? "",
  routeId: c.routeId,
  vehicleType: c.vehicleType,
  mappingIds: [...(c.mappingIds ?? [])],
  utilizationFactor: String(c.utilizationFactor ?? 1),
  excluded: [...c.excluded],
  overrides: { ...(c.overrides ?? {}) },
  others: c.others.map((o) => ({ ...o })),
  remarks: { ...(c.remarks ?? {}) },
  remark: c.remark,
  status: c.status === "Inactive" ? "Inactive" : "Active",
});

/** A–Z, 0–9, dot, hyphen, underscore; max 20. */
const COGS_CODE = /^[A-Z0-9._-]{1,20}$/;
export const sanitizeCogsCode = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);

const live = () => cogsRepository.all().filter((c) => !c.deleted);

export function validateCogs(d: CogsDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "COGS Code is required.";
  else if (!COGS_CODE.test(code))
    e["code"] =
      "COGS Code may only contain A–Z, 0–9, dot (.), hyphen (-), underscore (_), max 20 characters.";
  else {
    const dup = live().find((c) => c.id !== id && c.code.toUpperCase() === code);
    if (dup) e["code"] = `COGS Code ${code} is already used by ${dup.name || dup.code}.`;
  }
  if (!d.name.trim()) e["name"] = "COGS Name is required.";
  const route = d.routeId ? routeRepository.get(d.routeId) : undefined;
  if (!route || route.deleted) e["routeId"] = "Route is required.";
  else if (!route.outbound)
    e["routeId"] = "This route has not been calculated: open it and click Calculate Route.";
  if (!d.vehicleType) e["vehicleType"] = "Vehicle Type is required.";
  else if (!currentCogsVehicleTypes().some((t) => t.key === d.vehicleType))
    e["vehicleType"] = `No active vehicle of type ${d.vehicleType} in Vehicle.`;
  // A COGS keeps its route and vehicle type: it is worked out from them (create another one instead).
  const saved = id ? cogsRepository.get(id) : undefined;
  if (saved && saved.routeId !== d.routeId)
    e["routeId"] = "The route of a COGS cannot be changed once it is created.";
  if (saved && saved.vehicleType !== d.vehicleType)
    e["vehicleType"] = "The vehicle type of a COGS cannot be changed once it is created.";
  if (route && d.vehicleType) {
    const dup = live().find(
      (c) => c.id !== id && c.routeId === d.routeId && c.vehicleType === d.vehicleType,
    );
    if (dup) e["routeId"] = `${dup.code} already exists for ${route.code} · ${d.vehicleType}.`;
  }
  const f = Number(d.utilizationFactor);
  if (!d.utilizationFactor.trim()) e["utilizationFactor"] = "Utilization Factor is required.";
  else if (!(f > 0) || f > 10 || !/^\d+(\.\d{1,2})?$/.test(d.utilizationFactor.trim()))
    e["utilizationFactor"] =
      "Utilization Factor must be a number above 0 and up to 10, with at most 2 decimals.";
  const badEdit = Object.values(d.overrides).some((v) => !(v >= 0));
  if (badEdit) e["overrides"] = "An edited amount must be 0 or more.";
  const badOther = d.others.findIndex((o) => !o.costId || !(o.amount > 0));
  if (badOther >= 0)
    e["others"] = `Other Cost row ${badOther + 1}: enter a valid Fare Code and an amount above 0.`;
  return e;
}

/** Utilization Factor of a draft; 1 while what is typed is not a valid number. */
export const factorOf = (d: Pick<CogsDraft, "utilizationFactor">) => {
  const f = Number(d.utilizationFactor);
  return f > 0 && f <= 10 ? f : 1;
};

/** Builds the COGS of a draft from the current Route / Fixed Cost / Variable Cost / Cost setup. */
export const buildCogsOf = (d: CogsDraft) => {
  const route = routeRepository.get(d.routeId);
  const vehicle = currentCogsVehicleTypes().find((t) => t.key === d.vehicleType);
  if (!route || !vehicle) return null;
  return buildCogs({
    route,
    vehicle,
    salaryRanges: salaryRangeRepository.all(),
    fuelCosts: fuelCostRepository.all(),
    tollMasters: tollStationRepository.all().filter((t) => !t.deleted),
    fixedCosts: fixedCostRepository.all(),
    mappings: fixedCostSummaryRepository.all(),
    // Fixed Cost: every Fixed Cost Mapping of the vehicle type.
    mappingIds: mappingsFor(fixedCostSummaryRepository.all(), vehicle).map((m) => m.id),
    tollFees: (syncTollFees(), tollFeeRepository.all()),
    utilizationFactor: factorOf(d),
    costs: costItemRepository.all().filter((c) => !c.deleted),
    excluded: d.excluded,
    overrides: d.overrides,
    others: d.others,
  });
};

/** Toll group (1..5) of the vehicle picked on a route. */
export const routeGroupOf = (r: RouteRecord) =>
  vehicleClassFor(r.vehicleProfile, r.vehicleClass, r.capacityKg);

/** "RT-HCM-DN-T5", "RT-HCM-DN-H42RT": route code + vehicle type, unique, max 20 characters. */
function autoCogsCode(routeCode: string, vt: CogsVehicleType) {
  // Truck: T + its load ("T5"); header: H + its Container Type ("H42RT").
  const suffix =
    vt.kind === "TRUCK"
      ? `T${/(\d+)/.exec(vt.spec)?.[1] ?? ""}`
      : `H${vt.spec.replace(/[^A-Z0-9]/gi, "")}`;
  const base = sanitizeCogsCode(routeCode);
  const taken = new Set(live().map((c) => c.code.toUpperCase()));
  for (let n = 1; ; n++) {
    const tail = `-${suffix}${n === 1 ? "" : n}`;
    const code = `${base.slice(0, 20 - tail.length)}${tail}`;
    if (!taken.has(code)) return code;
  }
}

/** COGS created automatically by the last route save (for the screen message). */
export let lastAutoCogs: CogsRecord[] = [];
export const clearAutoCogs = () => {
  lastAutoCogs = [];
};

/**
 * A calculated route gets a COGS for every vehicle type that can run it: the toll group of the route's
 * vehicle and every lower group (a road open to a higher group is open to the lower ones), each under
 * its own code. Vehicle types that have a COGS for the route already are left as they are.
 */
export function autoCogsForRoute(route: RouteRecord): CogsRecord[] {
  lastAutoCogs = createMissingCogs(route);
  return lastAutoCogs;
}

/** COGS code and name of a route × vehicle type: "RT-HCM-DN-T5", "HCM → Đà Nẵng · TRUCK · 5 tấn". */
function createMissingCogs(route: RouteRecord): CogsRecord[] {
  if (route.deleted || route.status !== "Active" || !route.outbound) return [];
  const group = routeGroupOf(route);
  const made: CogsRecord[] = [];
  for (const vt of currentCogsVehicleTypes()) {
    if (vt.brand || vt.group > group) continue;
    if (live().some((c) => c.routeId === route.id && c.vehicleType === vt.key)) continue;
    try {
      made.push(
        cogsService.save({
          ...newCogsDraft(),
          code: autoCogsCode(route.code, vt),
          name: `${route.name} · ${vt.key}`.slice(0, 200),
          routeId: route.id,
          vehicleType: vt.key,
          remark: `Created automatically with route ${route.code} (toll group ${group} and below).`,
        }),
      );
    } catch (e) {
      console.error(`Auto COGS ${route.code} · ${vt.key} failed`, e);
    }
  }
  return made;
}

/**
 * Keeps the COGS in step with the setup: every calculated, active route gets the COGS of the vehicle
 * types that can run it, and every COGS is worked out again from the current Route / Fixed Cost /
 * Variable Cost / Fare Code setup. What the user set on a COGS (Utilization Factor, edited amounts,
 * removed costs, other costs, remarks) is kept. Only COGS whose figures changed are written.
 */
export function syncAllCogs(): { created: number; updated: number } {
  typesInSync = cogsVehicleTypes(vehicleMasterRepository.all(), liveContainerTypes());
  try {
    return syncWith();
  } finally {
    typesInSync = null;
  }
}

function syncWith(): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  for (const r of routeRepository.all()) created += createMissingCogs(r).length;
  for (const c of live()) {
    const route = routeRepository.get(c.routeId);
    if (!route || route.deleted || !route.outbound) continue;
    const d = draftOfCogs(c);
    const b = buildCogsOf(d);
    if (!b) continue;
    const same =
      c.total === b.total &&
      c.routeCode === route.code &&
      c.routeName === route.name &&
      JSON.stringify(c.lines) === JSON.stringify(b.lines);
    if (same) continue;
    try {
      cogsService.save(d, c.id);
      updated++;
    } catch (e) {
      console.error(`COGS ${c.code} could not be worked out again`, e);
    }
  }
  return { created, updated };
}

export const cogsService = {
  save(d: CogsDraft, id?: string): CogsRecord {
    const errors = validateCogs(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const route = routeRepository.get(d.routeId)!;
    const b = buildCogsOf(d)!;
    const body = {
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      routeId: route.id,
      routeCode: route.code,
      routeName: route.name,
      vehicleType: d.vehicleType,
      mappingIds: [...new Set(b.lines.flatMap((l) => (l.mappingId ? [l.mappingId] : [])))],
      utilizationFactor: factorOf(d),
      excluded: d.excluded,
      overrides: d.overrides,
      others: d.others,
      lines: b.lines,
      total: b.total,
      // Remarks of the lines kept only.
      remarks: Object.fromEntries(
        b.lines.flatMap((l) => {
          const r = d.remarks[l.key]?.trim();
          return r ? [[l.key, r]] : [];
        }),
      ),
      remark: d.remark.trim(),
      status: d.status,
    };
    const existing = id ? cogsRepository.get(id) : undefined;
    if (!existing) {
      const rec: CogsRecord = { ...body, id: uid("COGS-"), ...stampCreate() };
      cogsRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "COGS",
        entityId: rec.id,
        entityLabel: rec.code,
        note: `${rec.routeCode} · ${rec.vehicleType} · ${formatNumber(rec.total)} VND`,
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...body });
    cogsRepository.update(existing.id, () => next);
    if (existing.total !== next.total)
      auditService.log({
        action: "UPDATE",
        entityType: "COGS",
        entityId: next.id,
        entityLabel: next.code,
        field: "Total COGS / Trip",
        oldValue: formatNumber(existing.total),
        newValue: formatNumber(next.total),
      });
    return next;
  },
};
