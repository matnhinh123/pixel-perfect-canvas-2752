import type { CostLine, CostRecord, CostVersion, RouteRecord, Status, VehicleGroup } from "@/types";
import { costRepository, routeRepository, uid } from "@/repositories";
import { defaultCostLines } from "@/mock-data/rates";
import { formatDate, formatVnd, todayYmd } from "@/lib/format";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { lineAmount, snapshotOf, summarize } from "./cost/costMath";
import type { ImportEntityConfig } from "./importExportService";

export const costCrud = makeCrud<CostRecord>({
  entityType: "Cost",
  repo: costRepository,
  labelOf: (c) => c.code,
  references: (c) => {
    const locked = c.versions.filter((v) => v.status !== "Draft").length;
    return locked ? `has ${locked} released version${locked > 1 ? "s" : ""} in its history` : null;
  },
});

export const latestVersion = (c: CostRecord): CostVersion =>
  c.versions.reduce((a, b) => (b.version > a.version ? b : a));
export const activeVersion = (c: CostRecord): CostVersion | undefined =>
  c.versions.find((v) => v.status === "Active");

/** Figures shown in lists: the Active version if any, otherwise the latest draft. */
export const displayVersion = (c: CostRecord) => activeVersion(c) ?? latestVersion(c);

export interface CostForm {
  id: string;
  code: string;
  name: string;
  routeId: string;
  vehicleGroup: VehicleGroup;
  status: Status;
  effectiveFrom: string;
  lines: CostLine[];
  note: string;
}

export const newCostForm = (): CostForm => ({
  id: "",
  code: "",
  name: "",
  routeId: "",
  vehicleGroup: "Medium Truck",
  status: "Draft",
  effectiveFrom: todayYmd(),
  lines: defaultCostLines("Medium Truck").map((l) => ({ ...l, id: uid("L-") })),
  note: "",
});

export const formFromCost = (c: CostRecord): CostForm => {
  const v = latestVersion(c);
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    routeId: c.routeId,
    vehicleGroup: c.vehicleGroup,
    status: c.status,
    effectiveFrom: v.effectiveFrom,
    lines: structuredClone(v.lines),
    note: "",
  };
};

export function validateCost(f: CostForm, existing?: CostRecord): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.code.trim()) e["code"] = "Cost Code is required.";
  else if (
    costRepository
      .all()
      .some(
        (c) => !c.deleted && c.id !== f.id && c.code.toLowerCase() === f.code.trim().toLowerCase(),
      )
  )
    e["code"] = `Cost Code ${f.code} already exists.`;
  const route = routeRepository.get(f.routeId);
  if (!f.routeId || !route || route.deleted) e["routeId"] = "Select a Route.";
  else if (!route.outbound)
    e["routeId"] =
      `Route ${route.code} has not been calculated yet — calculate it in Routing first.`;
  if (!f.effectiveFrom) e["effectiveFrom"] = "Effective From is required.";
  if (f.lines.some((l) => !l.description.trim()))
    e["lines"] = "Every cost line needs a description.";
  if (f.lines.some((l) => !(l.rate >= 0))) e["lines"] = "Rates must be zero or positive numbers.";
  if (existing && needsNewVersion(existing, f)) {
    const cur = latestVersion(existing);
    if (f.effectiveFrom <= cur.effectiveFrom)
      e["effectiveFrom"] =
        `A new version must be effective after v${cur.version} (${formatDate(cur.effectiveFrom)}).`;
  }
  return e;
}

const linesSig = (ls: CostLine[]) =>
  JSON.stringify(
    ls.map(({ category, description, basis, rate }) => [category, description, basis, rate]),
  );

/** Editing a released (Active/Superseded) version never overwrites it — a new version is created instead. */
export function needsNewVersion(c: CostRecord, f: CostForm) {
  const cur = latestVersion(c);
  if (cur.status === "Draft") return false;
  return (
    linesSig(cur.lines) !== linesSig(f.lines) ||
    cur.effectiveFrom !== f.effectiveFrom ||
    c.routeId !== f.routeId ||
    c.vehicleGroup !== f.vehicleGroup
  );
}

function lineDiffs(
  prev: CostLine[],
  next: CostLine[],
  base: Omit<AuditInput, "action">,
): AuditInput[] {
  const out: AuditInput[] = [];
  const unit = (l: CostLine) => `${formatVnd(l.rate)}/${l.basis.replace("Per ", "")}`;
  for (const n of next) {
    const p = prev.find((x) => x.id === n.id);
    if (!p)
      out.push({
        ...base,
        action: "CHANGE_AMOUNT",
        field: `${n.category}: ${n.description}`,
        oldValue: "(new line)",
        newValue: unit(n),
      });
    else if (p.rate !== n.rate || p.basis !== n.basis)
      out.push({
        ...base,
        action: "CHANGE_AMOUNT",
        field: `${n.category}: ${n.description}`,
        oldValue: unit(p),
        newValue: unit(n),
      });
  }
  prev
    .filter((p) => !next.some((n) => n.id === p.id))
    .forEach((p) =>
      out.push({
        ...base,
        action: "CHANGE_AMOUNT",
        field: `${p.category}: ${p.description}`,
        oldValue: unit(p),
        newValue: "(removed)",
      }),
    );
  return out;
}

export const costService = {
  ...costCrud,

  routeOf: (c: { routeId: string }): RouteRecord | undefined => routeRepository.get(c.routeId),

  save(f: CostForm): CostRecord {
    const existing = f.id ? costRepository.get(f.id) : undefined;
    const errors = validateCost(f, existing);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please fix the highlighted fields.", errors);
    const route = routeRepository.get(f.routeId)!;
    const snap = snapshotOf(route);
    const now = new Date().toISOString();
    const makeVersion = (version: number, status: CostVersion["status"]): CostVersion => ({
      version,
      effectiveFrom: f.effectiveFrom,
      status,
      lines: f.lines,
      routeSnapshot: snap,
      totalEstimated: summarize(f.lines, snap).total,
      createdAt: now,
      createdBy: "",
      ...(f.note ? { note: f.note } : {}),
    });
    const verStatus = f.status === "Active" ? "Active" : "Draft";

    if (!existing) {
      const rec: CostRecord = {
        id: uid("C-"),
        code: f.code.trim().toUpperCase(),
        name: f.name.trim() || `${route.code} · ${f.vehicleGroup}`,
        routeId: f.routeId,
        vehicleGroup: f.vehicleGroup,
        status: f.status,
        versions: [{ ...makeVersion(1, verStatus), createdBy: stampCreate().createdBy }],
        ...stampCreate(),
      };
      costRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Cost",
        entityId: rec.id,
        entityLabel: rec.code,
        note: `v1 effective ${formatDate(f.effectiveFrom)} · total ${formatVnd(rec.versions[0]!.totalEstimated)}`,
      });
      return rec;
    }

    const base = {
      entityType: "Cost" as const,
      entityId: existing.id,
      entityLabel: f.code.trim().toUpperCase(),
    };
    const out: AuditInput[] = [];
    const cur = latestVersion(existing);
    let versions = existing.versions;
    const by = stampCreate().createdBy;

    if (needsNewVersion(existing, f)) {
      const v = { ...makeVersion(cur.version + 1, verStatus), createdBy: by };
      versions = [
        ...versions.map((x) =>
          verStatus === "Active" && x.status === "Active"
            ? { ...x, status: "Superseded" as const }
            : x,
        ),
        v,
      ];
      out.push({
        ...base,
        action: "CREATE_VERSION",
        field: "Version",
        oldValue: `v${cur.version}`,
        newValue: `v${v.version} (${verStatus}, effective ${formatDate(v.effectiveFrom)})`,
      });
    } else if (cur.status === "Draft") {
      const v = {
        ...makeVersion(cur.version, verStatus),
        createdBy: cur.createdBy || by,
        createdAt: cur.createdAt,
      };
      versions = versions.map((x) =>
        x.version === cur.version
          ? v
          : verStatus === "Active" && x.status === "Active"
            ? { ...x, status: "Superseded" as const }
            : x,
      );
      if (verStatus === "Active")
        out.push({
          ...base,
          action: "CREATE_VERSION",
          field: "Version",
          oldValue: `v${cur.version} Draft`,
          newValue: `v${cur.version} Active`,
        });
    }
    out.push(...lineDiffs(cur.lines, f.lines, base));
    if (cur.effectiveFrom !== f.effectiveFrom)
      out.push({
        ...base,
        action: "CHANGE_EFFECTIVE_DATE",
        field: "Effective From",
        oldValue: formatDate(cur.effectiveFrom),
        newValue: formatDate(f.effectiveFrom),
      });
    if (existing.routeId !== f.routeId)
      out.push({
        ...base,
        action: "UPDATE",
        field: "Route",
        oldValue: routeRepository.get(existing.routeId)?.code ?? "",
        newValue: route.code,
      });
    if (existing.vehicleGroup !== f.vehicleGroup)
      out.push({
        ...base,
        action: "UPDATE",
        field: "Vehicle Group",
        oldValue: existing.vehicleGroup,
        newValue: f.vehicleGroup,
      });
    if (existing.code !== base.entityLabel)
      out.push({
        ...base,
        action: "UPDATE",
        field: "Cost Code",
        oldValue: existing.code,
        newValue: base.entityLabel,
      });
    if (existing.status !== f.status)
      out.push({
        ...base,
        action:
          f.status === "Inactive" ? "DEACTIVATE" : f.status === "Active" ? "ACTIVATE" : "UPDATE",
        field: "Status",
        oldValue: existing.status,
        newValue: f.status,
      });

    const next = stampUpdate({
      ...existing,
      code: base.entityLabel,
      name: f.name.trim() || existing.name,
      routeId: f.routeId,
      vehicleGroup: f.vehicleGroup,
      status: f.status,
      versions,
    });
    costRepository.update(existing.id, () => next);
    auditService.logMany(out);
    return next;
  },

  lineAmount,
};

// ---------- Import config ----------
const GROUPS: VehicleGroup[] = [
  "Van / Pickup",
  "Light Truck",
  "Medium Truck",
  "Heavy Truck",
  "Tractor / Container Truck",
];
export const costImportConfig: ImportEntityConfig = {
  entityType: "Cost",
  screen: "cost",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Cost Code", required: true, example: "CST-HCM-BD-LGT" },
    { key: "route", header: "Route Code", required: true, example: "RT-HCM-BD" },
    { key: "vehicleGroup", header: "Vehicle Group", required: true, example: "Light Truck" },
    { key: "effectiveFrom", header: "Effective From", required: true, example: "2026-11-01" },
    { key: "fuelPerKm", header: "Fuel Rate (per km)", example: "4500" },
  ],
  existingKeys: () =>
    new Set(
      costRepository
        .all()
        .filter((c) => !c.deleted)
        .map((c) => c.code.toLowerCase()),
    ),
  referenceCheck: (r) => {
    const route = routeRepository
      .all()
      .find((x) => !x.deleted && x.code.toLowerCase() === (r["route"] ?? "").toLowerCase());
    if (!route) return [{ field: "route", error: "Route not found" }];
    if (!route.outbound) return [{ field: "route", error: "Route not calculated yet" }];
    return [];
  },
  rowCheck: (r) => {
    const e: { field: string; error: string }[] = [];
    if (!GROUPS.includes(r["vehicleGroup"] as VehicleGroup))
      e.push({ field: "vehicleGroup", error: "Unknown vehicle group" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r["effectiveFrom"] ?? ""))
      e.push({ field: "effectiveFrom", error: "Use yyyy-mm-dd" });
    if (r["fuelPerKm"] && !(Number(r["fuelPerKm"]) >= 0))
      e.push({ field: "fuelPerKm", error: "Must be a positive number" });
    return e;
  },
  commit: (rows) => {
    const recs: CostRecord[] = rows.map((r) => {
      const route = routeRepository
        .all()
        .find((x) => !x.deleted && x.code.toLowerCase() === r["route"]!.toLowerCase())!;
      const group = r["vehicleGroup"] as VehicleGroup;
      const lines = defaultCostLines(group).map((l) => ({
        ...l,
        id: uid("L-"),
        ...(l.category === "Fuel" && r["fuelPerKm"] ? { rate: Number(r["fuelPerKm"]) } : {}),
      }));
      const snap = snapshotOf(route);
      const meta = stampCreate();
      return {
        id: uid("C-"),
        code: r["code"]!.toUpperCase(),
        name: `${route.code} · ${group}`,
        routeId: route.id,
        vehicleGroup: group,
        status: "Draft",
        versions: [
          {
            version: 1,
            effectiveFrom: r["effectiveFrom"]!,
            status: "Draft",
            lines,
            routeSnapshot: snap,
            totalEstimated: summarize(lines, snap).total,
            createdAt: meta.createdAt,
            createdBy: meta.createdBy,
          },
        ],
        ...meta,
      };
    });
    costRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => costCrud.removeMany(ids),
  sampleFile: () => {
    const header = costImportConfig.columns.map((c) => c.header);
    const routes = ["RT-HCM-CL", "RT-HCM-BD", "RT-HCM-DN", "RT-HN-HP"];
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `CST-IMP-${String(i + 1).padStart(2, "0")}`,
      routes[i % 4]!,
      GROUPS[i % 5]!,
      "2026-11-01",
      String(4000 + i * 250),
    ]);
    rows[1]![0] = "CST-IMP-01"; // duplicate
    rows[6]![1] = "RT-XYZ"; // route not found
    return [header, ...rows];
  },
};
