import type {
  ServiceRecord,
  TemplateType,
  TenantFieldSetting,
  TenantTemplateConfig,
} from "@/types";
import { TEMPLATES } from "@/types";
import { serviceRepository, templateConfigRepository, uid } from "@/repositories";
import { TEMPLATE_FIELDS } from "@/mock-data/templates";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import type { ImportEntityConfig } from "./importExportService";

const all = () => serviceRepository.all().filter((s) => !s.deleted);
const childrenOf = (id: string) => all().filter((s) => s.parentId === id);

export const serviceCrud = makeCrud<ServiceRecord>({
  entityType: "Service",
  repo: serviceRepository,
  labelOf: (s) => s.code,
  references: (s) => {
    const n = childrenOf(s.id).length;
    return n ? `has ${n} child service${n > 1 ? "s" : ""} that depend on it` : null;
  },
});

/** Level-1 ancestor; its template is the only source of truth for every descendant. */
export function rootOf(
  s: ServiceRecord,
  list: ServiceRecord[] = serviceRepository.all(),
): ServiceRecord {
  let cur = s;
  const guard = new Set<string>();
  while (cur.parentId && !guard.has(cur.id)) {
    guard.add(cur.id);
    const p = list.find((x) => x.id === cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur;
}

export const templateOf = (s: ServiceRecord, list?: ServiceRecord[]): TemplateType | null =>
  rootOf(s, list).template;
export const levelOf = (s: ServiceRecord, list: ServiceRecord[] = serviceRepository.all()) => {
  let lvl = 1,
    cur = s;
  while (cur.parentId) {
    const p = list.find((x) => x.id === cur.parentId);
    if (!p) break;
    lvl++;
    cur = p;
  }
  return lvl;
};

const descendantsOf = (id: string): string[] =>
  childrenOf(id).flatMap((c) => [c.id, ...descendantsOf(c.id)]);

export const newServiceDraft = (): ServiceRecord => ({
  id: "",
  code: "",
  name: "",
  parentId: null,
  template: null,
  description: "",
  status: "Draft",
  createdAt: "",
  createdBy: "",
  updatedAt: "",
  updatedBy: "",
});

export function validateService(s: ServiceRecord): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s.code.trim()) e["code"] = "Service Code is required.";
  else if (all().some((x) => x.id !== s.id && x.code.toLowerCase() === s.code.trim().toLowerCase()))
    e["code"] = `Service Code ${s.code} already exists.`;
  if (!s.name.trim()) e["name"] = "Service Name is required.";
  if (!s.parentId && !s.template)
    e["template"] = "A level-1 service group must use one of the 3 templates.";
  if (s.parentId && s.id && (s.parentId === s.id || descendantsOf(s.id).includes(s.parentId)))
    e["parentId"] = "A service cannot be its own ancestor.";
  if (s.template && !TEMPLATES.includes(s.template))
    e["template"] = "Only Trucking, Customs or Freight are allowed.";
  return e;
}

export const serviceCatalogService = {
  ...serviceCrud,
  childrenOf,
  descendantsOf,

  save(draft: ServiceRecord): ServiceRecord {
    const errors = validateService(draft);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please fix the highlighted fields.", errors);
    // Children never store a template — they inherit it.
    const clean: ServiceRecord = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      template: draft.parentId ? null : draft.template,
    };
    const existing = draft.id ? serviceRepository.get(draft.id) : undefined;
    if (!existing) {
      const rec = { ...clean, id: uid("S-"), ...stampCreate() };
      serviceRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Service",
        entityId: rec.id,
        entityLabel: rec.code,
        note: rec.parentId
          ? `Child of ${serviceRepository.get(rec.parentId)?.code}`
          : `Root · ${rec.template} template`,
      });
      return rec;
    }
    const next = stampUpdate({
      ...existing,
      ...clean,
      id: existing.id,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    });
    serviceRepository.update(existing.id, () => next);
    const base = { entityType: "Service" as const, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    const upd = (action: AuditInput["action"], field: string, a: string, b: string) =>
      a !== b && out.push({ ...base, action, field, oldValue: a, newValue: b });
    upd("UPDATE", "Service Code", existing.code, next.code);
    upd("UPDATE", "Service Name", existing.name, next.name);
    upd("UPDATE", "Description", existing.description, next.description);
    upd(
      "UPDATE",
      "Parent",
      serviceRepository.get(existing.parentId ?? "")?.code ?? "(root)",
      serviceRepository.get(next.parentId ?? "")?.code ?? "(root)",
    );
    upd("CHANGE_TEMPLATE", "Template", templateOf(existing) ?? "—", templateOf(next) ?? "—");
    upd(
      next.status === "Inactive" ? "DEACTIVATE" : next.status === "Active" ? "ACTIVATE" : "UPDATE",
      "Status",
      existing.status,
      next.status,
    );
    auditService.logMany(out);
    return next;
  },

  getTemplateConfig: () => templateConfigRepository.get(),

  /** Apply tenant field settings; core mandatory fields are enforced server-side, not only in the UI. */
  saveTemplateConfig(
    template: TemplateType,
    settings: Record<string, TenantFieldSetting>,
    auditTarget: { id: string; label: string },
  ) {
    const cfg = templateConfigRepository.get();
    const prev = cfg[template];
    const out: AuditInput[] = [];
    const fixed: Record<string, TenantFieldSetting> = {};
    for (const def of TEMPLATE_FIELDS[template]) {
      let s = settings[def.key] ??
        prev[def.key] ?? { visible: def.defaultVisible, required: def.defaultRequired };
      if (def.coreMandatory) s = { visible: true, required: true };
      if (!s.visible) s = { ...s, required: false };
      fixed[def.key] = s;
      const p = prev[def.key];
      const base = {
        entityType: "Service" as const,
        entityId: auditTarget.id,
        entityLabel: `${auditTarget.label} · ${template} template`,
        field: def.label,
      };
      if (p && p.visible !== s.visible)
        out.push({
          ...base,
          action: "CHANGE_VISIBLE",
          oldValue: p.visible ? "Visible" : "Hidden",
          newValue: s.visible ? "Visible" : "Hidden",
        });
      if (p && p.required !== s.required)
        out.push({
          ...base,
          action: "CHANGE_REQUIRED",
          oldValue: p.required ? "Required" : "Optional",
          newValue: s.required ? "Required" : "Optional",
        });
    }
    const next: TenantTemplateConfig = { ...cfg, [template]: fixed };
    templateConfigRepository.save(next);
    auditService.logMany(out);
    return out.length;
  },
};

// ---------- Import config ----------
export const serviceImportConfig: ImportEntityConfig = {
  entityType: "Service",
  screen: "service",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Service Code", required: true, example: "SV-TRK-REF" },
    { key: "name", header: "Service Name", required: true, example: "Reefer Trucking" },
    { key: "parent", header: "Parent Code", example: "SG-TRK" },
    { key: "template", header: "Template", example: "" },
    { key: "description", header: "Description", example: "Xe lạnh" },
  ],
  existingKeys: () => new Set(all().map((s) => s.code.toLowerCase())),
  referenceCheck: (r) => {
    if (r["parent"] && !all().some((s) => s.code.toLowerCase() === r["parent"]!.toLowerCase()))
      return [{ field: "parent", error: "Parent service not found" }];
    return [];
  },
  rowCheck: (r) => {
    if (!r["parent"] && !TEMPLATES.includes(r["template"] as TemplateType))
      return [
        { field: "template", error: "Root service needs template Trucking / Customs / Freight" },
      ];
    if (r["parent"] && r["template"])
      return [{ field: "template", error: "Child services inherit the template — leave empty" }];
    return [];
  },
  commit: (rows) => {
    const recs: ServiceRecord[] = rows.map((r) => ({
      ...newServiceDraft(),
      id: uid("S-"),
      code: r["code"]!.toUpperCase(),
      name: r["name"]!,
      description: r["description"] ?? "",
      parentId: r["parent"]
        ? (all().find((s) => s.code.toLowerCase() === r["parent"]!.toLowerCase())?.id ?? null)
        : null,
      template: r["parent"] ? null : (r["template"] as TemplateType),
      status: "Draft",
      ...stampCreate(),
    }));
    serviceRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => serviceCrud.removeMany(ids),
  sampleFile: () => {
    const header = serviceImportConfig.columns.map((c) => c.header);
    const parents = ["SG-TRK", "SG-CUS", "SG-FRT"];
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `SV-IMP-${String(i + 1).padStart(2, "0")}`,
      `Imported service ${i + 1}`,
      parents[i % 3]!,
      "",
      "Demo import",
    ]);
    rows[1]![0] = "SV-IMP-01"; // duplicate
    rows[6]![2] = "SG-XYZ"; // parent not found
    return [header, ...rows];
  },
};
