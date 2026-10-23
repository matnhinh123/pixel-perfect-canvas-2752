// COGS records: one per route × vehicle type, saved with a snapshot of the costs picked.
import type { CogsOtherCost, CogsRecord } from "@/types";
import {
  cogsRepository,
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollStationRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import { formatNumber } from "@/lib/format";
import { buildCogs, setupsFor } from "./cogsBuild";
import { cogsVehicleTypes } from "./cogsVehicle";
import { mappingsFor } from "./cogsBuild";

/** Vehicle types of the current Vehicle master. */
export const currentCogsVehicleTypes = () => cogsVehicleTypes(vehicleMasterRepository.all());

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
  /** "" = the first Salary Range / Fuel Cost that applies to the vehicle type. */
  salaryRangeId: string;
  fuelCostId: string;
  excluded: string[];
  overrides: Record<string, number>;
  others: CogsOtherCost[];
  remark: string;
  status: "Active" | "Inactive";
}

export const newCogsDraft = (): CogsDraft => ({
  code: "",
  name: "",
  routeId: "",
  vehicleType: "",
  mappingIds: [],
  salaryRangeId: "",
  fuelCostId: "",
  excluded: [],
  overrides: {},
  others: [],
  remark: "",
  status: "Active",
});

export const draftOfCogs = (c: CogsRecord): CogsDraft => ({
  code: c.code,
  name: c.name ?? "",
  routeId: c.routeId,
  vehicleType: c.vehicleType,
  mappingIds: [...(c.mappingIds ?? [])],
  salaryRangeId: c.salaryRangeId ?? "",
  fuelCostId: c.fuelCostId ?? "",
  excluded: [...c.excluded],
  overrides: { ...(c.overrides ?? {}) },
  others: c.others.map((o) => ({ ...o })),
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
  if (route && d.vehicleType) {
    const dup = live().find(
      (c) => c.id !== id && c.routeId === d.routeId && c.vehicleType === d.vehicleType,
    );
    if (dup) e["routeId"] = `${dup.code} already exists for ${route.code} · ${d.vehicleType}.`;
  }
  const vt = currentCogsVehicleTypes().find((t) => t.key === d.vehicleType);
  if (vt) {
    const ok = new Set(mappingsFor(fixedCostSummaryRepository.all(), vt).map((m) => m.id));
    if (d.mappingIds.some((m) => !ok.has(m)))
      e["mappingIds"] =
        `A Fixed Cost Mapping picked is not for ${vt.key} (or was removed): pick it again.`;
    const sr = setupsFor(salaryRangeRepository.all(), vt.key);
    if (d.salaryRangeId && !sr.some((r) => r.id === d.salaryRangeId))
      e["salaryRangeId"] =
        `The Salary Range picked is not for ${vt.key} (or was removed): pick it again.`;
    const fu = setupsFor(fuelCostRepository.all(), vt.key);
    if (d.fuelCostId && !fu.some((r) => r.id === d.fuelCostId))
      e["fuelCostId"] =
        `The Fuel Cost picked is not for ${vt.key} (or was removed): pick it again.`;
  }
  const badEdit = Object.values(d.overrides).some((v) => !(v >= 0));
  if (badEdit) e["overrides"] = "An edited amount must be 0 or more.";
  const badOther = d.others.findIndex((o) => !o.costId || !(o.amount > 0));
  if (badOther >= 0)
    e["others"] = `Other Cost row ${badOther + 1}: enter a valid Fare Code and an amount above 0.`;
  return e;
}

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
    mappingIds: d.mappingIds,
    salaryRangeId: d.salaryRangeId,
    fuelCostId: d.fuelCostId,
    costs: costItemRepository.all().filter((c) => !c.deleted),
    excluded: d.excluded,
    overrides: d.overrides,
    others: d.others,
  });
};

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
      mappingIds: d.mappingIds,
      salaryRangeId: b.variable.salaryRange?.id ?? "",
      fuelCostId: b.variable.fuelCost?.id ?? "",
      excluded: d.excluded,
      overrides: d.overrides,
      others: d.others,
      lines: b.lines,
      total: b.total,
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
        note: `${rec.routeCode} · ${rec.vehicleType} · ${formatNumber(rec.total)} ₫`,
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
