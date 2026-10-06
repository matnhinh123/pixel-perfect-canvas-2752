// One filtering/sorting engine for every list screen (GEN-06). Quick search, quick filters and
// advanced filter conditions all end up here, so every module behaves the same.
import type { FieldType, FilterCondition, FilterOperator, SortState } from "@/types";
import { normalizeText } from "./routing/MockRouteProvider";

export type CellValue = string | number | null | undefined;

export interface FieldMeta {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  text: ["contains", "eq", "neq"],
  enum: ["eq", "neq"],
  number: ["between", "eq", "neq"],
  date: ["between", "eq"],
};

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: "=",
  neq: "≠",
  contains: "contains",
  between: "between",
};

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

function matches(cell: CellValue, c: FilterCondition, type: FieldType): boolean {
  if (type === "number") {
    const n = typeof cell === "number" ? cell : cell == null || cell === "" ? null : Number(cell);
    if (c.operator === "between") {
      const lo = toNum(c.value),
        hi = toNum(c.value2 ?? "");
      if (n === null || Number.isNaN(n)) return lo === null && hi === null;
      return (lo === null || n >= lo) && (hi === null || n <= hi);
    }
    const target = toNum(c.value);
    if (target === null) return true;
    return c.operator === "eq" ? n === target : n !== target;
  }
  if (type === "date") {
    const d = cell ? String(cell).slice(0, 10) : "";
    if (c.operator === "between") return (!c.value || d >= c.value) && (!c.value2 || d <= c.value2);
    return !c.value || d === c.value;
  }
  const s = normalizeText(String(cell ?? ""));
  const v = normalizeText(c.value);
  if (!v) return true;
  if (c.operator === "contains") return s.includes(v);
  if (c.operator === "eq") return s === v;
  return s !== v;
}

export function applyConditions<T>(
  rows: T[],
  conditions: FilterCondition[],
  fields: FieldMeta[],
  get: (row: T, key: string) => CellValue,
): T[] {
  const active = conditions.filter((c) => c.value !== "" || (c.value2 ?? "") !== "");
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every((c) => {
      const f = fields.find((x) => x.key === c.field);
      return f ? matches(get(r, c.field), c, f.type) : true;
    }),
  );
}

export function applySearch<T>(rows: T[], q: string, searchValues: (row: T) => CellValue[]): T[] {
  const n = normalizeText(q.trim());
  if (!n) return rows;
  return rows.filter((r) =>
    searchValues(r).some((v) => normalizeText(String(v ?? "")).includes(n)),
  );
}

export function applySort<T>(
  rows: T[],
  sort: SortState | null,
  get: (row: T, key: string) => CellValue,
): T[] {
  if (!sort) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key),
      y = get(b, sort.key);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y), "vi") * dir;
  });
}

export const describeCondition = (c: FilterCondition, fields: FieldMeta[]) => {
  const f = fields.find((x) => x.key === c.field);
  const label = f?.label ?? c.field;
  if (c.operator === "between") return `${label} ${c.value || "…"} – ${c.value2 || "…"}`;
  return `${label} ${OPERATOR_LABEL[c.operator]} ${c.value}`;
};
