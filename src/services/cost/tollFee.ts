// Variable Cost › Toll Fee: one Toll Fee per route, made with the route (and for every route already
// there), holding the Fare Code its toll stations are booked to in a COGS. The fees come from the route.
import {
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollFeeRepository,
  uid,
  variableCostMappingRepository,
} from "@/repositories";
import { auditService } from "@/services/auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "@/services/crudService";
import type { Collection } from "@/repositories/storage";
import type { BaseRecord, TollFeeRecord, VariableComponent } from "@/types";
import { fareCodeOf, fareIdOf } from "./fareCode";

/** The Toll Fee of a route (live). */
export const tollFeeOfRoute = (fees: readonly TollFeeRecord[], routeId: string) =>
  fees.find((f) => !f.deleted && f.routeId === routeId);

/**
 * The Fare Codes of the old Variable Cost Mapping (one per variable cost) moved onto the setups: each
 * Salary Range, Fuel Cost and Toll Fee without a Fare Code gets the one of its variable cost. Runs once:
 * the mappings are deleted after.
 */
function moveVariableMappings() {
  const live = variableCostMappingRepository.all().filter((m) => !m.deleted);
  if (!live.length) return;
  const fareOf = (c: VariableComponent) =>
    live.find((m) => m.component === c && m.status === "Active")?.assignCostId;
  const fill = <T extends BaseRecord & { fareCostId?: string | undefined }>(
    repo: Collection<T>,
    fare: string | undefined,
  ) => {
    if (!fare) return;
    for (const r of repo.all())
      if (!r.deleted && !r.fareCostId) repo.update(r.id, (x) => ({ ...x, fareCostId: fare }));
  };
  fill(salaryRangeRepository, fareOf("Trip Salary"));
  fill(fuelCostRepository, fareOf("Fuel Cost"));
  fill(tollFeeRepository, fareOf("Toll Fee"));
  for (const m of live)
    variableCostMappingRepository.update(m.id, (x) => ({ ...x, deleted: true }));
}

/**
 * Every live route has its Toll Fee: missing ones are made (no Fare Code yet), the code follows the
 * route's, the Toll Fee of a deleted route goes with it.
 */
export function syncTollFees() {
  const fees = tollFeeRepository.all();
  const routes = routeRepository.all().filter((r) => !r.deleted);
  const has = new Set(fees.filter((f) => !f.deleted).map((f) => f.routeId));
  const add: TollFeeRecord[] = routes
    .filter((r) => !has.has(r.id))
    .map((r) => ({
      id: tollFeeRepository.get(`TF-${r.id}`) ? uid("TF-") : `TF-${r.id}`,
      code: r.code,
      routeId: r.id,
      remark: "",
      status: "Active",
      ...stampCreate(),
    }));
  if (add.length) tollFeeRepository.insertMany(add);
  for (const f of fees) {
    if (f.deleted) continue;
    const r = routeRepository.get(f.routeId);
    if (!r || r.deleted) tollFeeRepository.update(f.id, (x) => ({ ...x, deleted: true }));
    else if (r.code !== f.code) tollFeeRepository.update(f.id, (x) => ({ ...x, code: r.code }));
  }
  moveVariableMappings();
}

export const tollFeeCrud = makeCrud<TollFeeRecord>({
  entityType: "Toll Fee",
  repo: tollFeeRepository,
  labelOf: (f) => f.code,
  references: () => "is made with its route",
});

function logFare(f: TollFeeRecord, next: string | undefined) {
  auditService.log({
    action: "UPDATE",
    entityType: "Toll Fee",
    entityId: f.id,
    entityLabel: f.code,
    field: "Fare Code",
    oldValue: fareCodeOf(f.fareCostId) || "—",
    newValue: fareCodeOf(next) || "—",
  });
}

export const tollFeeService = {
  /** One Fare Code for every Toll Fee picked (empty: none). Returns how many changed. */
  mapFare(ids: readonly string[], fareCode: string): number {
    const { id: fare, error } = fareIdOf(fareCode);
    if (error) throw new BusinessRuleError(error, { fareCode: error });
    let n = 0;
    for (const id of ids) {
      const f = tollFeeRepository.get(id);
      if (!f || f.deleted || f.fareCostId === fare) continue;
      tollFeeRepository.update(id, (x) => stampUpdate({ ...x, fareCostId: fare }));
      logFare(f, fare);
      n++;
    }
    return n;
  },
  /** The Toll Fee page: its Fare Code and Remark. */
  save(id: string, d: { fareCode: string; remark: string }): TollFeeRecord {
    const f = tollFeeRepository.get(id);
    if (!f || f.deleted) throw new BusinessRuleError("Toll Fee not found.");
    const { id: fare, error } = fareIdOf(d.fareCode);
    if (error)
      throw new BusinessRuleError("Please check the highlighted fields.", { fareCode: error });
    const next = stampUpdate({ ...f, fareCostId: fare, remark: d.remark.trim() });
    tollFeeRepository.update(id, () => next);
    if (f.fareCostId !== fare) logFare(f, fare);
    if (f.remark !== next.remark)
      auditService.log({
        action: "UPDATE",
        entityType: "Toll Fee",
        entityId: f.id,
        entityLabel: f.code,
        field: "Remark",
        oldValue: f.remark || "—",
        newValue: next.remark || "—",
      });
    return next;
  },
};
