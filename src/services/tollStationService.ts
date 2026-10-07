// Toll Station master: list + prices, add / edit / delete. Routing reads active stations from here.
import { tollStationRepository, uid } from "@/repositories";
import type { MockTollGate, TollGateRecord } from "@/mock-data/tollCatalog";
import type { FeeType } from "@/types";
import { tr } from "@/lib/i18n";
import { auditService } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";

export { activeTollGates } from "./routing/tollGates";

export const tollStationCrud = makeCrud<TollGateRecord>({
  entityType: "Toll Station",
  repo: tollStationRepository,
  labelOf: (g) => g.code,
  references: () => null,
});

/** Fee type labels for master-data screens; pass `t` from `useT()` (or `tr`). */
export const feeTypeLabels = (t: (vi: string, en: string) => string): Record<FeeType, string> => ({
  Toll: t("Cầu đường", "Toll"),
  Bridge: t("Cầu", "Bridge"),
  Ferry: t("Phà", "Ferry"),
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

/** `requireCoords: false` — tolls typed in on a route (no position known; not auto-matched later). */
export function validateTollStation(
  d: TollStationDraft,
  id?: string,
  { requireCoords = true }: { requireCoords?: boolean } = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = tr("Nhập mã trạm.", "Enter the station code.");
  else if (
    tollStationRepository
      .all()
      .some((g) => !g.deleted && g.id !== id && g.code.toUpperCase() === code)
  )
    e["code"] = tr(`Mã trạm ${code} đã tồn tại.`, `Station code ${code} already exists.`);
  if (!d.name.trim()) e["name"] = tr("Nhập tên trạm.", "Enter the station name.");
  if (requireCoords || Number.isFinite(d.lat) || Number.isFinite(d.lng)) {
    if (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90)
      e["lat"] = tr("Vĩ độ không hợp lệ.", "Invalid latitude.");
    if (!Number.isFinite(d.lng) || Math.abs(d.lng) > 180)
      e["lng"] = tr("Kinh độ không hợp lệ.", "Invalid longitude.");
  }
  if (d.prices.some((p) => !Number.isFinite(p) || p < 0))
    e["prices"] = tr("Giá vé phải ≥ 0.", "Prices must be ≥ 0.");
  return e;
}

export const tollStationService = {
  save(d: TollStationDraft, id?: string, opts?: { requireCoords?: boolean }): TollGateRecord {
    const errors = validateTollStation(d, id, opts);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
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
            field: tr("Giá vé", "Prices"),
            oldValue: existing.prices.join(" / "),
            newValue: next.prices.join(" / "),
          }
        : {}),
    });
    return next;
  },
};
