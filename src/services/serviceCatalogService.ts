import type {
  ServiceRecord,
  TemplateType,
  TenantFieldSetting,
  TenantTemplateConfig,
} from "@/types";
import { TEMPLATES } from "@/types";
import {
  serviceAssignmentRepository,
  serviceRepository,
  templateConfigRepository,
  uid,
} from "@/repositories";
import { formName, TEMPLATE_FIELDS } from "@/mock-data/templates";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import type { ImportEntityConfig } from "./importExportService";
import { tr } from "@/lib/i18n";

const all = () => serviceRepository.all().filter((s) => !s.deleted);
const childrenOf = (id: string) => all().filter((s) => s.parentId === id);

export const serviceCrud = makeCrud<ServiceRecord>({
  entityType: "Service",
  repo: serviceRepository,
  labelOf: (s) => s.code,
  references: (s) => {
    const n = childrenOf(s.id).length;
    return n ? tr(`có ${n} dịch vụ con`, `has ${n} child service(s)`) : null;
  },
});

// ---------- Tree helpers (single source of truth for group / form inheritance) ----------

/** Root ancestor = the service group; its form is inherited by every descendant. */
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
/** "Nhóm dịch vụ" = name of the root service. */
export const groupOf = (s: ServiceRecord, list?: ServiceRecord[]) => rootOf(s, list).name;

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

/** Depth-first order (children right below their parent, siblings in creation order). */
export function treeOrder(list: ServiceRecord[]): ServiceRecord[] {
  const ids = new Set(list.map((s) => s.id));
  const out: ServiceRecord[] = [];
  const seen = new Set<string>();
  const walk = (pid: string | null) => {
    for (const s of list) {
      const parent = s.parentId && ids.has(s.parentId) ? s.parentId : null;
      if (parent !== pid || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
      walk(s.id);
    }
  };
  walk(null);
  // Anything left (a broken parent chain) still shows up at the end.
  return [...out, ...list.filter((s) => !seen.has(s.id))];
}

export const newServiceDraft = (): ServiceRecord => ({
  id: "",
  code: "",
  name: "",
  parentId: null,
  template: null,
  description: "",
  status: "Active",
  createdAt: "",
  createdBy: "",
  updatedAt: "",
  updatedBy: "",
});

export function validateService(s: ServiceRecord): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s.code.trim()) e["code"] = tr("Nhập mã dịch vụ.", "Enter the service code.");
  else if (all().some((x) => x.id !== s.id && x.code.toLowerCase() === s.code.trim().toLowerCase()))
    e["code"] = tr(
      `Mã ${s.code.trim().toUpperCase()} đã tồn tại.`,
      `Code ${s.code.trim().toUpperCase()} already exists.`,
    );
  if (!s.name.trim()) e["name"] = tr("Nhập tên dịch vụ.", "Enter the service name.");
  if (!s.parentId && !s.template)
    e["template"] = tr(
      "Chọn Default Template cho dịch vụ gốc.",
      "Select a Default Template for the root service.",
    );
  if (s.parentId && s.id && (s.parentId === s.id || descendantsOf(s.id).includes(s.parentId)))
    e["parentId"] = tr(
      "Không thể chọn chính nó hoặc dịch vụ con của nó làm dịch vụ cha.",
      "A service cannot use itself or one of its child services as its parent.",
    );
  if (s.template && !TEMPLATES.includes(s.template))
    e["template"] = tr(
      "Chỉ chọn Trucking Form, Customs Form, Freight Form hoặc Warehouse Form.",
      "Select Trucking Form, Customs Form, Freight Form or Warehouse Form only.",
    );
  return e;
}

const codeOf = (id: string | null) =>
  (id && serviceRepository.get(id)?.code) || tr("— (dịch vụ gốc)", "— (root service)");

export const serviceCatalogService = {
  ...serviceCrud,
  childrenOf,
  descendantsOf,

  save(draft: ServiceRecord): ServiceRecord {
    const errors = validateService(draft);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra các trường được đánh dấu.", "Please check the highlighted fields."),
        errors,
      );
    // Children never store a form — they inherit it from their root.
    const clean: ServiceRecord = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      description: draft.description.trim(),
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
          ? tr(`Dịch vụ cha: ${codeOf(rec.parentId)}`, `Parent Service: ${codeOf(rec.parentId)}`)
          : tr(
              `Dịch vụ gốc · ${formName(rec.template)}`,
              `Root service · ${formName(rec.template)}`,
            ),
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
    // Assignments of this service and its children follow a changed form (they may only use it).
    const form = templateOf(next);
    if (form !== templateOf(existing)) {
      const ids = [next.id, ...descendantsOf(next.id)];
      for (const a of serviceAssignmentRepository.all())
        if (!a.deleted && ids.includes(a.serviceId) && a.form && a.form !== form)
          serviceAssignmentRepository.update(a.id, (p) => stampUpdate({ ...p, form }));
    }
    const base = { entityType: "Service" as const, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    const upd = (action: AuditInput["action"], field: string, a: string, b: string) =>
      a !== b && out.push({ ...base, action, field, oldValue: a, newValue: b });
    upd("UPDATE", tr("Mã dịch vụ", "Service Code"), existing.code, next.code);
    upd("UPDATE", tr("Tên dịch vụ", "Service Name"), existing.name, next.name);
    upd("UPDATE", tr("Ghi chú", "Remark"), existing.description, next.description);
    upd(
      "UPDATE",
      tr("Dịch vụ cha", "Parent Service"),
      codeOf(existing.parentId),
      codeOf(next.parentId),
    );
    upd(
      "CHANGE_TEMPLATE",
      "Default Template",
      formName(templateOf(existing)),
      formName(templateOf(next)),
    );
    upd(
      next.status === "Inactive" ? "DEACTIVATE" : next.status === "Active" ? "ACTIVATE" : "UPDATE",
      tr("Trạng thái", "Status"),
      existing.status,
      next.status,
    );
    auditService.logMany(out);
    return next;
  },

  /** Current settings of a form, with defaults for fields that were never configured. */
  fieldSettings(
    template: TemplateType,
    cfg: TenantTemplateConfig = templateConfigRepository.get(),
  ) {
    return Object.fromEntries(
      TEMPLATE_FIELDS[template].map((def) => {
        const s = cfg[template]?.[def.key] ?? {
          visible: def.defaultVisible,
          required: def.defaultRequired,
        };
        return [def.key, def.coreMandatory ? { visible: true, required: true } : s];
      }),
    ) as Record<string, TenantFieldSetting>;
  },

  /** Apply field settings; locked fields are enforced here, not only in the UI. */
  saveTemplateConfig(
    template: TemplateType,
    settings: Record<string, TenantFieldSetting>,
    auditTarget: { id: string; label: string },
  ) {
    const cfg = templateConfigRepository.get();
    const prev = this.fieldSettings(template, cfg);
    const out: AuditInput[] = [];
    const fixed: Record<string, TenantFieldSetting> = {};
    for (const def of TEMPLATE_FIELDS[template]) {
      let s = settings[def.key] ?? prev[def.key]!;
      if (def.coreMandatory) s = { visible: true, required: true };
      if (!s.visible) s = { ...s, required: false };
      fixed[def.key] = s;
      const p = prev[def.key]!;
      const base = {
        entityType: "Service" as const,
        entityId: auditTarget.id,
        entityLabel: `${auditTarget.label} · ${formName(template)}`,
        field: tr(def.label, def.labelEn),
      };
      const vis = (v: boolean) => (v ? tr("Hiển thị", "Visible") : tr("Ẩn", "Hidden"));
      const req = (v: boolean) =>
        v ? tr("Bắt buộc", "Required") : tr("Không bắt buộc", "Optional");
      if (p.visible !== s.visible)
        out.push({
          ...base,
          action: "CHANGE_VISIBLE",
          oldValue: vis(p.visible),
          newValue: vis(s.visible),
        });
      if (p.required !== s.required)
        out.push({
          ...base,
          action: "CHANGE_REQUIRED",
          oldValue: req(p.required),
          newValue: req(s.required),
        });
    }
    templateConfigRepository.save({ ...cfg, [template]: fixed });
    auditService.logMany(out);
    return out.length;
  },
};

// ---------- Import config ----------
/** Accepts "Trucking" or "Trucking Form". */
const parseForm = (v: string | undefined): TemplateType | null => {
  const t = (v ?? "")
    .trim()
    .replace(/\s*form$/i, "")
    .toLowerCase();
  return TEMPLATES.find((x) => x.toLowerCase() === t) ?? null;
};

export const serviceImportConfig: ImportEntityConfig = {
  entityType: "Service",
  screen: "service",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Mã dịch vụ", required: true, example: "TRK-IN-RF" },
    { key: "name", header: "Tên dịch vụ", required: true, example: "Reefer Trucking" },
    { key: "parent", header: "Mã dịch vụ cha", example: "TRK-IN" },
    { key: "template", header: "Default Template", example: "", aliases: ["Form"] },
    { key: "description", header: "Ghi chú", example: "Xe lạnh" },
  ],
  existingKeys: () => new Set(all().map((s) => s.code.toLowerCase())),
  referenceCheck: (r) => {
    if (r["parent"] && !all().some((s) => s.code.toLowerCase() === r["parent"]!.toLowerCase()))
      return [
        {
          field: "parent",
          error: tr("Không tìm thấy dịch vụ cha", "Parent service not found"),
        },
      ];
    return [];
  },
  rowCheck: (r) => {
    if (!r["parent"] && !parseForm(r["template"]))
      return [
        {
          field: "template",
          error: tr(
            "Dịch vụ gốc cần Default Template: Trucking / Customs / Freight / Warehouse Form",
            "A root service needs a Default Template: Trucking / Customs / Freight / Warehouse Form",
          ),
        },
      ];
    if (r["parent"] && r["template"])
      return [
        {
          field: "template",
          error: tr(
            "Dịch vụ con kế thừa Default Template — để trống cột này",
            "Child services inherit the Default Template — leave this column empty",
          ),
        },
      ];
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
      template: r["parent"] ? null : parseForm(r["template"]),
      status: "Active",
      ...stampCreate(),
    }));
    serviceRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => serviceCrud.removeMany(ids),
  sampleFile: () => {
    const header = serviceImportConfig.columns.map((c) => c.header);
    const parents = ["TRK-IN", "CUS", "FRT"];
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `SV-IMP-${String(i + 1).padStart(2, "0")}`,
      `Imported service ${i + 1}`,
      parents[i % 3]!,
      "",
      "Demo import",
    ]);
    rows[1]![0] = "SV-IMP-01"; // duplicate
    rows[6]![2] = "XYZ"; // parent not found
    return [header, ...rows];
  },
};
