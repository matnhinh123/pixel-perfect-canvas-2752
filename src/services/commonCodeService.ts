// Common Code: option lists behind the dropdowns. Screens read the active options of a type through
// `useCodeOptions`; a value already stored on a record stays selectable even if it was deactivated.
import { useMemo } from "react";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository } from "@/repositories";
import type { CommonCodeOption, CommonCodeRecord } from "@/types";
import { tr } from "@/lib/i18n";
import { auditService, type AuditInput } from "./auditService";
import { BusinessRuleError, stampUpdate } from "./crudService";

const activeNames = (rec: CommonCodeRecord | undefined) =>
  rec?.options.filter((o) => o.active && o.name.trim()).map((o) => o.name.trim());

/** Active option names of a type (outside React). Falls back when the type is unknown. */
export function codeOptions(typeCode: string, fallback: readonly string[] = []): string[] {
  return activeNames(commonCodeRepository.get(typeCode)) ?? [...fallback];
}

/** Adds stored values that are no longer offered, so editing a record never loses its value. */
export function withCurrent(options: readonly string[], ...current: (string | undefined)[]) {
  const extra = current.filter((v): v is string => !!v && !options.includes(v));
  return extra.length ? [...options, ...extra] : [...options];
}

/** Active options of a type, live (re-renders when Common Code changes). */
export function useCodeOptions(typeCode: string, fallback: readonly string[] = []): string[] {
  const all = useCollection(commonCodeRepository);
  return useMemo(
    () => activeNames(all.find((r) => r.id === typeCode)) ?? [...fallback],
    // `fallback` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, typeCode],
  );
}

/** Active options of a dependent list whose attribute is `parent` (e.g. sub types of one Location Type). */
export function useCodeOptionsOf(
  typeCode: string,
  parent: string,
  fallback: readonly string[] = [],
): string[] {
  const all = useCollection(commonCodeRepository);
  return useMemo(() => {
    const rec = all.find((r) => r.id === typeCode);
    if (!rec) return [...fallback];
    return rec.options
      .filter((o) => o.active && o.name.trim() && o.attribute === parent)
      .map((o) => o.name.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, typeCode, parent]);
}

/** Next option code of a type, e.g. BP0205. */
export function nextOptionCode(typeCode: string, options: CommonCodeOption[]): string {
  const used = options
    .map((o) => Number(o.code.slice(typeCode.length)))
    .filter((n) => Number.isFinite(n));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  return `${typeCode}${String(n).padStart(2, "0")}`;
}

export type CommonCodeDraft = Pick<CommonCodeRecord, "remark" | "options">;

export function validateCommonCode(rec: CommonCodeRecord, d: CommonCodeDraft) {
  const e: Record<string, string> = {};
  const seen = new Map<string, number>();
  d.options.forEach((o, i) => {
    const name = o.name.trim();
    if (!name) {
      e["options"] ??= tr(`Dòng ${i + 1}: nhập Name.`, `Row ${i + 1}: Name is required.`);
      return;
    }
    const k = name.toLowerCase();
    if (seen.has(k))
      e["options"] ??= tr(
        `Dòng ${i + 1}: "${name}" trùng với dòng ${seen.get(k)! + 1}.`,
        `Row ${i + 1}: "${name}" duplicates row ${seen.get(k)! + 1}.`,
      );
    seen.set(k, i);
  });
  if (!d.options.some((o) => o.active))
    e["options"] ??= tr(
      "Cần ít nhất một lựa chọn đang Active.",
      "At least one option must be active.",
    );
  if (rec.kind === "Fixed") {
    // Fixed lists: same options, same names — only Active / Remark / Attribute may change.
    const before = new Map(rec.options.map((o) => [o.code, o.name]));
    const changed =
      d.options.length !== rec.options.length ||
      d.options.some((o) => before.get(o.code) !== o.name);
    if (changed)
      e["options"] = tr(
        "Danh sách cố định: chỉ được bật / tắt lựa chọn.",
        "Fixed list: options can only be activated or deactivated.",
      );
  }
  return e;
}

export const commonCodeService = {
  save(id: string, d: CommonCodeDraft): CommonCodeRecord {
    const rec = commonCodeRepository.get(id);
    if (!rec) throw new Error("Common code not found");
    const clean: CommonCodeDraft = {
      remark: d.remark.trim(),
      options: d.options.map((o) => ({ ...o, name: o.name.trim(), remark: o.remark.trim() })),
    };
    const errors = validateCommonCode(rec, clean);
    if (Object.keys(errors).length)
      throw new BusinessRuleError(
        tr("Vui lòng kiểm tra danh sách lựa chọn.", "Please check the options."),
        errors,
      );
    const next = stampUpdate({ ...rec, ...clean });
    commonCodeRepository.update(id, () => next);

    const base = { entityType: "Common Code" as const, entityId: id, entityLabel: rec.code };
    const out: AuditInput[] = [];
    if (rec.remark !== next.remark)
      out.push({
        ...base,
        action: "UPDATE",
        field: "Remark",
        oldValue: rec.remark || "—",
        newValue: next.remark || "—",
      });
    const old = new Map(rec.options.map((o) => [o.code, o]));
    for (const o of next.options) {
      const p = old.get(o.code);
      if (!p) {
        out.push({
          ...base,
          action: "UPDATE",
          field: `Option ${o.code} added`,
          oldValue: "—",
          newValue: o.name,
        });
        continue;
      }
      if (p.name !== o.name)
        out.push({
          ...base,
          action: "UPDATE",
          field: `${o.code} › Name`,
          oldValue: p.name,
          newValue: o.name,
        });
      if (p.active !== o.active)
        out.push({
          ...base,
          action: o.active ? "ACTIVATE" : "DEACTIVATE",
          field: `${o.code} › Active`,
          oldValue: p.active ? "Yes" : "No",
          newValue: o.active ? "Yes" : "No",
        });
      if (p.remark !== o.remark)
        out.push({
          ...base,
          action: "UPDATE",
          field: `${o.code} › Remark`,
          oldValue: p.remark || "—",
          newValue: o.remark || "—",
        });
    }
    for (const p of rec.options)
      if (!next.options.some((o) => o.code === p.code))
        out.push({
          ...base,
          action: "UPDATE",
          field: `Option ${p.code} removed`,
          oldValue: p.name,
          newValue: "—",
        });
    auditService.logMany(out);
    return next;
  },
};
