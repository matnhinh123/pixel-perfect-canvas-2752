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
        [
          r.origin,
          ...r.waypoints,
          r.destination,
          ...r.returnWaypoints,
          ...(r.returnStart ? [r.returnStart] : []),
          ...(r.returnEnd ? [r.returnEnd] : []),
        ].some((p) => p.locationId === id),
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
> & {
  code: string;
  country: string;
  locationType: string;
  locationSubType: string;
  serviceMode: string;
  unLocode: string;
  iataCode: string;
  externalCode: string;
  operatorName: string;
  customsControlled: boolean;
  bonded: boolean;
  remark: string;
};

/** Next free "VN001"-style code, offered as the default when creating a location. */
export function suggestLocationCode(): string {
  let max = 0;
  for (const l of locationRepository.all()) {
    const m = /^VN(\d{3,})$/.exec(l.code ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `VN${String(max + 1).padStart(3, "0")}`;
}

export const newLocationDraft = (): LocationDraft => ({
  code: suggestLocationCode(),
  name: "",
  address: "",
  province: "",
  lat: NaN,
  lng: NaN,
  status: "Active",
  country: "",
  locationType: "",
  locationSubType: "",
  serviceMode: "",
  unLocode: "",
  iataCode: "",
  externalCode: "",
  operatorName: "",
  customsControlled: false,
  bonded: false,
  remark: "",
});

export const draftOfLocation = (l: LocationMasterRecord): LocationDraft => ({
  code: l.code ?? l.id.replace(/^LOC-/, ""),
  name: l.name,
  address: l.address,
  province: l.province,
  lat: Number.isFinite(l.lat) ? l.lat : NaN,
  lng: Number.isFinite(l.lng) ? l.lng : NaN,
  status: l.status === "Active" ? "Active" : "Inactive",
  country: l.country ?? "",
  locationType: l.locationType ?? "",
  locationSubType: l.locationSubType ?? "",
  serviceMode: l.serviceMode ?? "",
  unLocode: l.unLocode ?? "",
  iataCode: l.iataCode ?? "",
  externalCode: l.externalCode ?? "",
  operatorName: l.operatorName ?? "",
  customsControlled: l.customsControlled ?? false,
  bonded: l.bonded ?? false,
  remark: l.remark ?? "",
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
  const req = (k: keyof LocationDraft, vi: string, en: string) => {
    if (!String(d[k] ?? "").trim()) e[k] = tr(`Nhập ${vi}.`, `${en} is required.`);
  };
  req("name", "tên địa điểm", "Location name");
  req("locationType", "loại địa điểm", "Location type");
  req("locationSubType", "loại địa điểm phụ", "Location sub type");
  req("serviceMode", "phương thức dịch vụ", "Service mode");
  req("country", "quốc gia", "Country");
  req("address", "địa chỉ", "Address");
  if (d.unLocode.trim() && !/^[A-Za-z]{2}[A-Za-z0-9]{3}$/.test(d.unLocode.trim()))
    e["unLocode"] = tr(
      "UN/LOCODE gồm 5 ký tự: 2 chữ quốc gia + 3 chữ/số (VD: VNSGN).",
      "UN/LOCODE is 5 characters: 2-letter country + 3 letters/digits (e.g. VNSGN).",
    );
  if (d.iataCode.trim() && !/^[A-Za-z]{3}$/.test(d.iataCode.trim()))
    e["iataCode"] = tr("IATA Code gồm 3 chữ cái (VD: SGN).", "IATA Code is 3 letters (e.g. SGN).");
  // Coordinates are optional, but if one is typed both must be valid.
  const hasLat = Number.isFinite(d.lat),
    hasLng = Number.isFinite(d.lng);
  if (hasLat !== hasLng || (hasLat && (Math.abs(d.lat) > 90 || Math.abs(d.lng) > 180)))
    e["coords"] = tr(
      "Toạ độ không hợp lệ (vĩ độ -90…90, kinh độ -180…180).",
      "Invalid coordinates (latitude -90…90, longitude -180…180).",
    );
  return e;
}

const FIELD_LABELS: [keyof LocationDraft, string][] = [
  ["code", "Code"],
  ["name", "Name"],
  ["address", "Address"],
  ["country", "Country"],
  ["locationType", "Location Type"],
  ["locationSubType", "Location Sub Type"],
  ["serviceMode", "Service Mode"],
  ["unLocode", "UN/LOCODE"],
  ["iataCode", "IATA Code"],
  ["externalCode", "External Code"],
  ["operatorName", "Operator Name"],
  ["remark", "Remark"],
];

export const locationService = {
  save(d: LocationDraft, id?: string): LocationMasterRecord {
    const errors = validateLocation(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const country = d.country.trim();
    const clean = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      address: d.address.trim(),
      country,
      // Routing shows `province` as the stop's address line; fall back to the country when unset.
      province: d.province.trim() || country,
      unLocode: d.unLocode.trim().toUpperCase(),
      iataCode: d.iataCode.trim().toUpperCase(),
      externalCode: d.externalCode.trim(),
      operatorName: d.operatorName.trim(),
      remark: d.remark.trim(),
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
    const before = draftOfLocation(existing);
    for (const [k, label] of FIELD_LABELS) upd(label, String(before[k]), String(clean[k]));
    upd("Coordinates", `${before.lat}, ${before.lng}`, `${clean.lat}, ${clean.lng}`);
    upd("Is Customs Controlled", String(before.customsControlled), String(clean.customsControlled));
    upd("Is Bonded", String(before.bonded), String(clean.bonded));
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
