// Vehicle master: list/detail CRUD, validation, owner lookup, document expiry alerts and the
// derived "Max Distance".
import { businessPartnerRepository, uid, vehicleMasterRepository } from "@/repositories";
import { readJson, writeJson } from "@/repositories/storage";
import {
  VEHICLE_GROUPS,
  VEHICLE_MASTER_TYPES,
  VEHICLE_OWNERSHIPS,
  type BusinessPartnerRecord,
  type VehicleMasterRecord,
  type VehicleMasterType,
  type VehicleOwnership,
} from "@/types";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { dateCell, draftImportConfig, pick } from "./importExportService";

export const vehicleCrud = makeCrud<VehicleMasterRecord>({
  entityType: "Vehicle",
  repo: vehicleMasterRepository,
  labelOf: (v) => v.plateNumber,
  // Transactions will register here once they reference a vehicle by plate.
  references: () => null,
});

/** Real Vehicle Groups (basis for norms and prices); a legacy "DEFAULT" placeholder is never offered. */
export const VEHICLE_GROUP_OPTIONS: readonly string[] = VEHICLE_GROUPS.filter(
  (g) => String(g).toUpperCase() !== "DEFAULT",
);

export type VehicleDraft = Omit<
  VehicleMasterRecord,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "deleted"
>;

export const newVehicleDraft = (): VehicleDraft => ({
  status: "Active",
  vehicleType: "",
  vehicleGroup: "",
  plateNumber: "",
  ownership: "Own",
  ownerId: "",
  authorizedPayload: "",
  chassisNumber: "",
  engineNumber: "",
  productionYear: "",
  fuelRate: "",
  fuelCapacity: "",
  inspectionExpiry: "",
  inspectionNo: "",
  insuranceExpiry: "",
  badgeExpiry: "",
  lifetimeLimit: "",
  policyNumber: "",
  tradeMark: "",
  modelCode: "",
  buyingDate: "",
  overallDimension: "",
  containerDimension: "",
  kerbMass: "",
  rfidTag: "",
  acquisitionCost: "",
  acquisitionCurrency: "VND",
  contractNumber: "",
  inspectionReportNo: "",
  liabilityInsuranceNumber: "",
  fuelType: "",
  engineDisplacement: "",
  productionCountry: "",
  renovated: false,
  transportationBusiness: false,
  tachograph: false,
  telematics: false,
});

/* ------------------------------------------------------------------ legacy data */

const LEGACY_TYPES: Record<string, VehicleMasterType> = {
  HEAD: "Tractor",
  TRACTOR: "Tractor",
  TRAILER: "Trailer",
  TRUCK: "Truck",
  "5T": "Truck",
  VAN: "Truck",
};

/** Maps any stored type (old TRUCK/HEAD/TRAILER/5T/VAN codes included) to Tractor / Trailer / Truck. */
export function normalizeVehicleType(v: unknown): VehicleMasterType | "" {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if ((VEHICLE_MASTER_TYPES as readonly string[]).includes(s)) return s as VehicleMasterType;
  return LEGACY_TYPES[s.toUpperCase()] ?? "Truck";
}

/**
 * Upgrades a record stored by an older version of the app: legacy type codes, the fake "DEFAULT"
 * group, missing ownership / insurance / badge fields, and the old separate "registration expiry"
 * (folded into the registration (inspection) expiry when that one is empty).
 */
export function normalizeVehicle(r: VehicleMasterRecord): VehicleMasterRecord {
  const raw = r as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const vehicleType = normalizeVehicleType(raw["vehicleType"]);
  const group = str("vehicleGroup");
  const vehicleGroup = VEHICLE_GROUP_OPTIONS.includes(group) ? group : "";
  const ownership: VehicleOwnership = raw["ownership"] === "Outsourced" ? "Outsourced" : "Own";
  const inspectionExpiry = str("inspectionExpiry") || str("registrationExpiry");
  if (
    vehicleType === raw["vehicleType"] &&
    vehicleGroup === group &&
    ownership === raw["ownership"] &&
    inspectionExpiry === raw["inspectionExpiry"] &&
    typeof raw["ownerId"] === "string" &&
    typeof raw["insuranceExpiry"] === "string" &&
    typeof raw["badgeExpiry"] === "string" &&
    typeof raw["authorizedPayload"] === "string" &&
    !("registrationExpiry" in raw)
  )
    return r;
  const { registrationExpiry: _legacy, ...rest } = raw;
  void _legacy;
  return {
    ...newVehicleDraft(),
    ...(rest as Partial<VehicleMasterRecord>),
    vehicleType,
    vehicleGroup,
    ownership,
    ownerId: ownership === "Outsourced" ? str("ownerId") : "",
    inspectionExpiry,
    insuranceExpiry: str("insuranceExpiry"),
    badgeExpiry: str("badgeExpiry"),
    authorizedPayload: str("authorizedPayload"),
  } as VehicleMasterRecord;
}

/** Non-deleted vehicles, normalized. */
export const listVehicles = (all = vehicleMasterRepository.all()): VehicleMasterRecord[] =>
  all.filter((r) => !r.deleted).map(normalizeVehicle);

/** Copies only the editable fields (the draft's keys) from a stored record. */
export const draftOfVehicle = (r: VehicleMasterRecord): VehicleDraft => {
  const blank = newVehicleDraft();
  const rec = normalizeVehicle(r) as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(blank).map(([k, fallback]) => [k, rec[k] ?? fallback]),
  ) as unknown as VehicleDraft;
};

/* ------------------------------------------------------------------ owners */

const bpName = (b: BusinessPartnerRecord) => b.englishName || b.localName || b.bpCode;
/** "BPCODE · Name" */
export const bpOwnerLabel = (b: BusinessPartnerRecord) => `${b.bpCode} · ${bpName(b)}`;

/**
 * Business Partners that can own an outsourced vehicle: active partners with the Vendor role,
 * plus `keepId` (the current owner) so editing an existing record never loses its value.
 */
export function ownerCandidates(
  bps: BusinessPartnerRecord[],
  keepId = "",
): BusinessPartnerRecord[] {
  return bps
    .filter(
      (b) =>
        !b.deleted &&
        (b.id === keepId || (b.status === "Active" && (b.roles ?? []).includes("Vendor"))),
    )
    .sort((a, b) => a.bpCode.localeCompare(b.bpCode));
}

/** "Own" for the own fleet, otherwise the owner's "BPCODE · Name" (or its id if the partner is gone). */
export function ownerLabel(
  v: Pick<VehicleMasterRecord, "ownership" | "ownerId">,
  bps: BusinessPartnerRecord[],
): string {
  if (v.ownership !== "Outsourced") return "Own";
  const bp = bps.find((b) => b.id === v.ownerId);
  return bp ? bpOwnerLabel(bp) : v.ownerId || "Outsourced";
}

/* ------------------------------------------------------------------ expiry */

/** Max Distance (km) = Fuel Capacity (l) ÷ Fuel Rate (l/100km) × 100. Empty until both are set. */
export function maxDistanceKm(fuelRate: string, fuelCapacity: string): string {
  const rate = Number(fuelRate),
    cap = Number(fuelCapacity);
  if (!(rate > 0) || !(cap > 0)) return "";
  return String(Math.round((cap / rate) * 100));
}

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

export type VehicleDocKind = "Registration" | "Insurance" | "Badge";
export const VEHICLE_DOCS: {
  kind: VehicleDocKind;
  field: keyof VehicleMasterRecord;
  label: string;
}[] = [
  { kind: "Registration", field: "inspectionExpiry", label: "Registration (inspection)" },
  { kind: "Insurance", field: "insuranceExpiry", label: "Insurance" },
  { kind: "Badge", field: "badgeExpiry", label: "Badge" },
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
const PLATE = /^[A-Z0-9][A-Z0-9.\- ]{2,14}$/;
const VIN = /^[A-Z0-9]{11,17}$/;
/** Capacity is mandatory for vehicles that carry / pull the load themselves. */
export const capacityRequired = (t: string) => t === "Truck" || t === "Tractor";

export function validateVehicle(d: VehicleDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const dup = (field: "plateNumber" | "chassisNumber", value: string) =>
    vehicleMasterRepository
      .all()
      .some((x) => !x.deleted && x.id !== id && norm(x[field] ?? "") === value);
  if (!d.vehicleType) e["vehicleType"] = tr("Chọn loại xe.", "Vehicle type is required.");
  if (!d.vehicleGroup) e["vehicleGroup"] = tr("Chọn nhóm xe.", "Vehicle group is required.");
  else if (!VEHICLE_GROUP_OPTIONS.includes(d.vehicleGroup))
    e["vehicleGroup"] = tr("Nhóm xe không hợp lệ.", "Unknown vehicle group.");
  const plate = norm(d.plateNumber);
  if (!plate) e["plateNumber"] = tr("Nhập biển số.", "Plate number is required.");
  else if (!PLATE.test(plate))
    e["plateNumber"] = tr(
      "Biển số chỉ gồm chữ, số, dấu chấm, gạch ngang (VD: 51D-123.45).",
      "Plate number may only contain letters, digits, dot, hyphen (e.g. 51D-123.45).",
    );
  else if (dup("plateNumber", plate))
    e["plateNumber"] = tr(`Biển số ${plate} đã tồn tại.`, `Plate number ${plate} already exists.`);
  if (d.ownership === "Outsourced") {
    if (!d.ownerId) e["ownerId"] = tr("Chọn chủ xe (đối tác).", "Owner is required.");
    else if (!businessPartnerRepository.all().some((b) => b.id === d.ownerId && !b.deleted))
      e["ownerId"] = tr("Đối tác không tồn tại.", "Owner business partner not found.");
  }
  if (capacityRequired(d.vehicleType) && !(Number(d.authorizedPayload) > 0))
    e["authorizedPayload"] = tr("Nhập tải trọng (kg).", "Capacity (kg) is required.");
  const vin = norm(d.chassisNumber);
  if (vin) {
    if (!VIN.test(vin))
      e["chassisNumber"] = tr(
        "Số khung gồm 11–17 chữ/số, không dấu cách.",
        "Chassis number is 11–17 letters/digits, no spaces.",
      );
    else if (dup("chassisNumber", vin))
      e["chassisNumber"] = tr(
        `Số khung ${vin} đã tồn tại.`,
        `Chassis number ${vin} already exists.`,
      );
  }
  if (d.productionYear && !/^(19|20)\d{2}$/.test(d.productionYear))
    e["productionYear"] = tr("Năm sản xuất gồm 4 chữ số.", "Production year must be 4 digits.");
  for (const k of [
    "fuelRate",
    "fuelCapacity",
    "kerbMass",
    "authorizedPayload",
    "engineDisplacement",
    "acquisitionCost",
  ] as const)
    if (d[k] && !e[k] && !(Number(d[k]) >= 0)) e[k] = tr("Giá trị phải ≥ 0.", "Value must be ≥ 0.");
  return e;
}

const LABELS: [keyof VehicleDraft, string][] = [
  ["vehicleType", "Vehicle Type"],
  ["vehicleGroup", "Vehicle Group"],
  ["plateNumber", "Plate Number"],
  ["ownership", "Ownership"],
  ["ownerId", "Owner"],
  ["authorizedPayload", "Capacity (kg)"],
  ["chassisNumber", "Chassis Number (VIN)"],
  ["engineNumber", "Engine Number"],
  ["productionYear", "Production Year"],
  ["fuelRate", "Fuel Rate"],
  ["fuelCapacity", "Fuel Capacity"],
  ["inspectionExpiry", "Registration (Inspection) Expiry"],
  ["inspectionNo", "Vehicle Inspection No"],
  ["insuranceExpiry", "Insurance Expiry"],
  ["badgeExpiry", "Badge Expiry"],
  ["lifetimeLimit", "Lifetime Limit"],
  ["policyNumber", "Comprehensive Policy Number"],
  ["tradeMark", "Trade Mark"],
  ["modelCode", "Model Code"],
  ["buyingDate", "Buying Date"],
  ["overallDimension", "Overall Dimension"],
  ["containerDimension", "Cargo Container Dimensions"],
  ["kerbMass", "Kerb Mass"],
  ["rfidTag", "RFID / Barcode Tag"],
  ["acquisitionCost", "Acquisition Cost"],
  ["acquisitionCurrency", "Acquisition Currency"],
  ["contractNumber", "Contract Number"],
  ["inspectionReportNo", "Inspection Report No"],
  ["liabilityInsuranceNumber", "Liability Insurance Number"],
  ["fuelType", "Fuel Type"],
  ["engineDisplacement", "Engine Displacement"],
  ["productionCountry", "Production Country"],
  ["renovated", "Modification (Renovated)"],
  ["transportationBusiness", "Transportation Business"],
  ["tachograph", "Equipped With Tachograph"],
  ["telematics", "Telematics"],
];

export const vehicleService = {
  save(d: VehicleDraft, id?: string): VehicleMasterRecord {
    const errors = validateVehicle(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    const clean: VehicleDraft = {
      ...d,
      plateNumber: norm(d.plateNumber),
      ownerId: d.ownership === "Outsourced" ? d.ownerId : "",
      chassisNumber: norm(d.chassisNumber),
      engineNumber: d.engineNumber.trim(),
      modelCode: d.modelCode.trim(),
      inspectionReportNo: d.inspectionReportNo.trim(),
    };
    const stored = id ? vehicleMasterRepository.get(id) : undefined;
    if (!stored) {
      const rec: VehicleMasterRecord = { ...clean, id: uid("VH-"), ...stampCreate() };
      vehicleMasterRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Vehicle",
        entityId: rec.id,
        entityLabel: rec.plateNumber,
      });
      return rec;
    }
    // Normalizing first also drops legacy fields (e.g. the old separate registration expiry).
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
    if (before.status !== clean.status)
      out.push({
        ...base,
        action: clean.status === "Active" ? "ACTIVATE" : "DEACTIVATE",
        field: "Status",
        oldValue: before.status,
        newValue: clean.status,
      });
    auditService.logMany(out);
    return next;
  },
};

/* ------------------------------------------------------------------ import */

const STATUSES = ["Active", "Inactive"] as const;
const DATE_FIELDS = ["inspectionExpiry", "insuranceExpiry", "badgeExpiry", "buyingDate"] as const;

/** Outsourced owner by BP Code (or "BPCODE · Name" as exported from the list). */
const ownerIdOf = (v: string | undefined) => {
  const code = (v ?? "").split("·")[0]!.trim().toUpperCase();
  if (!code || code === "OWN") return "";
  return (
    businessPartnerRepository.all().find((b) => !b.deleted && b.bpCode.toUpperCase() === code)
      ?.id ?? ""
  );
};

const vehicleDraftOfRow = (r: Record<string, string>): VehicleDraft => {
  const ownerCell = (r["owner"] ?? "").trim();
  const ownership: VehicleOwnership =
    pick(r["ownership"], VEHICLE_OWNERSHIPS) ||
    (ownerCell && ownerCell.toLowerCase() !== "own" ? "Outsourced" : "Own");
  return {
    ...newVehicleDraft(),
    plateNumber: r["plateNumber"] ?? "",
    vehicleType: pick(r["vehicleType"], VEHICLE_MASTER_TYPES) || "",
    vehicleGroup: pick(r["vehicleGroup"], VEHICLE_GROUP_OPTIONS) || (r["vehicleGroup"] ?? ""),
    ownership,
    ownerId: ownership === "Outsourced" ? ownerIdOf(ownerCell) : "",
    authorizedPayload: (r["authorizedPayload"] ?? "").replace(/[\s,]/g, ""),
    chassisNumber: r["chassisNumber"] ?? "",
    engineNumber: r["engineNumber"] ?? "",
    productionYear: r["productionYear"] ?? "",
    productionCountry: r["productionCountry"] ?? "",
    fuelType: r["fuelType"] ?? "",
    fuelRate: r["fuelRate"] ?? "",
    fuelCapacity: r["fuelCapacity"] ?? "",
    inspectionExpiry: dateCell(r["inspectionExpiry"]),
    insuranceExpiry: dateCell(r["insuranceExpiry"]),
    badgeExpiry: dateCell(r["badgeExpiry"]),
    buyingDate: dateCell(r["buyingDate"]),
    tradeMark: r["tradeMark"] ?? "",
    modelCode: r["modelCode"] ?? "",
    status: pick(r["status"], STATUSES) || "Active",
  };
};

/** Headers accept the template name plus the list's Vietnamese / English labels (export → import). */
export const vehicleImportConfig = draftImportConfig<VehicleDraft>({
  entityType: "Vehicle",
  screen: "vehicle-master",
  keyColumn: "plateNumber",
  columns: [
    {
      key: "plateNumber",
      header: "Plate Number",
      required: true,
      example: "51D-123.45",
      aliases: ["Plate No.", "Biển số"],
    },
    {
      key: "vehicleType",
      header: "Vehicle Type",
      required: true,
      example: "Truck",
      aliases: ["Type", "Loại xe"],
    },
    {
      key: "vehicleGroup",
      header: "Vehicle Group",
      required: true,
      example: "Medium Truck",
      aliases: ["Group", "Nhóm xe"],
    },
    { key: "ownership", header: "Ownership", example: "Own", aliases: ["Sở hữu"] },
    { key: "owner", header: "Owner BP Code", example: "", aliases: ["Owner", "Chủ xe"] },
    {
      key: "authorizedPayload",
      header: "Capacity (kg)",
      example: "8000",
      aliases: ["Tải trọng (kg)"],
    },
    {
      key: "chassisNumber",
      header: "Chassis Number (VIN)",
      example: "",
      aliases: ["VIN", "Số khung"],
    },
    {
      key: "engineNumber",
      header: "Engine Number",
      example: "",
      aliases: ["Engine No.", "Số máy"],
    },
    { key: "productionYear", header: "Production Year", example: "2022" },
    { key: "productionCountry", header: "Production Country", example: "", aliases: ["Xuất xứ"] },
    { key: "modelCode", header: "Model Code", example: "", aliases: ["Model"] },
    { key: "tradeMark", header: "Trade Mark", example: "Hino" },
    { key: "fuelType", header: "Fuel Type", example: "Diesel" },
    { key: "fuelRate", header: "Fuel Rate (l/100km)", example: "18", aliases: ["Fuel Rate"] },
    {
      key: "fuelCapacity",
      header: "Fuel Capacity (l)",
      example: "200",
      aliases: ["Fuel Capacity"],
    },
    {
      key: "inspectionExpiry",
      header: "Registration Expiry",
      example: "2027-06-30",
      aliases: ["Hạn đăng kiểm"],
    },
    {
      key: "insuranceExpiry",
      header: "Insurance Expiry",
      example: "2027-03-31",
      aliases: ["Hạn bảo hiểm"],
    },
    { key: "badgeExpiry", header: "Badge Expiry", example: "", aliases: ["Hạn phù hiệu"] },
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
    if (!pick(r["vehicleGroup"], VEHICLE_GROUP_OPTIONS))
      e.push({ field: "vehicleGroup", error: `Use one of: ${VEHICLE_GROUP_OPTIONS.join(", ")}` });
    if (pick(r["ownership"], VEHICLE_OWNERSHIPS) === undefined)
      e.push({ field: "ownership", error: "Own or Outsourced (empty = Own)" });
    if (pick(r["status"], STATUSES) === undefined)
      e.push({ field: "status", error: "Active or Inactive (empty = Active)" });
    const owner = (r["owner"] ?? "").trim();
    if (owner && owner.toLowerCase() !== "own" && !ownerIdOf(owner))
      e.push({ field: "owner", error: "No Business Partner with this BP Code" });
    for (const k of DATE_FIELDS)
      if (r[k] && !dateCell(r[k]))
        e.push({ field: k, error: "Date must be YYYY-MM-DD or DD/MM/YYYY" });
    return e;
  },
  toDraft: vehicleDraftOfRow,
  validate: (d) => validateVehicle(d),
  errorColumn: { ownerId: "owner" },
  save: (d) => vehicleService.save(d),
  rollback: (ids) => vehicleCrud.removeMany(ids),
  sampleRows: () => {
    const rows = Array.from({ length: 20 }, (_, i) => {
      const type = (["Truck", "Tractor", "Trailer"] as const)[i % 3]!;
      return [
        `99C-${String(500 + i).padStart(3, "0")}.${String(10 + i)}`,
        type,
        type === "Truck" ? "Medium Truck" : "Tractor / Container Truck",
        "Own",
        "",
        type === "Trailer" ? "" : type === "Truck" ? "8000" : "32000",
        "",
        "",
        String(2018 + (i % 6)),
        "Japan",
        "",
        type === "Truck" ? "Hino" : "Hyundai",
        "Diesel",
        type === "Trailer" ? "" : "22",
        type === "Trailer" ? "" : "300",
        `2027-${String((i % 12) + 1).padStart(2, "0")}-15`,
        "2027-01-31",
        "",
        "",
        i % 7 === 6 ? "Inactive" : "Active",
      ];
    });
    rows[3]![0] = rows[0]![0]!; // duplicate plate
    rows[8]![1] = "Bus"; // unknown type
    rows[12]![5] = ""; // Truck without capacity
    return rows;
  },
});
