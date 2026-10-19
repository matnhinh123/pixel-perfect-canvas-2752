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
/** Names of the services a cost applies to (skips services that no longer exist). */
export const serviceNames = (ids: string[]) => ids.map((id) => serviceName(id)).filter(Boolean);

// ---------------------------------------------------------------- Cost Group

export const costGroupCrud = makeCrud<CostGroupRecord>({
  entityType: "Cost Group",
  repo: costGroupRepository,
  labelOf: (g) => g.code,
  references: (g) => {
    const used = items().filter((c) => c.groupId === g.id).length;
    if (used) return `is used by ${used} cost${used > 1 ? "s" : ""}`;
    return null;
  },
});

export type CostGroupDraft = Pick<CostGroupRecord, "code" | "name" | "status" | "remark">;

/** Create default: Inactive (current requirement). */
export const newCostGroupDraft = (): CostGroupDraft => ({
  code: "",
  name: "",
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
    { key: "remark", header: "Remark", example: "" },
  ],
  existingKeys: () => new Set(groups().map((g) => g.code.toLowerCase())),
  referenceCheck: () => [],
  rowCheck: () => [],
  commit: (rows) => {
    const recs: CostGroupRecord[] = rows.map((r) => ({
      ...newCostGroupDraft(),
      id: uid("CG-"),
      code: r["code"]!.toUpperCase(),
      name: r["name"]!,
      remark: r["remark"] ?? "",
      ...stampCreate(),
    }));
    costGroupRepository.insertMany(recs);
    return recs.map((r) => r.id);
  },
  rollback: (ids) => costGroupCrud.removeMany(ids),
  sampleFile: () => {
    const header = costGroupImportConfig.columns.map((c) => c.header);
    const rows: string[][] = Array.from({ length: 20 }, (_, i) => [
      `CG-IMP-${String(i + 1).padStart(2, "0")}`,
      `Imported group ${i + 1}`,
      "Demo import",
    ]);
    rows[1]![0] = "CG-IMP-01"; // duplicate
    rows[6]![1] = ""; // name missing
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

export type CostItemDraft = Pick<
  CostItemRecord,
  | "code"
  | "name"
  | "localName"
  | "groupId"
  | "serviceIds"
  | "taxEvidence"
  | "currency"
  | "taxTariff"
  | "uomCategory"
  | "uom"
  | "remark"
  | "status"
>;

export const newCostItemDraft = (): CostItemDraft => ({
  code: "",
  name: "",
  localName: "",
  groupId: "",
  serviceIds: [],
  taxEvidence: "",
  currency: "",
  taxTariff: "",
  uomCategory: "",
  uom: "",
  remark: "",
  status: "Active",
});

export const draftOfCostItem = (c: CostItemRecord): CostItemDraft => ({
  code: c.code,
  name: c.name,
  localName: c.localName,
  groupId: c.groupId,
  serviceIds: [...(c.serviceIds ?? [])],
  taxEvidence: c.taxEvidence,
  currency: c.currency,
  taxTariff: c.taxTariff,
  uomCategory: c.uomCategory ?? "",
  uom: c.uom,
  remark: c.remark,
  status: c.status,
});

export function validateCostItem(d: CostItemDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Cost Detail Code is required.";
  else if (!/^[A-Z0-9_-]{2,30}$/.test(code))
    e["code"] = "Use 2–30 characters: letters, digits, - or _.";
  else if (items().some((c) => c.id !== id && c.code.toUpperCase() === code))
    e["code"] = `Cost Detail Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Cost Detail Name is required.";
  if (!d.localName.trim()) e["localName"] = "Local Name is required.";
  if (d.uom && !d.uomCategory) e["uomCategory"] = "Pick a Category UoM first.";
  return e;
}

const joinNames = (ids: string[]) => serviceNames(ids).join(", ");

export const costItemService = {
  save(d: CostItemDraft, id?: string): CostItemRecord {
    const errors = validateCostItem(d, id);
    if (Object.keys(errors).length)
      throw new BusinessRuleError("Please check the highlighted fields.", errors);
    const clean: CostItemDraft = {
      ...d,
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      localName: d.localName.trim(),
      remark: d.remark.trim(),
    };
    const existing = id ? costItemRepository.get(id) : undefined;
    if (!existing) {
      const rec: CostItemRecord = { ...clean, id: uid("CI-"), ...stampCreate() };
      costItemRepository.insert(rec);
      auditService.log({
        action: "CREATE",
        entityType: "Cost",
        entityId: rec.id,
        entityLabel: rec.code,
      });
      return rec;
    }
    const next = stampUpdate({ ...existing, ...clean });
    costItemRepository.update(existing.id, () => next);
    const base = { entityType: "Cost" as const, entityId: next.id, entityLabel: next.code };
    const out: AuditInput[] = [];
    const upd = (action: AuditInput["action"], field: string, a: string, b: string) =>
      a !== b && out.push({ ...base, action, field, oldValue: a || "—", newValue: b || "—" });
    upd("UPDATE", "Cost Detail Code", existing.code, next.code);
    upd("UPDATE", "Cost Detail Name", existing.name, next.name);
    upd("UPDATE", "Local Name", existing.localName, next.localName);
    upd("UPDATE", "Cost Group", groupName(existing.groupId), groupName(next.groupId));
    upd("UPDATE", "Services", joinNames(existing.serviceIds ?? []), joinNames(next.serviceIds));
    upd("UPDATE", "Tax Evidence", existing.taxEvidence, next.taxEvidence);
    upd("UPDATE", "Def Currency", existing.currency, next.currency);
    upd("UPDATE", "Default Tax Tariff", existing.taxTariff, next.taxTariff);
    upd("UPDATE", "Category UoM", existing.uomCategory ?? "", next.uomCategory);
    upd("UPDATE", "Def UoM", existing.uom, next.uom);
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

export const costItemsInGroup = (groupId: string) => items().filter((c) => c.groupId === groupId);
