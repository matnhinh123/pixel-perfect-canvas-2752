// Vehicle master: list/detail CRUD, validation and the derived "Max Distance".
import { uid, vehicleMasterRepository } from "@/repositories";
import type { VehicleMasterRecord } from "@/types";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";

export const vehicleCrud = makeCrud<VehicleMasterRecord>({
  entityType: "Vehicle",
  repo: vehicleMasterRepository,
  labelOf: (v) => v.plateNumber,
  // Transactions will register here once they reference a vehicle by plate.
  references: () => null,
});

export type VehicleDraft = Omit<
  VehicleMasterRecord,
  "id" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "deleted"
>;

export const newVehicleDraft = (): VehicleDraft => ({
  status: "Active",
  vehicleType: "",
  vehicleGroup: "",
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
  productionCountry: "",
  renovated: false,
  transportationBusiness: false,
  tachograph: false,
  telematics: false,
});

/** Copies only the editable fields (the draft's keys) from a stored record. */
export const draftOfVehicle = (r: VehicleMasterRecord): VehicleDraft => {
  const blank = newVehicleDraft();
  const rec = r as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(blank).map(([k, fallback]) => [k, rec[k] ?? fallback]),
  ) as unknown as VehicleDraft;
};

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

const norm = (v: string) => v.trim().toUpperCase();
const PLATE = /^[A-Z0-9][A-Z0-9.\- ]{2,14}$/;
const VIN = /^[A-Z0-9]{11,17}$/;

export function validateVehicle(d: VehicleDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const dup = (field: "plateNumber" | "chassisNumber", value: string) =>
    vehicleMasterRepository
      .all()
      .some((x) => !x.deleted && x.id !== id && norm(x[field]) === value);
  if (!d.vehicleType) e["vehicleType"] = tr("Chọn loại xe.", "Vehicle type is required.");
  const plate = norm(d.plateNumber);
  if (!plate) e["plateNumber"] = tr("Nhập biển số.", "Plate number is required.");
  else if (!PLATE.test(plate))
    e["plateNumber"] = tr(
      "Biển số chỉ gồm chữ, số, dấu chấm, gạch ngang (VD: 51D-123.45).",
      "Plate number may only contain letters, digits, dot, hyphen (e.g. 51D-123.45).",
    );
  else if (dup("plateNumber", plate))
    e["plateNumber"] = tr(`Biển số ${plate} đã tồn tại.`, `Plate number ${plate} already exists.`);
  const vin = norm(d.chassisNumber);
  if (!vin) e["chassisNumber"] = tr("Nhập số khung (VIN).", "Chassis number (VIN) is required.");
  else if (!VIN.test(vin))
    e["chassisNumber"] = tr(
      "Số khung gồm 11–17 chữ/số, không dấu cách.",
      "Chassis number is 11–17 letters/digits, no spaces.",
    );
  else if (dup("chassisNumber", vin))
    e["chassisNumber"] = tr(`Số khung ${vin} đã tồn tại.`, `Chassis number ${vin} already exists.`);
  if (!d.inspectionReportNo.trim())
    e["inspectionReportNo"] = tr(
      "Nhập số biên bản kiểm định.",
      "Inspection report no. is required.",
    );
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
    if (d[k] && !(Number(d[k]) >= 0)) e[k] = tr("Giá trị phải ≥ 0.", "Value must be ≥ 0.");
  return e;
}

const LABELS: [keyof VehicleDraft, string][] = [
  ["vehicleType", "Vehicle Type"],
  ["vehicleGroup", "Vehicle Group"],
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
  ["containerDimension", "Cargo Container Dimensions"],
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
      chassisNumber: norm(d.chassisNumber),
      engineNumber: d.engineNumber.trim(),
      modelCode: d.modelCode.trim(),
      inspectionReportNo: d.inspectionReportNo.trim(),
    };
    const existing = id ? vehicleMasterRepository.get(id) : undefined;
    if (!existing) {
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
