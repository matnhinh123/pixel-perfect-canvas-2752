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

export function downloadFile(
  fileName: string,
  content: string | Blob,
  mime = "text/csv;charset=utf-8",
) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
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

// ---------- Excel (.xlsx) helpers — exceljs is loaded on first use only ----------
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const loadExcel = async () => (await import("exceljs")).default;

export type FileFormat = "xlsx" | "csv";

/** One-sheet workbook: bold, frozen header row; column widths follow the content. */
export async function toXlsx(headers: string[], rows: unknown[][], sheetName = "Data") {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(headers).font = { bold: true };
  rows.forEach((r) => ws.addRow(r.map((v) => (v == null ? "" : v))));
  ws.columns.forEach((col, i) => {
    const longest = Math.max(
      String(headers[i] ?? "").length,
      ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length),
    );
    col.width = Math.min(60, Math.max(10, longest + 2));
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Cell → text as the user sees it (dates as YYYY-MM-DD, formulas as their result). */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return ymd(v);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((x) => x.text).join("");
    if ("result" in o) return cellText(o.result);
    if (o.text != null) return cellText(o.text);
    return "";
  }
  return String(v);
}

/** First worksheet of an .xlsx file as a table of trimmed-safe strings (blank rows dropped). */
export async function parseXlsx(data: ArrayBuffer): Promise<string[][]> {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
    out.push(cells);
  });
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Reads an uploaded import file (.xlsx or .csv); other types come back empty and fail validation. */
export async function readImportFile(f: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(f.name)) return parseXlsx(await f.arrayBuffer());
  if (/\.csv$/i.test(f.name)) return parseCsv(await f.text());
  return [];
}

/** Downloads a table as Excel (.xlsx) or CSV. `fileBase` has no extension. */
export async function downloadTable(
  fileBase: string,
  headers: string[],
  rows: unknown[][],
  format: FileFormat = "xlsx",
) {
  const fileName = `${fileBase}.${format}`;
  downloadFile(fileName, format === "xlsx" ? await toXlsx(headers, rows) : toCsv(headers, rows));
  return fileName;
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

// ---------- Export ----------
export async function exportView(opts: {
  entityType: EntityType;
  screen: string;
  headers: string[];
  rows: unknown[][];
  scope: string;
  format?: FileFormat;
}) {
  const fileName = await downloadTable(
    `${opts.screen}_${stamp()}`,
    opts.headers,
    opts.rows,
    opts.format ?? "xlsx",
  );
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
  /** Other accepted headers, e.g. the list's own column labels so an exported file imports back. */
  aliases?: string[];
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

export function downloadTemplate(cfg: ImportEntityConfig) {
  return downloadTable(
    `${cfg.screen}_import_template`,
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
  if (!/\.(xlsx|csv)$/i.test(fileName))
    return {
      ...base,
      totalRows: 0,
      structureError: /\.xls$/i.test(fileName)
        ? "Old Excel 97–2003 (.xls) files are not supported. Open the file in Excel and save it as .xlsx."
        : "Unsupported file type. Upload an Excel file (.xlsx) or a CSV file.",
    };
  const [header, ...data] = table;
  if (!header) return { ...base, totalRows: 0, structureError: "File is empty." };
  const norm = header.map((h) => h.trim().toLowerCase());
  // Column position by header or alias; only required columns must be present.
  const indexOf = (c: ImportColumn) =>
    [c.header, ...(c.aliases ?? [])]
      .map((h) => norm.indexOf(h.toLowerCase()))
      .find((i) => i >= 0) ?? -1;
  const missing = cfg.columns.filter((c) => c.required && indexOf(c) < 0);
  if (missing.length)
    return {
      ...base,
      totalRows: data.length,
      structureError: `Missing column(s): ${missing.map((m) => m.header).join(", ")}. Download the template to get the expected structure.`,
    };

  const rows = data.map((cells) =>
    Object.fromEntries(
      cfg.columns.map((c) => {
        const i = indexOf(c);
        return [c.key, i < 0 ? "" : (cells[i] ?? "").trim()];
      }),
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

export function downloadErrorFile(cfg: ImportEntityConfig, v: ImportValidation) {
  return downloadTable(
    `${cfg.screen}_import_errors`,
    ["Row", "Field", "Value", "Error", "Validation step"],
    v.errors.map((e) => [e.row, e.field, e.value, e.error, e.stage]),
  );
}

// ---------- Draft-based import (entities that already have a form draft + validate + save) ----------
type FieldError = { field: string; error: string };

/** Cell → number for a draft; empty → NaN (e.g. optional coordinates). */
export const numCell = (v: string | undefined) => {
  const s = (v ?? "").trim().replace(/\s/g, "");
  return s ? Number(s.replace(",", ".")) : NaN;
};

/** Date cell → YYYY-MM-DD. Accepts YYYY-MM-DD and DD/MM/YYYY (also with - or .); "" if unreadable. */
export function dateCell(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return "";
}

/** Case-insensitive match of a cell against allowed values: canonical value, "" if empty, undefined if unknown. */
export const pick = <T extends string>(
  v: string | undefined,
  allowed: readonly T[],
): T | "" | undefined => {
  const s = (v ?? "").trim().toLowerCase();
  return s ? allowed.find((a) => a.toLowerCase() === s) : "";
};

/** "A; B, C" → ["A", "B", "C"]. */
export const listCell = (v: string | undefined) =>
  (v ?? "")
    .split(/[;,|\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Builds an import config from the entity's own form logic: each row becomes a draft, the form's
 * validate() reports row errors (so import and the detail page enforce the same rules) and save()
 * creates the record with its normal audit entry.
 */
export function draftImportConfig<D>(o: {
  entityType: EntityType;
  screen: string;
  keyColumn: string;
  columns: ImportColumn[];
  existingKeys: () => Set<string>;
  /** Value checks the draft cannot express (unknown dropdown values, unreadable numbers / dates). */
  parseCheck?: (row: Record<string, string>) => FieldError[];
  toDraft: (row: Record<string, string>) => D;
  validate: (d: D) => Record<string, string>;
  /** Draft error key → column key, where they differ. */
  errorColumn?: Record<string, string>;
  save: (d: D) => { id: string };
  rollback: (ids: string[]) => void;
  /** 20 demo rows (a few invalid on purpose). */
  sampleRows: () => string[][];
}): ImportEntityConfig {
  const cfg: ImportEntityConfig = {
    entityType: o.entityType,
    screen: o.screen,
    keyColumn: o.keyColumn,
    columns: o.columns,
    existingKeys: o.existingKeys,
    rowCheck: (r) => {
      const parsed = o.parseCheck?.(r) ?? [];
      if (parsed.length) return parsed;
      return Object.entries(o.validate(o.toDraft(r))).map(([k, error]) => ({
        field: o.errorColumn?.[k] ?? k,
        error,
      }));
    },
    commit: (rows) => {
      const ids: string[] = [];
      for (const r of rows) {
        // A row can still clash with an earlier row of the same file on a secondary unique field
        // (tax code, VIN…); save() rejects it and the row is simply not imported.
        try {
          ids.push(o.save(o.toDraft(r)).id);
        } catch {
          /* skipped */
        }
      }
      return ids;
    },
    rollback: o.rollback,
    sampleFile: () => [o.columns.map((c) => c.header), ...o.sampleRows()],
  };
  return cfg;
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
