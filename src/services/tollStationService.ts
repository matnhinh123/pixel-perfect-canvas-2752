// Toll Station master: code, name, location, fee type, Vietmap ID, 5 Toll Group rates.
// Routing reads active stations from here and maps Vietmap tolls by `vietmapId`.
import { routeRepository, tollStationRepository, uid } from "@/repositories";
import type { MockTollGate, TollGateRecord } from "@/mock-data/tollCatalog";
import type { FeeType } from "@/types";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import type { ImportEntityConfig } from "./importExportService";

export { activeTollGates, tollGateByVietmapId } from "./routing/tollGates";

const live = () => tollStationRepository.all().filter((g) => !g.deleted);

/** Routes whose calculated tolls include this station. */
const routesUsing = (id: string) =>
  routeRepository
    .all()
    .filter(
      (r) =>
        !r.deleted &&
        [...(r.outbound?.tollStations ?? []), ...(r.returnLeg?.tollStations ?? [])].some(
          (t) => t.id === id,
        ),
    ).length;

export const tollStationCrud = makeCrud<TollGateRecord>({
  entityType: "Toll Station",
  repo: tollStationRepository,
  labelOf: (g) => g.code,
  references: (g) => {
    const n = routesUsing(g.id);
    return n ? `is used by ${n} route${n > 1 ? "s" : ""}` : null;
  },
});

/** Vietnamese toll vehicle groups (fixed). Applied Vehicle is a read-only description. */
export const TOLL_GROUPS = [
  { group: 1, applied: "Passenger car < 12 seats · truck < 2 t" },
  { group: 2, applied: "Passenger car ≤ 30 seats · truck < 4 t" },
  { group: 3, applied: "Passenger car > 31 seats · truck < 10 t · tractor without container" },
  { group: 4, applied: "Truck < 18 t · tractor + container ≤ 20 ft" },
  { group: 5, applied: "Truck ≥ 18 t · tractor + container > 20 ft" },
] as const;

/** UI fee types: Road (stored as "Toll") and Bridge / Ferry. */
export const FEE_TYPE_OPTIONS = ["Road", "Bridge / Ferry"] as const;
export type FeeTypeOption = (typeof FEE_TYPE_OPTIONS)[number];
export const feeTypeName = (f: FeeType): FeeTypeOption =>
  f === "Toll" ? "Road" : "Bridge / Ferry";
/** Form label → stored value (keeps Ferry when it was Ferry). */
export const feeTypeFromLabel = (label: string, current?: FeeType): FeeType =>
  label === "Road" ? "Toll" : current === "Ferry" ? "Ferry" : "Bridge";

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
  vietmapId: "",
  remark: "",
  currency: "VND",
  source: "Manual",
});

/** Source follows the Vietmap ID: mapped to Vietmap → "Vietmap", otherwise "Manual". */
export const sourceOf = (g: Pick<TollGateRecord, "vietmapId" | "source">) =>
  g.source ?? (g.vietmapId ? "Vietmap" : "Manual");

/** Draft of an existing record (form state). */
export const draftOf = (g: TollGateRecord): TollStationDraft => {
  const {
    id: _id,
    status: _s,
    deleted: _d,
    createdAt: _ca,
    createdBy: _cb,
    updatedAt: _ua,
    updatedBy: _ub,
    ...rest
  } = g;
  return {
    ...rest,
    // Stored JSON turns NaN into null.
    lat: Number.isFinite(g.lat) ? g.lat : NaN,
    lng: Number.isFinite(g.lng) ? g.lng : NaN,
    vietmapId: g.vietmapId ?? "",
    remark: g.remark ?? "",
    currency: g.currency ?? "VND",
    source: sourceOf(g),
  };
};

/** "Location" column / detail: linked location name, else road · province. */
export const locationLabel = (
  g: Pick<TollGateRecord, "province" | "road" | "address">,
  locationName?: string,
) => locationName || [g.road, g.province].filter(Boolean).join(" · ") || g.address || "—";

const CODE_RE = /^[A-Z0-9._-]{1,30}$/;

export function validateTollStation(
  d: TollStationDraft,
  id?: string,
  _opts: { requireCoords?: boolean } = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Toll Station Code is required.";
  else if (!CODE_RE.test(code)) e["code"] = "Use A–Z, 0–9, . - _ (max 30).";
  else if (live().some((g) => g.id !== id && g.code.toUpperCase() === code))
    e["code"] = `Toll Station Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Toll Station Name is required.";
  const vm = (d.vietmapId ?? "").trim();
  if (vm && live().some((g) => g.id !== id && (g.vietmapId ?? "") === vm))
    e["vietmapId"] = `Vietmap ID ${vm} is already mapped to another station.`;
  // Coordinates are optional, but if one is given both must be valid.
  if (Number.isFinite(d.lat) || Number.isFinite(d.lng)) {
    if (!Number.isFinite(d.lat) || Math.abs(d.lat) > 90) e["lat"] = "Latitude must be -90 … 90.";
    if (!Number.isFinite(d.lng) || Math.abs(d.lng) > 180)
      e["lng"] = "Longitude must be -180 … 180.";
  }
  if (d.prices.some((p) => !Number.isFinite(p) || p < 0))
    e["prices"] = "Toll fees must be 0 or more.";
  return e;
}

const AUDIT_FIELDS: [keyof TollStationDraft, string][] = [
  ["code", "Toll Station Code"],
  ["name", "Toll Station Name"],
  ["locationId", "Location"],
  ["feeType", "Fee Type"],
  ["vietmapId", "Vietmap ID"],
  ["remark", "Remark"],
  ["lat", "Latitude"],
  ["lng", "Longitude"],
];

export const tollStationService = {
  save(d: TollStationDraft, id?: string, opts?: { requireCoords?: boolean }): TollGateRecord {
    const errors = validateTollStation(d, id, opts);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const vietmapId = (d.vietmapId ?? "").trim();
    const clean: TollStationDraft = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      remark: (d.remark ?? "").trim(),
      vietmapId,
      source: vietmapId ? "Vietmap" : "Manual",
      currency: d.currency || "VND",
    };
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
    const entry = { ...base, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    for (const [k, label] of AUDIT_FIELDS) {
      const a = String(existing[k] ?? ""),
        b = String(next[k] ?? "");
      if (a !== b)
        out.push({
          ...entry,
          action: "UPDATE",
          field: label,
          oldValue: a || "—",
          newValue: b || "—",
        });
    }
    existing.prices.forEach((p, i) => {
      if (p !== next.prices[i])
        out.push({
          ...entry,
          action: "CHANGE_AMOUNT",
          field: `Group ${i + 1} fee`,
          oldValue: String(p),
          newValue: String(next.prices[i]),
        });
    });
    auditService.logMany(
      out.length ? out : [{ ...entry, action: "UPDATE", note: "Saved without changes" }],
    );
    return next;
  },
};

// ---------------------------------------------------------------- import

export const tollStationImportConfig: ImportEntityConfig = {
  entityType: "Toll Station",
  screen: "toll-station",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Toll Station Code", required: true, example: "QL1A-NL" },
    { key: "name", header: "Toll Station Name", required: true, example: "Trạm BOT Ninh Lộc" },
    { key: "feeType", header: "Fee Type", required: true, example: "Road" },
    { key: "province", header: "Area", example: "Khánh Hòa" },
    { key: "vietmapId", header: "Vietmap ID", example: "" },
    { key: "lat", header: "Latitude", example: "12.4" },
    { key: "lng", header: "Longitude", example: "109.1" },
    { key: "g1", header: "Group 1", required: true, example: "15000" },
    { key: "g2", header: "Group 2", required: true, example: "20000" },
    { key: "g3", header: "Group 3", required: true, example: "30000" },
    { key: "g4", header: "Group 4", required: true, example: "45000" },
    { key: "g5", header: "Group 5", required: true, example: "60000" },
  ],
  existingKeys: () => new Set(live().map((g) => g.code.toLowerCase())),
  referenceCheck: () => [],
  rowCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    if (!FEE_TYPE_OPTIONS.includes(r["feeType"] as FeeTypeOption))
      e.push({ field: "feeType", error: "Road or Bridge / Ferry" });
    for (const k of ["g1", "g2", "g3", "g4", "g5"])
      if (!(Number(r[k]) >= 0)) e.push({ field: k, error: "Fee must be a number ≥ 0" });
    return e;
  },
  commit: (rows) => {
    const recs: TollGateRecord[] = rows.map((r) => {
      const vietmapId = (r["vietmapId"] ?? "").trim();
      return {
        ...newTollStationDraft(),
        id: uid("T-"),
        code: r["code"]!.toUpperCase(),
        name: r["name"]!,
        feeType: feeTypeFromLabel(r["feeType"] ?? "Road"),
        province: r["province"] ?? "",
        lat: r["lat"] ? Number(r["lat"]) : NaN,
        lng: r["lng"] ? Number(r["lng"]) : NaN,
        vietmapId,
        source: vietmapId ? "Vietmap" : "Manual",
        prices: [r["g1"], r["g2"], r["g3"], r["g4"], r["g5"]].map(
          Number,
        ) as TollGateRecord["prices"],
        status: "Active",
        ...stampCreate(),
      };
    });
    tollStationRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => tollStationCrud.removeMany(ids),
  sampleFile: () => {
    const header = tollStationImportConfig.columns.map((c) => c.header);
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `IMP-T${String(i + 1).padStart(2, "0")}`,
      `Imported toll ${i + 1}`,
      i % 4 === 0 ? "Bridge / Ferry" : "Road",
      "Đồng Nai",
      "",
      "",
      "",
      "15000",
      "20000",
      "30000",
      "45000",
      "60000",
    ]);
    rows[1]![0] = "IMP-T01"; // duplicate
    rows[6]![2] = "Toll road"; // unknown fee type
    return [header, ...rows];
  },
};
