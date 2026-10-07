// Master Data > Cost: Cost Group CRUD (create/edit/status) and Cost items (read + status only for now).
import type { CostGroupRecord, CostItemRecord } from "@/types";
import { costGroupRepository, costItemRepository, serviceRepository, uid } from "@/repositories";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import type { ImportEntityConfig } from "./importExportService";

const groups = () => costGroupRepository.all().filter((g) => !g.deleted);
const items = () => costItemRepository.all().filter((c) => !c.deleted);

export const groupName = (id: string | null | undefined, list: CostGroupRecord[] = groups()) =>
  (id && list.find((g) => g.id === id)?.name) || "";
export const serviceName = (id: string | null | undefined) =>
  (id && serviceRepository.get(id)?.name) || "";

// ---------------------------------------------------------------- Cost Group

export const costGroupCrud = makeCrud<CostGroupRecord>({
  entityType: "Cost Group",
  repo: costGroupRepository,
  labelOf: (g) => g.code,
  references: (g) => {
    const kids = groups().filter((x) => x.parentId === g.id).length;
    const used = items().filter((c) => c.groupId === g.id).length;
    if (kids) return `has ${kids} child group${kids > 1 ? "s" : ""}`;
    if (used) return `is used by ${used} cost${used > 1 ? "s" : ""}`;
    return null;
  },
});

const descendantsOf = (id: string): string[] =>
  groups()
    .filter((g) => g.parentId === id)
    .flatMap((g) => [g.id, ...descendantsOf(g.id)]);

/** Groups that may be the parent of `id` (not itself, not one of its children). */
export const parentOptions = (id: string | undefined) => {
  const blocked = new Set(id ? [id, ...descendantsOf(id)] : []);
  return groups().filter((g) => !blocked.has(g.id));
};

export type CostGroupDraft = Pick<
  CostGroupRecord,
  "code" | "name" | "parentId" | "status" | "remark"
>;

/** Create default: Inactive (current requirement). */
export const newCostGroupDraft = (): CostGroupDraft => ({
  code: "",
  name: "",
  parentId: null,
  status: "Inactive",
  remark: "",
});

export function validateCostGroup(d: CostGroupDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Group Code is required.";
  else if (groups().some((g) => g.id !== id && g.code.toUpperCase() === code))
    e["code"] = `Group Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Group Name is required.";
  if (d.parentId && id && (d.parentId === id || descendantsOf(id).includes(d.parentId)))
    e["parentId"] = "A group cannot be its own parent.";
  return e;
}

export const costGroupService = {
  save(d: CostGroupDraft, id?: string): CostGroupRecord {
    const errors = validateCostGroup(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const clean: CostGroupDraft = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      remark: d.remark.trim(),
    };
    const existing = id ? costGroupRepository.get(id) : undefined;
    if (!existing) {
      const rec: CostGroupRecord = { ...clean, id: uid("CG-"), ...stampCreate() };
      costGroupRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Cost Group",
        entityId: rec.id,
        entityLabel: rec.code,
        ...(rec.parentId ? { note: `Parent: ${groupName(rec.parentId)}` } : {}),
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    costGroupRepository.update(existing.id, () => next);
    const base = { entityType: "Cost Group" as const, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    const upd = (action: AuditInput["action"], field: string, a: string, b: string) =>
      a !== b && out.push({ ...base, action, field, oldValue: a || "—", newValue: b || "—" });
    upd("UPDATE", "Group Code", existing.code, next.code);
    upd("UPDATE", "Group Name", existing.name, next.name);
    upd("UPDATE", "Parent Group", groupName(existing.parentId), groupName(next.parentId));
    upd("UPDATE", "Remark", existing.remark, next.remark);
    upd(
      next.status === "Active" ? "ACTIVATE" : "DEACTIVATE",
      "Status",
      existing.status,
      next.status,
    );
    auditService.logMany(out);
    return next;
  },
};

export const costGroupImportConfig: ImportEntityConfig = {
  entityType: "Cost Group",
  screen: "cost-group",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Group Code", required: true, example: "TOLL" },
    { key: "name", header: "Group Name", required: true, example: "Toll Cost" },
    { key: "parent", header: "Parent Group Code", example: "TRANS" },
    { key: "remark", header: "Remark", example: "" },
  ],
  existingKeys: () => new Set(groups().map((g) => g.code.toLowerCase())),
  referenceCheck: (r) =>
    r["parent"] && !groups().some((g) => g.code.toLowerCase() === r["parent"]!.toLowerCase())
      ? [{ field: "parent", error: "Parent group not found" }]
      : [],
  rowCheck: () => [],
  commit: (rows) => {
    const recs: CostGroupRecord[] = rows.map((r) => ({
      ...newCostGroupDraft(),
      id: uid("CG-"),
      code: r["code"]!.toUpperCase(),
      name: r["name"]!,
      parentId: r["parent"]
        ? (groups().find((g) => g.code.toLowerCase() === r["parent"]!.toLowerCase())?.id ?? null)
        : null,
      remark: r["remark"] ?? "",
      ...stampCreate(),
    }));
    costGroupRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => costGroupCrud.removeMany(ids),
  sampleFile: () => {
    const header = costGroupImportConfig.columns.map((c) => c.header);
    const parents = ["TRANS", "PORT", ""];
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `CG-IMP-${String(i + 1).padStart(2, "0")}`,
      `Imported group ${i + 1}`,
      parents[i % 3]!,
      "Demo import",
    ]);
    rows[1]![0] = "CG-IMP-01"; // duplicate
    rows[6]![2] = "XYZ"; // parent not found
    return [header, ...rows];
  },
};

// ---------------------------------------------------------------- Cost (items)

export const costItemCrud = makeCrud<CostItemRecord>({
  entityType: "Cost",
  repo: costItemRepository,
  labelOf: (c) => c.code,
  references: () => null,
});

export const costItemsInGroup = (groupId: string) => items().filter((c) => c.groupId === groupId);
