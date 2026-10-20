// Master Data > Cost: Cost Group CRUD (create/edit/status) and Cost items (read + status only for now).
import type { CostGroupRecord, CostItemRecord } from "@/types";
import { costGroupRepository, costItemRepository, serviceRepository, uid } from "@/repositories";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, makeCrud, stampCreate, stampUpdate } from "./crudService";
import { draftImportConfig, listCell, pick, type ImportEntityConfig } from "./importExportService";
import { codeOptions } from "./commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import {
  COST_CURRENCIES,
  COST_TAX_EVIDENCES,
  COST_TAX_TARIFFS,
  COST_UNITS,
} from "@/mock-data/costMaster";

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
    const kids = groups().filter((x) => x.parentId === g.id).length;
    const used = items().filter((c) => c.group === g.name).length;
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

export type CostItemDraft = Pick<
  CostItemRecord,
  | "code"
  | "name"
  | "localName"
  | "group"
  | "subGroup"
  | "serviceIds"
  | "taxEvidence"
  | "currency"
  | "taxTariff"
  | "unit"
  | "remark"
  | "status"
>;

export const newCostItemDraft = (): CostItemDraft => ({
  code: "",
  name: "",
  localName: "",
  group: "",
  subGroup: "",
  serviceIds: [],
  taxEvidence: "",
  currency: "",
  taxTariff: "",
  unit: "",
  remark: "",
  status: "Active",
});

export const draftOfCostItem = (c: CostItemRecord): CostItemDraft => ({
  code: c.code,
  name: c.name,
  localName: c.localName,
  group: c.group ?? "",
  subGroup: c.subGroup ?? "",
  serviceIds: [...(c.serviceIds ?? [])],
  taxEvidence: c.taxEvidence,
  currency: c.currency,
  taxTariff: c.taxTariff,
  unit: c.unit ?? "",
  remark: c.remark,
  status: c.status,
});

export function validateCostItem(d: CostItemDraft, id?: string): Record<string, string> {
  const e: Record<string, string> = {};
  const code = d.code.trim().toUpperCase();
  if (!code) e["code"] = "Fare Code is required.";
  else if (!/^[A-Z0-9_-]{2,30}$/.test(code))
    e["code"] = "Use 2–30 characters: letters, digits, - or _.";
  else if (items().some((c) => c.id !== id && c.code.toUpperCase() === code))
    e["code"] = `Fare Code ${code} already exists.`;
  if (!d.name.trim()) e["name"] = "Fare Name is required.";
  if (!d.group.trim()) e["group"] = "Group Name is required.";
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
      group: d.group.trim(),
      subGroup: d.subGroup.trim(),
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
    upd("UPDATE", "Fare Code", existing.code, next.code);
    upd("UPDATE", "Fare Name", existing.name, next.name);
    upd("UPDATE", "Local Name", existing.localName, next.localName);
    upd("UPDATE", "Group Name", existing.group ?? "", next.group);
    upd("UPDATE", "Sub Group Name", existing.subGroup ?? "", next.subGroup);
    upd("UPDATE", "Services", joinNames(existing.serviceIds ?? []), joinNames(next.serviceIds));
    upd("UPDATE", "Tax Evidence", existing.taxEvidence, next.taxEvidence);
    upd("UPDATE", "Default Currency", existing.currency, next.currency);
    upd("UPDATE", "Default Tax Tariff", existing.taxTariff, next.taxTariff);
    upd("UPDATE", "Default Unit", existing.unit ?? "", next.unit);
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

/** Sub groups already used by Cost Details (suggestions for the Sub Group field). */
export const usedSubGroups = (list: CostItemRecord[] = items()) =>
  [...new Set(list.map((c) => (c.subGroup ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

/** Cost Group suggestions: the sample groups plus every group a Cost Detail already uses. */
export const usedGroups = (list: CostItemRecord[] = items()) =>
  [
    ...new Set([
      ...groups().map((g) => g.name),
      ...list.map((c) => (c.group ?? "").trim()).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------- Fare Code import

const STATUSES = ["Active", "Inactive"] as const;
const liveServices = () => serviceRepository.all().filter((x) => !x.deleted);
const serviceIdOf = (name: string) =>
  liveServices().find((x) => x.name.toLowerCase() === name.toLowerCase())?.id;
const choices = () => ({
  taxEvidence: codeOptions(CC.TAX_EVIDENCE, COST_TAX_EVIDENCES),
  taxTariff: codeOptions(CC.TAX_TARIFF, COST_TAX_TARIFFS),
  unit: codeOptions(CC.UOM, COST_UNITS),
  currency: COST_CURRENCIES,
});

const costItemDraftOfRow = (r: Record<string, string>): CostItemDraft => {
  const c = choices();
  return {
    code: (r["code"] ?? "").trim().toUpperCase(),
    name: (r["name"] ?? "").trim(),
    localName: (r["localName"] ?? "").trim(),
    group: (r["group"] ?? "").trim(),
    subGroup: (r["subGroup"] ?? "").trim(),
    serviceIds: listCell(r["services"])
      .map(serviceIdOf)
      .filter((id): id is string => !!id),
    taxEvidence: pick(r["taxEvidence"], c.taxEvidence) || "",
    currency: pick(r["currency"], c.currency) || "",
    taxTariff: pick(r["taxTariff"], c.taxTariff) || "",
    unit: pick(r["unit"], c.unit) || "",
    remark: (r["remark"] ?? "").trim(),
    status: pick(r["status"], STATUSES) || "Active",
  };
};

/** Headers = the list's column labels, so an exported file imports back. */
export const costItemImportConfig = draftImportConfig<CostItemDraft>({
  entityType: "Cost",
  screen: "fare-code",
  keyColumn: "code",
  columns: [
    { key: "code", header: "Fare Code", required: true, example: "THC" },
    {
      key: "name",
      header: "Fare Name (EN)",
      required: true,
      example: "TERMINAL HANDLING CHARGE",
      aliases: ["Fare Name"],
    },
    { key: "localName", header: "Local Name", example: "PHÍ XẾP DỠ TẠI CẢNG" },
    { key: "group", header: "Group Name", required: true, example: "Freight Fee" },
    { key: "subGroup", header: "Sub Group Name", example: "Port" },
    { key: "unit", header: "Default Unit", example: "Container" },
    { key: "currency", header: "Default Currency", example: "VND" },
    { key: "taxTariff", header: "Default Tax Tariff", example: "8%" },
    { key: "taxEvidence", header: "Tax Evidence", example: "VAT Invoice" },
    { key: "services", header: "Services", example: "" },
    { key: "status", header: "Status", example: "Active" },
    { key: "remark", header: "Remark", example: "" },
  ],
  existingKeys: () => new Set(items().map((c) => c.code.toLowerCase())),
  parseCheck: (r) => {
    const c = choices();
    const e: { field: string; error: string }[] = [];
    for (const k of ["unit", "currency", "taxTariff", "taxEvidence"] as const)
      if (pick(r[k], c[k]) === undefined)
        e.push({ field: k, error: `Use one of: ${c[k].join(", ")}` });
    if (pick(r["status"], STATUSES) === undefined)
      e.push({ field: "status", error: "Active or Inactive (empty = Active)" });
    const unknown = listCell(r["services"]).filter((n) => !serviceIdOf(n));
    if (unknown.length)
      e.push({ field: "services", error: `Service not found: ${unknown.join(", ")}` });
    return e;
  },
  toDraft: costItemDraftOfRow,
  validate: (d) => validateCostItem(d),
  save: (d) => costItemService.save(d),
  rollback: (ids) => costItemCrud.removeMany(ids),
  sampleRows: () => {
    const groups = [
      "Freight Fee",
      "Warehouse",
      "Vehicle Operation",
      "Vehicle Investment",
      "Customs",
    ];
    const units = ["Container", "Trip", "Shipment", "Pallet", "Kg"];
    const rows = Array.from({ length: 20 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return [
        `IMP${n}`,
        `IMPORTED FARE ${n}`,
        `Phí nhập mẫu ${n}`,
        groups[i % groups.length]!,
        "",
        units[i % units.length]!,
        i % 4 === 0 ? "USD" : "VND",
        i % 3 === 0 ? "10%" : "8%",
        "VAT Invoice",
        "",
        "Active",
        "Demo import",
      ];
    });
    rows[4]![0] = "IMP01"; // duplicate in the file
    rows[9]![6] = "ABC"; // unknown currency
    return rows;
  },
});
