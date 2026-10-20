// COGS records: one per route × vehicle type, saved with a snapshot of the costs picked.
import type { CogsOtherCost, CogsRecord } from "@/types";
import {
  cogsRepository,
  costItemRepository,
  fixedCostRepository,
  routeRepository,
  tollStationRepository,
  uid,
  vehicleMasterRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import { formatNumber } from "@/lib/format";
import { buildCogs } from "./cogsBuild";
import { cogsVehicleTypes } from "./cogsVehicle";
import { fuelService, salaryRangeService } from "./salaryRange";

/** Vehicle types of the current Vehicle master. */
export const currentCogsVehicleTypes = () => cogsVehicleTypes(vehicleMasterRepository.all());

export const cogsCrud = makeCrud<CogsRecord>({
  entityType: "COGS",
  repo: cogsRepository,
  labelOf: (c) => c.code,
  references: () => null,
});

export interface CogsDraft {
  routeId: string;
  vehicleType: string;
  excluded: string[];
  overrides: Record<string, number>;
  others: CogsOtherCost[];
  remark: string;
  status: "Active" | "Inactive";
}

export const newCogsDraft = (): CogsDraft => ({
  routeId: "",
  vehicleType: "",
  excluded: [],
  overrides: {},
  others: [],
  remark: "",
  status: "Active",
});

export const draftOfCogs = (c: CogsRecord): CogsDraft => ({
  routeId: c.routeId,
  vehicleType: c.vehicleType,
  excluded: [...c.excluded],
  overrides: { ...(c.overrides ?? {}) },
  others: c.others.map((o) => ({ ...o })),
  remark: c.remark,
  status: c.status === "Inactive" ? "Inactive" : "Active",
});

const live = () => cogsRepository.all().filter((c) => !c.deleted);

export function validateCogs(d: CogsDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
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
  const badEdit = Object.values(d.overrides).some((v) => !(v >= 0));
  if (badEdit) e["overrides"] = "An edited amount must be 0 or more.";
  const badOther = d.others.findIndex((o) => !o.costId || !(o.amount > 0));
  if (badOther >= 0)
    e["others"] = `Other Cost row ${badOther + 1}: pick a Fare Detail and enter an amount above 0.`;
  return e;
}

const nextCode = () => {
  const max = live().reduce((m, c) => Math.max(m, Number(/(\d+)$/.exec(c.code)?.[1] ?? 0)), 0);
  return `COGS-${String(max + 1).padStart(4, "0")}`;
};

/** Builds the COGS of a draft from the current Route / Fixed Cost / Variable Cost / Cost setup. */
export const buildCogsOf = (d: CogsDraft) => {
  const route = routeRepository.get(d.routeId);
  const vehicle = currentCogsVehicleTypes().find((t) => t.key === d.vehicleType);
  if (!route || !vehicle) return null;
  return buildCogs({
    route,
    vehicle,
    tables: salaryRangeService.get().current.tables,
    fuel: fuelService.get(),
    tollMasters: tollStationRepository.all().filter((t) => !t.deleted),
    fixedCosts: fixedCostRepository.all(),
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
      routeId: route.id,
      routeCode: route.code,
      routeName: route.name,
      vehicleType: d.vehicleType,
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
      const rec: CogsRecord = { ...body, id: uid("COGS-"), code: nextCode(), ...stampCreate() };
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
