// Location master: add / edit / deactivate / delete. Routing stop pickers read active locations.
import { locationRepository, routeRepository, tollStationRepository, uid } from "@/repositories";
import {
  locationOrigin,
  normalizeLocation,
  type LocationMasterRecord,
} from "@/mock-data/locations";
import { COUNTRY_ISO2, LOCATION_COUNTRIES, LOCATION_TYPES } from "@/mock-data/locationCatalog";
import {
  CODE_KINDS,
  codeKindOf,
  findStandardCode,
  defaultTypeFor,
  typesAllowedFor,
  type CodeKind,
  type StandardCode,
} from "@/mock-data/standardCodes";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { draftImportConfig, numCell, pick } from "./importExportService";

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
  /** Which code the user enters: a UN/LOCODE / IATA Code from the reference list or a Local Code. */
  codeType: CodeKind;
  code: string;
  country: string;
  locationType: string;
  remark: string;
};

/** Next free "VN001"-style code, offered as the default when creating a location. */
export function suggestLocationCode(): string {
  let max = 0;
  for (const l of locationRepository.all()) {
    const m = /^VN(\d{3,})$/.exec(l.code ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  // Skip a number that happens to be a real UN/LOCODE: a suggested code stays a Local Code.
  let code = "";
  do code = `VN${String(++max).padStart(3, "0")}`;
  while (findStandardCode(code));
  return code;
}

export const newLocationDraft = (): LocationDraft => ({
  codeType: "Local Code",
  code: suggestLocationCode(),
  name: "",
  address: "",
  province: "",
  lat: NaN,
  lng: NaN,
  status: "Active",
  country: "",
  locationType: "",
  remark: "",
});

export const draftOfLocation = (raw: LocationMasterRecord): LocationDraft => {
  const l = normalizeLocation(raw);
  return {
    codeType: locationOrigin(l),
    code: l.code ?? l.id.replace(/^LOC-/, ""),
    name: l.name,
    address: l.address,
    province: l.province ?? "",
    lat: Number.isFinite(l.lat) ? l.lat : NaN,
    lng: Number.isFinite(l.lng) ? l.lng : NaN,
    status: l.status === "Active" ? "Active" : "Inactive",
    country: l.country ?? "",
    locationType: l.locationType ?? "",
    remark: l.remark ?? "",
  };
};

/** Does the code belong to the code type (a Local Code must not be a UN/LOCODE / IATA Code)? */
const codeFits = (code: string, type: CodeKind) => codeKindOf(code) === type;

/** Location Types allowed per Code Type: UN/LOCODE → Seaport / Depot, IATA Code → Airport. */
export const STANDARD_TYPES: Record<Exclude<CodeKind, "Local Code">, string[]> = {
  "UN/LOCODE": ["Seaport", "Depot"],
  "IATA Code": ["Airport"],
};

/** Is the Location Type allowed with this Code Type (Local Code → any)? */
export const typeFits = (d: Pick<LocationDraft, "codeType">, type: string): boolean =>
  d.codeType === "Local Code" || STANDARD_TYPES[d.codeType].includes(type);

/**
 * Applies a Code Type change: keeps the code when it still fits, else clears it (a Local Code gets
 * the next suggested code). A UN/LOCODE keeps Seaport / Depot (else Seaport), an IATA Code is an
 * Airport.
 */
export function withCodeType(d: LocationDraft, codeType: CodeKind): LocationDraft {
  const code =
    d.code && codeFits(d.code, codeType)
      ? d.code
      : codeType === "Local Code"
        ? suggestLocationCode()
        : "";
  const next = { ...d, codeType, code };
  const std = findStandardCode(code);
  return std?.kind === codeType
    ? withStandardCode(next, std)
    : {
        ...next,
        locationType:
          codeType === "Local Code" || typeFits(next, d.locationType)
            ? d.locationType
            : STANDARD_TYPES[codeType][0]!,
      };
}

/**
 * Applies a code from the reference list: Code Type + code, Country from the code (locked on the
 * form), a Location Type that fits what the place handles, and the official name / coordinates
 * when those are still empty (both stay editable).
 */
export function withStandardCode(d: LocationDraft, c: StandardCode): LocationDraft {
  const next: LocationDraft = { ...d, codeType: c.kind, code: c.code };
  const allowed = typesAllowedFor(c);
  const country = c.country || d.country;
  return {
    ...next,
    country,
    province: country === d.country ? d.province : "",
    locationType: !allowed || allowed.includes(d.locationType) ? d.locationType : defaultTypeFor(c),
    name: d.name.trim() ? d.name : c.name,
    ...(!Number.isFinite(d.lat) && Number.isFinite(c.lat) ? { lat: c.lat, lng: c.lng } : {}),
  };
}

export function validateLocation(d: LocationDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = tr(`Nhập ${d.codeType}.`, `${d.codeType} is required.`);
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

  // The code must match the chosen Code Type: a UN/LOCODE / IATA Code comes from the reference
  // list; a Local Code is free but must not be one of those codes.
  if (!(CODE_KINDS as readonly string[]).includes(d.codeType))
    e["codeType"] = tr("Chọn loại mã.", "Code Type is required.");
  const std = !e["code"] ? findStandardCode(code) : undefined;
  if (e["code"] || e["codeType"]) {
    // already reported
  } else if (d.codeType === "UN/LOCODE" && std?.kind !== "UN/LOCODE")
    e["code"] = tr(
      `${code} không có trong danh mục UN/LOCODE (5 ký tự, VD: VNSGN).`,
      `${code} is not in the UN/LOCODE list (5 characters, e.g. VNSGN).`,
    );
  else if (d.codeType === "IATA Code" && std?.kind !== "IATA Code")
    e["code"] = tr(
      `${code} không có trong danh mục IATA (3 chữ, VD: SGN).`,
      `${code} is not in the IATA list (3 letters, e.g. SGN).`,
    );
  else if (d.codeType === "Local Code" && std)
    e["code"] = tr(
      `${code} là ${std.kind} (${std.name}) — chọn Code Type ${std.kind} hoặc đặt mã khác.`,
      `${code} is a ${std.kind} (${std.name}) — choose Code Type ${std.kind} or another code.`,
    );
  else if (std && d.country.trim() && COUNTRY_ISO2[d.country.trim()] !== std.iso2)
    e["code"] = tr(
      `${std.kind} ${std.code} thuộc quốc gia ${std.country || std.iso2}, không khớp Country.`,
      `${std.kind} ${std.code} belongs to ${std.country || std.iso2}, not the chosen Country.`,
    );
  // The Location Type must fit what the standard code handles (UN/LOCODE functions / airport).
  if (std && std.kind === d.codeType && d.locationType && !typeFits(d, d.locationType))
    e["locationType"] = tr(
      `${std.kind} chỉ dùng cho Location Type ${(typesAllowedFor(std) ?? []).join(", ")}.`,
      `A ${std.kind} is only for Location Type ${(typesAllowedFor(std) ?? []).join(", ")}.`,
    );
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
  ["codeType", "Code Type"],
  ["code", "Code"],
  ["name", "Name"],
  ["address", "Address"],
  ["country", "Country"],
  ["province", "Province/City"],
  ["locationType", "Location Type"],
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
    const clean: LocationDraft = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      address: d.address.trim(),
      country: d.country.trim(),
      province: d.province.trim(),
      remark: d.remark.trim(),
    };
    // Stored alongside the code for search / export: which international code it is.
    const kind = clean.codeType;
    const codes = {
      unLocode: kind === "UN/LOCODE" ? clean.code : "",
      iataCode: kind === "IATA Code" ? clean.code : "",
    };
    const existing = id ? locationRepository.get(id) : undefined;
    if (!existing) {
      const rec: LocationMasterRecord = {
        ...clean,
        ...codes,
        id: uid("LOC-"),
        ...stampCreate(),
      };
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
    delete kept.locationSubType;
    const next = stampUpdate({ ...kept, ...clean, ...codes });
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

// ---------------------------------------------------------------- import

const STATUSES = ["Active", "Inactive"] as const;

/** Import row → form draft; the form's validateLocation() then checks it like a manual entry. */
const locationDraftOfRow = (r: Record<string, string>): LocationDraft => ({
  ...newLocationDraft(),
  // Without a Code Type column the code says what it is.
  codeType: pick(r["codeType"], CODE_KINDS) || codeKindOf(r["code"]),
  code: r["code"] ?? "",
  name: r["name"] ?? "",
  address: r["address"] ?? "",
  province: r["province"] ?? "",
  country: pick(r["country"], LOCATION_COUNTRIES) || (r["country"] ?? ""),
  lat: numCell(r["lat"]),
  lng: numCell(r["lng"]),
  status: pick(r["status"], STATUSES) || "Active",
  remark: r["remark"] ?? "",
  locationType: pick(r["locationType"], LOCATION_TYPES) || "",
});

/** Headers accept the template name plus the list's Vietnamese / English labels (export → import). */
export const locationImportConfig = draftImportConfig<LocationDraft>({
  entityType: "Location",
  screen: "location",
  keyColumn: "code",
  columns: [
    {
      key: "code",
      header: "Code",
      required: true,
      example: "VN101",
      // A Port's code is its UN/LOCODE, an Airport's its IATA Code.
      aliases: ["Mã", "Local Code", "Location Code", "UN/LOCODE", "IATA Code"],
    },
    { key: "codeType", header: "Code Type", example: "Local Code", aliases: ["Loại mã"] },
    { key: "name", header: "Name", required: true, example: "Kho Bình Tân", aliases: ["Tên"] },
    {
      key: "locationType",
      header: "Location Type",
      required: true,
      example: "Warehouse",
      aliases: ["Type", "Loại"],
    },
    {
      key: "country",
      header: "Country",
      required: true,
      example: "Vietnam",
      aliases: ["Quốc gia"],
    },
    {
      key: "province",
      header: "Province/City",
      example: "TP. Hồ Chí Minh",
      aliases: ["Tỉnh/Thành phố"],
    },
    {
      key: "address",
      header: "Address",
      required: true,
      example: "Bình Tân, TP. Hồ Chí Minh",
      aliases: ["Địa chỉ"],
    },
    { key: "lat", header: "Latitude", example: "10.7652", aliases: ["Vĩ độ"] },
    { key: "lng", header: "Longitude", example: "106.6039", aliases: ["Kinh độ"] },
    { key: "status", header: "Status", example: "Active", aliases: ["Trạng thái"] },
    { key: "remark", header: "Remark", example: "", aliases: ["Ghi chú"] },
  ],
  existingKeys: () =>
    new Set(
      locationRepository
        .all()
        .filter((l) => !l.deleted)
        .map((l) => (l.code ?? "").toLowerCase())
        .filter(Boolean),
    ),
  parseCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    if (pick(r["locationType"], LOCATION_TYPES) === undefined)
      e.push({ field: "locationType", error: `Use one of: ${LOCATION_TYPES.join(", ")}` });
    if (r["codeType"] && pick(r["codeType"], CODE_KINDS) === undefined)
      e.push({ field: "codeType", error: `Use one of: ${CODE_KINDS.join(", ")}` });
    if (pick(r["country"], LOCATION_COUNTRIES) === undefined)
      e.push({ field: "country", error: `Use one of: ${LOCATION_COUNTRIES.join(", ")}` });
    if (pick(r["status"], STATUSES) === undefined)
      e.push({ field: "status", error: "Active or Inactive (empty = Active)" });
    for (const k of ["lat", "lng"])
      if (r[k] && !Number.isFinite(numCell(r[k])))
        e.push({ field: k, error: "Must be a number (e.g. 10.7652)" });
    return e;
  },
  toDraft: locationDraftOfRow,
  validate: (d) => validateLocation(d),
  errorColumn: { coords: "lat" },
  save: (d) => locationService.save(d),
  rollback: (ids) => locationCrud.removeMany(ids),
  sampleRows: () => {
    // Ports / airports use real codes that are not in the seed (UN/LOCODE ICDs, IATA airports).
    const ports = ["VNIPH", "VNBDG", "VNLBT", "VNPHG"];
    const airports = ["VCS", "VKG"];
    const rows = Array.from({ length: 20 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      // Ports: VNIPH is an ICD (Depot), the others seaports.
      const port = i % 5 === 0,
        airport = i % 7 === 3;
      return [
        port ? ports[i / 5]! : airport ? airports[i === 3 ? 0 : 1]! : `IMP-L${n}`,
        port ? "UN/LOCODE" : airport ? "IATA Code" : "Local Code",
        port ? `Cảng nhập ${n}` : airport ? `Sân bay nhập ${n}` : `Kho nhập ${n}`,
        port ? (i === 0 ? "Depot" : "Seaport") : airport ? "Airport" : "Warehouse",
        "Vietnam",
        "Bình Dương",
        `Lô ${n}, KCN VSIP I, Thuận An, Bình Dương`,
        (10.92 + i * 0.004).toFixed(4),
        (106.71 + i * 0.003).toFixed(4),
        i % 6 === 5 ? "Inactive" : "Active",
        "",
      ];
    });
    rows[2]![0] = "IMP-L02"; // duplicate code
    rows[9]![3] = "Terminal"; // unknown type
    rows[14]![6] = ""; // missing address
    return rows;
  },
});
