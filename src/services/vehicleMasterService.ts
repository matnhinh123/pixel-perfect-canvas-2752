// Vehicle master (SMD.VH.01–03): CRUD, the field matrix per vehicle type, validation, the head's
// Container Size Mapping, document expiry alerts and the derived "Max Distance".
import { uid, vehicleMasterRepository } from "@/repositories";
import { readJson, writeJson } from "@/repositories/storage";
import {
  TRAILER_TYPES,
  VEHICLE_MASTER_TYPES,
  type ContainerSizeMapping,
  type TrailerType,
  type VehicleMasterRecord,
  type VehicleMasterType,
} from "@/types";
import {
  FUEL_TYPES,
  TRADE_MARKS,
  TRUCK_TYPES,
  VEHICLE_MASTER_GROUPS,
} from "@/mock-data/vehicleMaster";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { dateCell, draftImportConfig, pick } from "./importExportService";

export const vehicleCrud = makeCrud<VehicleMasterRecord>({
  entityType: "Vehicle",
  repo: vehicleMasterRepository,
  labelOf: (v) => v.plateNumber,
  // SR-VEH-14: trips, driver assignments, costs and other heads' mappings will register here.
  references: () => null,
});

/** Vehicle Group options of the Vehicle master (TRUCK field and head mapping rows). */
export const VEHICLE_GROUP_OPTIONS: readonly string[] = VEHICLE_MASTER_GROUPS;

export type VehicleDraft = Omit<
  VehicleMasterRecord,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "deleted"
>;

export const newVehicleDraft = (): VehicleDraft => ({
  status: "Active",
  vehicleType: "",
  vehicleGroup: "",
  truckType: "",
  trailerType: "",
  plateNumber: "",
  chassisNumber: "",
  engineNumber: "",
  productionYear: "",
  fuelRate: "",
  fuelCapacity: "",
  registrationExpiry: "",
  inspectionNo: "",
  inspectionExpiry: "",
  lifetimeLimit: "",
  policyNumber: "",
  tradeMark: "",
  modelCode: "",
  buyingDate: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  authorizedPayload: "",
  rfidTag: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  contractNumber: "",
  inspectionReportNo: "",
  liabilityInsuranceNumber: "",
  fuelType: "",
  engineDisplacement: "",
  authorizedTowedMass: "",
  productionCountry: "",
  // The four toggles start On.
  renovated: true,
  transportationBusiness: true,
  tachograph: true,
  telematics: true,
  containerMappings: [],
});

export const blankMapping = (): ContainerSizeMapping => ({
  rid: uid("m-"),
  trailerType: "",
  vehicleGroup: "",
});

/* ------------------------------------------------------------------ field matrix (SR-VEH-02) */

/** Fields shown only for some vehicle types; everything else applies to every type. */
const ONLY_FOR: Partial<Record<keyof VehicleDraft, readonly VehicleMasterType[]>> = {
  vehicleGroup: ["TRUCK"],
  truckType: ["TRUCK"],
  trailerType: ["TRAILER"],
  engineNumber: ["TRUCK", "HEAD"],
  fuelRate: ["TRUCK", "HEAD"],
  fuelCapacity: ["TRUCK", "HEAD"],
  fuelType: ["TRUCK", "HEAD"],
  engineDisplacement: ["TRUCK", "HEAD"],
  authorizedTowedMass: ["HEAD"],
  containerMappings: ["HEAD"],
};

/** Whether `field` is shown for `type` (with no type chosen yet, type-specific fields stay hidden). */
export const showsField = (type: VehicleMasterType | "", field: keyof VehicleDraft) => {
  const only = ONLY_FOR[field];
  return !only || (!!type && only.includes(type));
};

const FIELD_LABEL: Partial<Record<keyof VehicleDraft, string>> = {
  vehicleGroup: "Vehicle Group",
  truckType: "Truck Type",
  trailerType: "Trailer Type",
  engineNumber: "Engine Number",
  fuelRate: "Fuel Rate",
  fuelCapacity: "Fuel Capacity",
  fuelType: "Fuel Type",
  engineDisplacement: "Engine Displacement",
  authorizedTowedMass: "Authorized Towed Mass",
  containerMappings: "Container Size Mapping",
};

const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "");

/** Labels of the filled fields that a switch to `nextType` would hide (and clear on save). */
export function fieldsLostOnTypeChange(
  d: VehicleDraft,
  nextType: VehicleMasterType | "",
): string[] {
  return (Object.keys(ONLY_FOR) as (keyof VehicleDraft)[])
    .filter((k) => showsField(d.vehicleType, k) && !showsField(nextType, k) && hasValue(d[k]))
    .map((k) => FIELD_LABEL[k] ?? k);
}

/** SR-VEH-02: values of fields hidden for the draft's type are cleared when saving. */
function clearHidden(d: VehicleDraft): VehicleDraft {
  const out = { ...d } as Record<string, unknown>;
  const blank = newVehicleDraft() as unknown as Record<string, unknown>;
  for (const k of Object.keys(ONLY_FOR) as (keyof VehicleDraft)[])
    if (!showsField(d.vehicleType, k)) out[k] = blank[k];
  return out as unknown as VehicleDraft;
}

/* ------------------------------------------------------------------ legacy data */

const LEGACY_TYPES: Record<string, VehicleMasterType> = {
  TRUCK: "TRUCK",
  HEAD: "HEAD",
  TRACTOR: "HEAD",
  TRAILER: "TRAILER",
  "5T": "TRUCK",
  VAN: "TRUCK",
};

/** Maps any stored type (Truck / Tractor / Trailer, old 5T / VAN codes included) to TRUCK / HEAD / TRAILER. */
export function normalizeVehicleType(v: unknown): VehicleMasterType | "" {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!s) return "";
  return LEGACY_TYPES[s] ?? "TRUCK";
}

/** Upgrades a record stored by an older version: type codes, group catalog, new fields. */
export function normalizeVehicle(r: VehicleMasterRecord): VehicleMasterRecord {
  const raw = r as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const vehicleType = normalizeVehicleType(raw["vehicleType"]);
  const group = str("vehicleGroup");
  const trailer = str("trailerType");
  const mappings = Array.isArray(raw["containerMappings"])
    ? (raw["containerMappings"] as ContainerSizeMapping[])
    : [];
  const { ownership: _o, ownerId: _oi, insuranceExpiry: _ie, badgeExpiry: _be, ...rest } = raw;
  return {
    ...newVehicleDraft(),
    ...(rest as Partial<VehicleMasterRecord>),
    vehicleType,
    vehicleGroup: VEHICLE_GROUP_OPTIONS.includes(group) ? group : "",
    truckType: str("truckType"),
    trailerType: (TRAILER_TYPES as readonly string[]).includes(trailer)
      ? (trailer as TrailerType)
      : "",
    registrationExpiry: str("registrationExpiry"),
    authorizedTowedMass: str("authorizedTowedMass"),
    containerMappings: mappings,
  } as VehicleMasterRecord;
}

/** Non-deleted vehicles, normalized. */
export const listVehicles = (all = vehicleMasterRepository.all()): VehicleMasterRecord[] =>
  all.filter((r) => !r.deleted).map(normalizeVehicle);

/** Copies only the editable fields (the draft's keys) from a stored record. */
export const draftOfVehicle = (r: VehicleMasterRecord): VehicleDraft => {
  const blank = newVehicleDraft();
  const rec = normalizeVehicle(r) as unknown as Record<string, unknown>;
  return structuredClone(
    Object.fromEntries(Object.entries(blank).map(([k, fallback]) => [k, rec[k] ?? fallback])),
  ) as unknown as VehicleDraft;
};

/* ------------------------------------------------------------------ max distance */

/**
 * SR-VEH-08: Max Distance (km) = Fuel Capacity (l) ÷ Fuel Rate (l/100km) × 100, rounded down.
 * Empty until both are set (> 0).
 */
export function maxDistanceKm(fuelRate: string, fuelCapacity: string): string {
  const rate = Number(fuelRate),
    cap = Number(fuelCapacity);
  if (!(rate > 0) || !(cap > 0)) return "";
  return String(Math.floor((cap / rate) * 100));
}

/* ------------------------------------------------------------------ expiry */

export type ExpiryState = "expired" | "soon" | "ok" | "none";
/** `soon` = within `warnDays` days. Dates are YYYY-MM-DD. */
export function expiryState(ymd: string, now = new Date(), warnDays = 30): ExpiryState {
  if (!ymd) return "none";
  const end = new Date(`${ymd}T23:59:59`);
  if (Number.isNaN(end.getTime())) return "none";
  if (end < now) return "expired";
  return end.getTime() - now.getTime() <= warnDays * 86_400_000 ? "soon" : "ok";
}

/** Whole days left until the end of `ymd` (negative once expired). */
export const daysUntil = (ymd: string, now = new Date()) =>
  Math.ceil((new Date(`${ymd}T23:59:59`).getTime() - now.getTime()) / 86_400_000) - 1;

/** localStorage key of the expiry alert threshold (days). */
export const VEHICLE_ALERT_DAYS_KEY = "vehicle-alert-days";
export const DEFAULT_ALERT_DAYS = 30;
const clampDays = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 ? Math.min(v, 365) : DEFAULT_ALERT_DAYS;
};
export const getAlertDays = () =>
  clampDays(readJson<number>(VEHICLE_ALERT_DAYS_KEY, DEFAULT_ALERT_DAYS));
export const setAlertDays = (days: number) => writeJson(VEHICLE_ALERT_DAYS_KEY, clampDays(days));

export type VehicleDocKind = "Registration" | "Inspection";
export const VEHICLE_DOCS: {
  kind: VehicleDocKind;
  field: keyof VehicleMasterRecord;
  label: string;
}[] = [
  { kind: "Registration", field: "registrationExpiry", label: "Registration" },
  { kind: "Inspection", field: "inspectionExpiry", label: "Inspection" },
];

export interface VehicleExpiryAlert {
  vehicle: VehicleMasterRecord;
  kind: VehicleDocKind;
  label: string;
  date: string;
  state: "expired" | "soon";
  daysLeft: number;
}

/** Documents of active, non-deleted vehicles that are expired or expire within `days`. Most urgent first. */
export function vehicleExpiryAlerts(
  vehicles: VehicleMasterRecord[],
  days = getAlertDays(),
  now = new Date(),
): VehicleExpiryAlert[] {
  const out: VehicleExpiryAlert[] = [];
  for (const raw of vehicles) {
    if (raw.deleted || raw.status !== "Active") continue;
    const v = normalizeVehicle(raw);
    for (const d of VEHICLE_DOCS) {
      const date = String(v[d.field] ?? "");
      const state = expiryState(date, now, days);
      if (state === "expired" || state === "soon")
        out.push({
          vehicle: v,
          kind: d.kind,
          label: d.label,
          date,
          state,
          daysLeft: daysUntil(date, now),
        });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ validation */

const norm = (v: string) => v.trim().toUpperCase();
/** SR-VEH-04: Vietnamese plate, e.g. 51C-123.45, 30A-12345, 29LD-123.45. */
export const PLATE = /^\d{2}[A-Z]{1,2}\d?-(\d{3}\.\d{2}|\d{4,5})$/;
const VIN = /^[A-Z0-9]+$/;
const CODE = /^[A-Za-z0-9-]+$/;

/** SR-VEH-03: always required (Truck Type is added for TRUCK — SR-VEH-22). */
export const REQUIRED_FIELDS = [
  "vehicleType",
  "plateNumber",
  "chassisNumber",
  "inspectionReportNo",
] as const;
/** Fields that live in the folded Specifications panel (it unfolds when one of them has an error). */
export const SPEC_FIELDS = [
  "modelCode",
  "kerbMass",
  "authorizedPayload",
  "acquisitionCost",
  "inspectionReportNo",
  "engineDisplacement",
  "authorizedTowedMass",
];

export function validateVehicle(d: VehicleDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const others = vehicleMasterRepository.all().filter((x) => !x.deleted && x.id !== id);
  const req = (k: string, label: string) => (e[k] = tr(`Nhập ${label}.`, `${label} is required.`));

  if (!d.vehicleType) req("vehicleType", "Vehicle Type");
  const plate = norm(d.plateNumber);
  if (!plate) req("plateNumber", "Plate Number");
  else if (!PLATE.test(plate))
    e["plateNumber"] = tr(
      "Biển số không đúng mẫu (VD: 51C-123.45, 30A-12345, 29LD-123.45).",
      "Plate number format is invalid (e.g. 51C-123.45, 30A-12345, 29LD-123.45).",
    );
  else if (others.some((x) => norm(x.plateNumber) === plate))
    e["plateNumber"] = tr(`Biển số ${plate} đã tồn tại.`, `Plate number ${plate} already exists.`);

  const vin = norm(d.chassisNumber);
  if (!vin) req("chassisNumber", "Chassis Number (VIN)");
  else if (!VIN.test(vin))
    e["chassisNumber"] = tr(
      "Số khung chỉ gồm chữ và số.",
      "Chassis number may only contain letters and digits.",
    );
  else if (others.some((x) => norm(x.chassisNumber ?? "") === vin))
    e["chassisNumber"] = tr(`Số khung ${vin} đã tồn tại.`, `Chassis number ${vin} already exists.`);

  if (!d.inspectionReportNo.trim()) req("inspectionReportNo", "Inspection Report No");
  for (const [k, label] of [
    ["inspectionReportNo", "Inspection Report No"],
    ["inspectionNo", "Vehicle Inspection No"],
    ["modelCode", "Model Code"],
  ] as const)
    if (d[k].trim() && !e[k] && !CODE.test(d[k].trim()))
      e[k] = tr(
        `${label} chỉ gồm chữ, số và gạch nối.`,
        `${label} may only contain letters, digits and hyphens.`,
      );

  // SR-VEH-22: Truck Type is required for a truck.
  if (d.vehicleType === "TRUCK" && !d.truckType) req("truckType", "Truck Type");

  if (d.productionYear) {
    const y = Number(d.productionYear);
    if (!/^\d{4}$/.test(d.productionYear) || y < 1900 || y > 2100)
      e["productionYear"] = tr(
        "Năm sản xuất gồm 4 chữ số, từ 1900 đến 2100.",
        "Production year must be 4 digits between 1900 and 2100.",
      );
  }
  for (const k of [
    "fuelRate",
    "fuelCapacity",
    "kerbMass",
    "authorizedPayload",
    "engineDisplacement",
    "authorizedTowedMass",
  ] as const)
    if (showsField(d.vehicleType, k) && d[k] && !(Number(d[k]) > 0))
      e[k] = tr("Giá trị phải lớn hơn 0.", "Value must be greater than 0.");

  // SR-VEH-15 / 16: each mapping row needs Trailer Type + Vehicle Group; one row per Trailer Type.
  if (d.vehicleType === "HEAD") {
    const seen = new Set<string>();
    for (const [i, m] of d.containerMappings.entries()) {
      if (!m.trailerType || !m.vehicleGroup) {
        e["containerMappings"] = tr(
          `Dòng ${i + 1}: chọn đủ Trailer Type và Vehicle Group.`,
          `Row ${i + 1}: Trailer Type and Vehicle Group are required.`,
        );
        break;
      }
      if (seen.has(m.trailerType)) {
        e["containerMappings"] = tr(
          `Dòng ${i + 1}: Trailer Type ${m.trailerType} đã được khai ở dòng khác.`,
          `Row ${i + 1}: Trailer Type ${m.trailerType} is already mapped in another row.`,
        );
        break;
      }
      seen.add(m.trailerType);
    }
  }
  return e;
}

const LABELS: [keyof VehicleDraft, string][] = [
  ["vehicleType", "Vehicle Type"],
  ["vehicleGroup", "Vehicle Group"],
  ["truckType", "Truck Type"],
  ["trailerType", "Trailer Type"],
  ["plateNumber", "Plate Number"],
  ["chassisNumber", "Chassis Number (VIN)"],
  ["engineNumber", "Engine Number"],
  ["productionYear", "Production Year"],
  ["fuelRate", "Fuel Rate"],
  ["fuelCapacity", "Fuel Capacity"],
  ["registrationExpiry", "Registration Expiration Date"],
  ["inspectionNo", "Vehicle Inspection No"],
  ["inspectionExpiry", "Inspection Expiration Date"],
  ["lifetimeLimit", "Lifetime Limit"],
  ["policyNumber", "Comprehensive Policy Number"],
  ["tradeMark", "Trade Mark"],
  ["modelCode", "Model Code"],
  ["buyingDate", "Buying Date"],
  ["overallDimension", "Overall Dimension"],
  ["containerDimension", "Cargo / Container Dimensions"],
  ["kerbMass", "Kerb Mass"],
  ["authorizedPayload", "Authorized Payload"],
  ["rfidTag", "RFID / Barcode Tag"],
  ["acquisitionCost", "Acquisition Cost"],
  ["acquisitionCurrency", "Acquisition Currency"],
  ["contractNumber", "Contract Number"],
  ["inspectionReportNo", "Inspection Report No"],
  ["liabilityInsuranceNumber", "Liability Insurance Number"],
  ["fuelType", "Fuel Type"],
  ["engineDisplacement", "Engine Displacement"],
  ["authorizedTowedMass", "Authorized Towed Mass"],
  ["productionCountry", "Production Country"],
  ["renovated", "Modification"],
  ["transportationBusiness", "Transportation Business"],
  ["tachograph", "Equipped with Tachograph"],
  ["telematics", "Telematics"],
];

const mappingText = (ms: ContainerSizeMapping[]) =>
  ms.map((m) => `${m.trailerType} → ${m.vehicleGroup}`).join(", ");

export const vehicleService = {
  save(d: VehicleDraft, id?: string): VehicleMasterRecord {
    const errors = validateVehicle(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const clean: VehicleDraft = clearHidden({
      ...d,
      plateNumber: norm(d.plateNumber),
      chassisNumber: norm(d.chassisNumber),
      engineNumber: d.engineNumber.trim(),
      modelCode: d.modelCode.trim(),
      inspectionNo: d.inspectionNo.trim(),
      inspectionReportNo: d.inspectionReportNo.trim(),
    });
    const stored = id ? vehicleMasterRepository.get(id) : undefined;
    if (!stored) {
      const rec: VehicleMasterRecord = { ...clean, id: uid("VH-"), ...stampCreate() };
      vehicleMasterRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Vehicle",
        entityId: rec.id,
        entityLabel: rec.plateNumber,
        note: rec.vehicleType,
      });
      return rec;
    }
    const existing = normalizeVehicle(stored);
    const next = stampUpdate({ ...existing, ...clean });
    vehicleMasterRepository.update(existing.id, () => next);
    const before = draftOfVehicle(existing);
    const base = {
      entityType: "Vehicle" as const,
      entityId: next.id,
      entityLabel: next.plateNumber,
    };
    const out: AuditInput[] = [];
    for (const [k, label] of LABELS)
      if (String(before[k]) !== String(clean[k]))
        out.push({
          ...base,
          action: "UPDATE",
          field: label,
          oldValue: String(before[k]) || "—",
          newValue: String(clean[k]) || "—",
        });
    if (mappingText(before.containerMappings) !== mappingText(clean.containerMappings))
      out.push({
        ...base,
        action: "UPDATE",
        field: "Container Size Mapping",
        oldValue: mappingText(before.containerMappings) || "—",
        newValue: mappingText(clean.containerMappings) || "—",
      });
    auditService.logMany(out);
    return next;
  },
};

/* ------------------------------------------------------------------ import */

const STATUSES = ["Active", "Inactive"] as const;
const DATE_FIELDS = ["registrationExpiry", "inspectionExpiry", "buyingDate"] as const;

const vehicleDraftOfRow = (r: Record<string, string>): VehicleDraft => ({
  ...newVehicleDraft(),
  plateNumber: r["plateNumber"] ?? "",
  vehicleType: pick(r["vehicleType"], VEHICLE_MASTER_TYPES) || "",
  vehicleGroup: pick(r["vehicleGroup"], VEHICLE_GROUP_OPTIONS) || "",
  truckType: pick(r["truckType"], TRUCK_TYPES) || "",
  trailerType: pick(r["trailerType"], TRAILER_TYPES) || "",
  chassisNumber: r["chassisNumber"] ?? "",
  engineNumber: r["engineNumber"] ?? "",
  productionYear: r["productionYear"] ?? "",
  fuelRate: r["fuelRate"] ?? "",
  fuelCapacity: r["fuelCapacity"] ?? "",
  registrationExpiry: dateCell(r["registrationExpiry"]),
  inspectionNo: r["inspectionNo"] ?? "",
  inspectionExpiry: dateCell(r["inspectionExpiry"]),
  inspectionReportNo: r["inspectionReportNo"] ?? "",
  tradeMark: pick(r["tradeMark"], TRADE_MARKS) || (r["tradeMark"] ?? ""),
  modelCode: r["modelCode"] ?? "",
  fuelType: pick(r["fuelType"], FUEL_TYPES) || (r["fuelType"] ?? ""),
  authorizedPayload: (r["authorizedPayload"] ?? "").replace(/[\s,]/g, ""),
  buyingDate: dateCell(r["buyingDate"]),
  status: pick(r["status"], STATUSES) || "Active",
});

/** Headers accept the template name plus the list's labels (export → import). Mapping rows are added on the form. */
export const vehicleImportConfig = draftImportConfig<VehicleDraft>({
  entityType: "Vehicle",
  screen: "vehicle-master",
  keyColumn: "plateNumber",
  columns: [
    {
      key: "plateNumber",
      header: "Plate Number",
      required: true,
      example: "51C-123.45",
      aliases: ["Plate No.", "Biển số"],
    },
    {
      key: "vehicleType",
      header: "Vehicle Type",
      required: true,
      example: "TRUCK",
      aliases: ["Type", "Loại xe"],
    },
    { key: "vehicleGroup", header: "Vehicle Group", example: "Group 01", aliases: ["Group"] },
    { key: "truckType", header: "Truck Type", example: "5 tấn" },
    { key: "trailerType", header: "Trailer Type", example: "" },
    {
      key: "chassisNumber",
      header: "Chassis Number (VIN)",
      required: true,
      example: "RLHPC1234M5678901",
      aliases: ["VIN", "Số khung"],
    },
    {
      key: "engineNumber",
      header: "Engine Number",
      example: "",
      aliases: ["Engine No.", "Số máy"],
    },
    { key: "productionYear", header: "Production Year", example: "2022" },
    { key: "fuelRate", header: "Fuel Rate (l/100km)", example: "22", aliases: ["Fuel Rate"] },
    {
      key: "fuelCapacity",
      header: "Fuel Capacity (l)",
      example: "200",
      aliases: ["Fuel Capacity"],
    },
    {
      key: "registrationExpiry",
      header: "Registration Expiration Date",
      example: "2027-06-30",
      aliases: ["Registration Expiry"],
    },
    { key: "inspectionNo", header: "Vehicle Inspection No", example: "" },
    {
      key: "inspectionExpiry",
      header: "Inspection Expiration Date",
      example: "2027-03-01",
      aliases: ["Inspection Expiry", "Hạn đăng kiểm"],
    },
    {
      key: "inspectionReportNo",
      header: "Inspection Report No",
      required: true,
      example: "KD-2024-000789",
    },
    { key: "tradeMark", header: "Trade Mark", example: "HINO" },
    { key: "modelCode", header: "Model Code", example: "", aliases: ["Model"] },
    { key: "fuelType", header: "Fuel Type", example: "Diesel" },
    { key: "authorizedPayload", header: "Authorized Payload (kg)", example: "5000" },
    { key: "buyingDate", header: "Buying Date", example: "" },
    { key: "status", header: "Status", example: "Active", aliases: ["Trạng thái"] },
  ],
  existingKeys: () =>
    new Set(
      vehicleMasterRepository
        .all()
        .filter((v) => !v.deleted)
        .map((v) => norm(v.plateNumber).toLowerCase()),
    ),
  parseCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    if (!pick(r["vehicleType"], VEHICLE_MASTER_TYPES))
      e.push({ field: "vehicleType", error: `Use one of: ${VEHICLE_MASTER_TYPES.join(", ")}` });
    if (pick(r["vehicleGroup"], VEHICLE_GROUP_OPTIONS) === undefined)
      e.push({ field: "vehicleGroup", error: `Use one of: ${VEHICLE_GROUP_OPTIONS.join(", ")}` });
    if (pick(r["truckType"], TRUCK_TYPES) === undefined)
      e.push({ field: "truckType", error: `Use one of: ${TRUCK_TYPES.join(", ")}` });
    if (pick(r["trailerType"], TRAILER_TYPES) === undefined)
      e.push({ field: "trailerType", error: `Use one of: ${TRAILER_TYPES.join(", ")}` });
    if (pick(r["status"], STATUSES) === undefined)
      e.push({ field: "status", error: "Active or Inactive (empty = Active)" });
    for (const k of DATE_FIELDS)
      if (r[k] && !dateCell(r[k]))
        e.push({ field: k, error: "Date must be YYYY-MM-DD or DD/MM/YYYY" });
    return e;
  },
  toDraft: vehicleDraftOfRow,
  validate: (d) => validateVehicle(d),
  save: (d) => vehicleService.save(d),
  rollback: (ids) => vehicleCrud.removeMany(ids),
  sampleRows: () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const type = (["TRUCK", "HEAD", "TRAILER"] as const)[i % 3]!;
      const n = String(i + 10);
      return [
        `99C-${String(500 + i).padStart(3, "0")}.${n}`,
        type,
        type === "TRUCK" ? "Group 01" : "",
        type === "TRUCK" ? "5 tấn" : "",
        type === "TRAILER" ? (i % 2 ? "20 ft" : "40 ft") : "",
        `RLHIMP${String(100000 + i)}${n}`,
        type === "TRAILER" ? "" : `ENG${n}`,
        String(2018 + (i % 6)),
        type === "TRAILER" ? "" : "22",
        type === "TRAILER" ? "" : "300",
        `2027-${String((i % 12) + 1).padStart(2, "0")}-15`,
        "",
        "2027-01-31",
        `KD-2026-${String(1000 + i)}`,
        type === "TRUCK" ? "HINO" : "HYUNDAI",
        "",
        type === "TRAILER" ? "" : "Diesel",
        type === "TRUCK" ? "5000" : "",
        "",
        i % 7 === 6 ? "Inactive" : "Active",
      ];
    });
    rows[3]![0] = rows[0]![0]!; // duplicate plate
    rows[8]![1] = "Bus"; // unknown type
    rows[12]![3] = ""; // TRUCK without Truck Type
    return rows;
  },
});
