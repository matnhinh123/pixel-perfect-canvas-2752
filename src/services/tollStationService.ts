// Toll Station master: list + prices, add / edit / delete. Routing reads active stations from here.
import { tollStationRepository, uid } from "@/repositories";
import type { MockTollGate, TollGateRecord } from "@/mock-data/tollCatalog";
import { auditService } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";

export { activeTollGates } from "./routing/tollGates";

export const tollStationCrud = makeCrud<TollGateRecord>({
  entityType: "Toll Station",
  repo: tollStationRepository,
  labelOf: (g) => g.code,
  references: () => null,
});

export type TollStationDraft = Omit<MockTollGate, "id">;

export const newTollStationDraft = (): TollStationDraft => ({
  code: "",
  name: "",
  address: "",
  province: "",
  road: "",
  feeType: "Toll",
  lat: NaN,
  lng: NaN,
  prices: [0, 0, 0, 0, 0],
});

export function validateTollStation(d: TollStationDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Nhập mã trạm.";
  else if (
    tollStationRepository
      .all()
      .some((g) => !g.deleted && g.id !== id && g.code.toUpperCase() === code)
  )
    e["code"] = `Mã trạm ${code} đã tồn tại.`;
  if (!d.name.trim()) e["name"] = "Nhập tên trạm.";
  if (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90) e["lat"] = "Vĩ độ không hợp lệ.";
  if (!Number.isFinite(d.lng) || Math.abs(d.lng) > 180) e["lng"] = "Kinh độ không hợp lệ.";
  if (d.prices.some((p) => !Number.isFinite(p) || p < 0)) e["prices"] = "Giá vé phải ≥ 0.";
  return e;
}

export const tollStationService = {
  save(d: TollStationDraft, id?: string): TollGateRecord {
    const errors = validateTollStation(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Vui lòng kiểm tra các trường được đánh dấu.", errors);
    const clean = { ...d, code: d.code.trim().toUpperCase(), name: d.name.trim() };
    const existing = id ? tollStationRepository.get(id) : undefined;
    const base = { entityType: "Toll Station" as const };
    if (!existing) {
      const rec: TollGateRecord = { ...clean, id: uid("T-"), status: "Active", ...stampCreate() };
      tollStationRepository.insert(rec);
      auditService.log({ ...base, action: "CREATE", entityId: rec.id, entityLabel: rec.code });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    tollStationRepository.update(existing.id, () => next);
    auditService.log({
      ...base,
      action: "UPDATE",
      entityId: next.id,
      entityLabel: next.code,
      ...(existing.prices.join() !== next.prices.join()
        ? {
            field: "Giá vé",
            oldValue: existing.prices.join(" / "),
            newValue: next.prices.join(" / "),
          }
        : {}),
    });
    return next;
  },
};
