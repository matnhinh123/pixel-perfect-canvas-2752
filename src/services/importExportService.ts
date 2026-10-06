// GEN-05 Import / Export — shared by every entity. Entities only provide an ImportEntityConfig.
import type { EntityType, ImportBatch, ImportStatus } from "@/types";
import { importHistoryRepository, uid } from "@/repositories";
import { auditService } from "./auditService";
import { currentUser } from "./session";

// ---------- CSV helpers (Excel-compatible: UTF-8 BOM, quoted) ----------
const BOM = String.fromCharCode(0xfeff);
const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (headers: string[], rows: unknown[][]) =>
  BOM + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

export function downloadFile(fileName: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQ) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

// ---------- Export ----------
export function exportView(opts: {
  entityType: EntityType;
  screen: string;
  headers: string[];
  rows: unknown[][];
  scope: string;
}) {
  const fileName = `${opts.screen}_${stamp()}.csv`;
  downloadFile(fileName, toCsv(opts.headers, opts.rows));
  auditService.log({
    action: "EXPORT",
    entityType: opts.entityType,
    entityId: "*",
    entityLabel: `${opts.entityType} list`,
    note: `${opts.rows.length} rows · ${opts.headers.length} columns · ${opts.scope} → ${fileName}`,
  });
  return fileName;
}

// ---------- Import ----------
export type ImportStage = "File structure" | "Required" | "Reference" | "Duplicate" | "Row";

export interface ImportError {
  row: number; // 1-based data row number as shown in Excel (header = row 1)
  field: string;
  value: string;
  error: string;
  stage: ImportStage;
}

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example?: string;
}

export interface ImportEntityConfig {
  entityType: EntityType;
  screen: string;
  columns: ImportColumn[];
  /** Column whose value must be unique (within the file and against existing data). */
  keyColumn: string;
  existingKeys: () => Set<string>;
  referenceCheck?: (row: Record<string, string>) => { field: string; error: string }[];
  rowCheck?: (row: Record<string, string>) => { field: string; error: string }[];
  /** Persist valid rows, return created record ids (used for rollback). */
  commit: (rows: Record<string, string>[]) => string[];
  rollback: (ids: string[]) => void;
  /** A ready-made 20-row demo file (2 rows invalid) so the flow can be shown without preparing data. */
  sampleFile: () => string[][];
}

export interface ImportValidation {
  fileName: string;
  totalRows: number;
  validRows: Record<string, string>[];
  errors: ImportError[];
  invalidRowCount: number;
  structureError: string | null;
}

export function templateCsv(cfg: ImportEntityConfig) {
  return toCsv(
    cfg.columns.map((c) => c.header),
    [cfg.columns.map((c) => c.example ?? "")],
  );
}

export function validateImport(
  cfg: ImportEntityConfig,
  fileName: string,
  table: string[][],
): ImportValidation {
  const base = { fileName, validRows: [], errors: [] as ImportError[], invalidRowCount: 0 };
  // 1. File structure
  if (!/\.csv$/i.test(fileName))
    return {
      ...base,
      totalRows: 0,
      structureError:
        "Unsupported file type. This demo accepts .csv exported from Excel (File → Save As → CSV UTF-8).",
    };
  const [header, ...data] = table;
  if (!header) return { ...base, totalRows: 0, structureError: "File is empty." };
  const norm = header.map((h) => h.trim().toLowerCase());
  const missing = cfg.columns.filter((c) => !norm.includes(c.header.toLowerCase()));
  if (missing.length)
    return {
      ...base,
      totalRows: data.length,
      structureError: `Missing column(s): ${missing.map((m) => m.header).join(", ")}. Download the template to get the expected structure.`,
    };

  const rows = data.map((cells) =>
    Object.fromEntries(
      cfg.columns.map((c) => [c.key, (cells[norm.indexOf(c.header.toLowerCase())] ?? "").trim()]),
    ),
  );
  const headerOf = (key: string) => cfg.columns.find((c) => c.key === key)?.header ?? key;
  const existing = cfg.existingKeys();
  const seen = new Map<string, number>();
  const errors: ImportError[] = [];
  const valid: Record<string, string>[] = [];

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const rowErrors: ImportError[] = [];
    const push = (stage: ImportStage, key: string, error: string) =>
      rowErrors.push({ row: rowNo, field: headerOf(key), value: r[key] ?? "", error, stage });
    // 2. Required
    cfg.columns
      .filter((c) => c.required && !r[c.key])
      .forEach((c) => push("Required", c.key, "Required field is empty"));
    // 3. Reference / master data
    if (rowErrors.length === 0)
      cfg.referenceCheck?.(r).forEach((e) => push("Reference", e.field, e.error));
    // 4. Duplicate
    const k = (r[cfg.keyColumn] ?? "").toLowerCase();
    if (k) {
      if (existing.has(k))
        push(
          "Duplicate",
          cfg.keyColumn,
          `Duplicate ${headerOf(cfg.keyColumn).toLowerCase()} (already exists)`,
        );
      else if (seen.has(k))
        push(
          "Duplicate",
          cfg.keyColumn,
          `Duplicate ${headerOf(cfg.keyColumn).toLowerCase()} (same as row ${seen.get(k)})`,
        );
      else seen.set(k, rowNo);
    }
    // 5. Row-level business rules
    if (rowErrors.length === 0) cfg.rowCheck?.(r).forEach((e) => push("Row", e.field, e.error));
    if (rowErrors.length) errors.push(...rowErrors);
    else valid.push(r);
  });

  return {
    ...base,
    totalRows: rows.length,
    validRows: valid,
    errors,
    invalidRowCount: rows.length - valid.length,
    structureError: null,
  };
}

export function errorFileCsv(v: ImportValidation) {
  return toCsv(
    ["Row", "Field", "Value", "Error", "Validation step"],
    v.errors.map((e) => [e.row, e.field, e.value, e.error, e.stage]),
  );
}

export function commitImport(cfg: ImportEntityConfig, v: ImportValidation): ImportBatch {
  const ids = v.validRows.length ? cfg.commit(v.validRows) : [];
  const status: ImportStatus =
    ids.length === 0 ? "Failed" : v.invalidRowCount > 0 ? "Partial Success" : "Success";
  const batch: ImportBatch = {
    id: uid("IMP-"),
    fileName: v.fileName,
    entityType: cfg.entityType,
    importedBy: currentUser.name,
    importedAt: new Date().toISOString(),
    totalRows: v.totalRows,
    successRows: ids.length,
    failedRows: v.invalidRowCount,
    status,
    createdIds: ids,
    rollbackable: ids.length > 0,
  };
  importHistoryRepository.insert(batch);
  auditService.log({
    action: "IMPORT",
    entityType: cfg.entityType,
    entityId: batch.id,
    entityLabel: v.fileName,
    note: `${status}: ${ids.length}/${v.totalRows} rows imported, ${v.invalidRowCount} rejected`,
  });
  return batch;
}

export function rollbackImport(cfg: ImportEntityConfig, batchId: string) {
  const b = importHistoryRepository.get(batchId);
  if (!b || !b.rollbackable) throw new Error("This batch cannot be rolled back.");
  cfg.rollback(b.createdIds);
  importHistoryRepository.update(batchId, (x) => ({
    ...x,
    status: "Rolled Back",
    rollbackable: false,
  }));
  auditService.log({
    action: "ROLLBACK",
    entityType: cfg.entityType,
    entityId: batchId,
    entityLabel: b.fileName,
    note: `${b.createdIds.length} records removed`,
  });
}
