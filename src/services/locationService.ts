// Location master: add / edit / deactivate / delete. Routing stop pickers read active locations.
import { locationRepository, routeRepository, uid } from "@/repositories";
import type { LocationMasterRecord } from "@/mock-data/locations";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";

const routesUsing = (id: string) =>
  routeRepository
    .all()
    .filter(
      (r) =>
        !r.deleted &&
        [r.origin, ...r.waypoints, r.destination, ...r.returnWaypoints].some(
          (p) => p.locationId === id,
        ),
    ).length;

export const locationCrud = makeCrud<LocationMasterRecord>({
  entityType: "Location",
  repo: locationRepository,
  labelOf: (l) => l.code ?? l.name,
  references: (l) => {
    const n = routesUsing(l.id);
    return n ? `is used by ${n} route${n > 1 ? "s" : ""}` : null;
  },
});

export type LocationDraft = Pick<
  LocationMasterRecord,
  "name" | "address" | "province" | "lat" | "lng" | "status"
> & { code: string };

export const newLocationDraft = (): LocationDraft => ({
  code: "",
  name: "",
  address: "",
  province: "",
  lat: NaN,
  lng: NaN,
  status: "Active",
});

export function validateLocation(d: LocationDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = tr("Nhập mã địa điểm.", "Location code is required.");
  else if (!/^[A-Z0-9_-]{2,20}$/.test(code))
    e["code"] = tr("Mã gồm 2–20 chữ, số, - hoặc _.", "Use 2–20 letters, digits, - or _.");
  else if (
    locationRepository
      .all()
      .some((l) => !l.deleted && l.id !== id && (l.code ?? "").toUpperCase() === code)
  )
    e["code"] = tr(`Mã ${code} đã tồn tại.`, `Code ${code} already exists.`);
  if (!d.name.trim()) e["name"] = tr("Nhập tên địa điểm.", "Location name is required.");
  if (!d.province.trim())
    e["province"] = tr("Nhập tỉnh / thành phố.", "Province / city is required.");
  if (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90)
    e["lat"] = tr("Vĩ độ không hợp lệ (-90 … 90).", "Invalid latitude (-90 … 90).");
  if (!Number.isFinite(d.lng) || Math.abs(d.lng) > 180)
    e["lng"] = tr("Kinh độ không hợp lệ (-180 … 180).", "Invalid longitude (-180 … 180).");
  return e;
}

export const locationService = {
  save(d: LocationDraft, id?: string): LocationMasterRecord {
    const errors = validateLocation(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const clean = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      address: d.address.trim(),
      province: d.province.trim(),
    };
    const existing = id ? locationRepository.get(id) : undefined;
    if (!existing) {
      const rec: LocationMasterRecord = { ...clean, id: uid("LOC-"), ...stampCreate() };
      locationRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Location",
        entityId: rec.id,
        entityLabel: rec.code ?? rec.name,
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    locationRepository.update(existing.id, () => next);
    const base = { entityType: "Location" as const, entityId: next.id, entityLabel: clean.code };
    const out: AuditInput[] = [];
    const upd = (field: string, a: string, b: string) =>
      a !== b &&
      out.push({ ...base, action: "UPDATE", field, oldValue: a || "—", newValue: b || "—" });
    upd("Code", existing.code ?? "", next.code ?? "");
    upd("Name", existing.name, next.name);
    upd("Address", existing.address, next.address);
    upd("Province", existing.province, next.province);
    upd("Coordinates", `${existing.lat}, ${existing.lng}`, `${next.lat}, ${next.lng}`);
    if (existing.status !== next.status)
      out.push({
        ...base,
        action: next.status === "Active" ? "ACTIVATE" : "DEACTIVATE",
        field: "Status",
        oldValue: existing.status,
        newValue: next.status,
      });
    auditService.logMany(out);
    return next;
  },
};
