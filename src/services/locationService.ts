// Location master: add / edit / deactivate / delete. Routing stop pickers read active locations.
import { locationRepository, routeRepository, tollStationRepository, uid } from "@/repositories";
import { normalizeLocation, type LocationMasterRecord } from "@/mock-data/locations";
import {
  COUNTRY_ISO2,
  PORT_SUB_TYPES,
  requiresIata,
  requiresUnLocode,
} from "@/mock-data/locationCatalog";
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

const tollStationsUsing = (id: string) =>
  tollStationRepository.all().filter((g) => !g.deleted && g.locationId === id).length;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export const locationCrud = makeCrud<LocationMasterRecord>({
  entityType: "Location",
  repo: locationRepository,
  labelOf: (l) => l.code ?? l.name,
  references: (l) => {
    const parts: string[] = [];
    const routes = routesUsing(l.id);
    if (routes) parts.push(plural(routes, "route"));
    const gates = tollStationsUsing(l.id);
    if (gates) parts.push(plural(gates, "toll station"));
    return parts.length ? `is used by ${parts.join(" and ")}` : null;
  },
});

/** Non-deleted locations, normalized to the current model (legacy types / codes mapped on read). */
export const listLocations = (rows: LocationMasterRecord[] = locationRepository.all()) =>
  rows.filter((l) => !l.deleted).map(normalizeLocation);

export type LocationDraft = Pick<
  LocationMasterRecord,
  "name" | "address" | "province" | "lat" | "lng" | "status"
> & {
  code: string;
  country: string;
  locationType: string;
  /** Optional, Port only. */
  locationSubType: string;
  unLocode: string;
  iataCode: string;
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
  unLocode: "",
  iataCode: "",
  remark: "",
});

export const draftOfLocation = (raw: LocationMasterRecord): LocationDraft => {
  const l = normalizeLocation(raw);
  return {
    code: l.code ?? l.id.replace(/^LOC-/, ""),
    name: l.name,
    address: l.address,
    province: l.province ?? "",
    lat: Number.isFinite(l.lat) ? l.lat : NaN,
    lng: Number.isFinite(l.lng) ? l.lng : NaN,
    status: l.status === "Active" ? "Active" : "Inactive",
    country: l.country ?? "",
    locationType: l.locationType ?? "",
    locationSubType: l.locationSubType ?? "",
    unLocode: l.unLocode ?? "",
    iataCode: l.iataCode ?? "",
    remark: l.remark ?? "",
  };
};

/** Applies a Type change: clears the codes / sub type that do not belong to the new type. */
export const withLocationType = (d: LocationDraft, locationType: string): LocationDraft => ({
  ...d,
  locationType,
  locationSubType: locationType === "Port" ? d.locationSubType : "",
  unLocode: requiresUnLocode(locationType) ? d.unLocode : "",
  iataCode: requiresIata(locationType) ? d.iataCode : "",
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
  req("country", "quốc gia", "Country");
  req("address", "địa chỉ", "Address");
  if (
    d.locationSubType &&
    (d.locationType !== "Port" ||
      !(PORT_SUB_TYPES as readonly string[]).includes(d.locationSubType))
  )
    e["locationSubType"] = tr("Loại phụ không hợp lệ.", "Invalid sub type.");

  const unLocode = d.unLocode.trim().toUpperCase();
  if (requiresUnLocode(d.locationType)) {
    const iso = COUNTRY_ISO2[d.country.trim()];
    if (!unLocode)
      e["unLocode"] = tr(
        "Nhập UN/LOCODE cho cảng / ICD.",
        "UN/LOCODE is required for a Port / ICD.",
      );
    else if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(unLocode))
      e["unLocode"] = tr(
        "UN/LOCODE gồm 5 ký tự: 2 chữ quốc gia + 3 chữ/số (VD: VNSGN).",
        "UN/LOCODE is 5 characters: 2-letter country + 3 letters/digits (e.g. VNSGN).",
      );
    else if (iso && unLocode.slice(0, 2) !== iso)
      e["unLocode"] = tr(
        `UN/LOCODE phải bắt đầu bằng mã quốc gia ${iso}.`,
        `UN/LOCODE must start with the country code ${iso}.`,
      );
  }
  const iata = d.iataCode.trim().toUpperCase();
  if (requiresIata(d.locationType)) {
    if (!iata)
      e["iataCode"] = tr("Nhập IATA Code cho sân bay.", "IATA Code is required for an Airport.");
    else if (!/^[A-Z]{3}$/.test(iata))
      e["iataCode"] = tr(
        "IATA Code gồm 3 chữ cái (VD: SGN).",
        "IATA Code is 3 letters (e.g. SGN).",
      );
  }
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
  ["province", "Province/City"],
  ["locationType", "Location Type"],
  ["locationSubType", "Port Sub Type"],
  ["unLocode", "UN/LOCODE"],
  ["iataCode", "IATA Code"],
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
    const typed = withLocationType(d, d.locationType);
    const clean: LocationDraft = {
      ...typed,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      address: d.address.trim(),
      country: d.country.trim(),
      province: d.province.trim(),
      unLocode: typed.unLocode.trim().toUpperCase(),
      iataCode: typed.iataCode.trim().toUpperCase(),
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
    // Out-of-scope legacy fields are dropped when a row is saved again.
    const kept: LocationMasterRecord = { ...existing };
    delete kept.serviceMode;
    delete kept.externalCode;
    delete kept.operatorName;
    delete kept.customsControlled;
    delete kept.bonded;
    const next = stampUpdate({ ...kept, ...clean });
    locationRepository.update(existing.id, () => next);
    const base = { entityType: "Location" as const, entityId: next.id, entityLabel: clean.code };
    const out: AuditInput[] = [];
    const upd = (field: string, a: string, b: string) =>
      a !== b &&
      out.push({ ...base, action: "UPDATE", field, oldValue: a || "—", newValue: b || "—" });
    const before = draftOfLocation(existing);
    for (const [k, label] of FIELD_LABELS) upd(label, String(before[k]), String(clean[k]));
    upd("Coordinates", `${before.lat}, ${before.lng}`, `${clean.lat}, ${clean.lng}`);
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
