import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag, thClass } from "@/components/movex/common";
import { useConfirm } from "./ConfirmDialog";
import {
  commitImport,
  downloadErrorFile,
  readImportFile,
  rollbackImport,
  validateImport,
  type ImportEntityConfig,
  type ImportValidation,
} from "@/services/importExportService";
import { importHistoryRepository } from "@/repositories";
import { useCollection } from "@/hooks/use-store";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "./listLang";

// The template is downloaded from the list header ("Download Template"), so the wizard starts at Upload.
const STEPS = ["Upload file", "Kiểm tra", "Xem kết quả", "Xác nhận import"] as const;
const STEPS_EN = ["Upload file", "Validate", "Review", "Confirm import"];
const CHECKS_EN = [
  "File structure",
  "Required fields",
  "References / master data",
  "Duplicates",
  "Row rules",
];
const CHECKS = [
  "Cấu trúc file",
  "Trường bắt buộc",
  "Tham chiếu / master data",
  "Trùng lặp",
  "Quy tắc từng dòng",
];

/** GEN-05 generic import wizard. Every entity reuses it with its own ImportEntityConfig. */
export function ImportDialog({
  open,
  onOpenChange,
  config,
  entityLabel,
  initialTab = "import",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: ImportEntityConfig;
  entityLabel: string;
  initialTab?: "import" | "history";
}) {
  const { t, en } = useT();
  const [step, setStep] = useState(0);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ImportValidation | null>(null);
  const [done, setDone] = useState<{ success: number; failed: number; status: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const history = useCollection(importHistoryRepository);
  const batches = useMemo(
    () =>
      history
        .filter((b) => b.entityType === config.entityType)
        .sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    [history, config.entityType],
  );

  const reset = () => {
    setStep(0);
    setResult(null);
    setDone(null);
    setValidating(false);
  };
  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const runValidation = (fileName: string, table: string[][]) => {
    setStep(1);
    setValidating(true);
    setTimeout(() => {
      setResult(validateImport(config, fileName, table));
      setValidating(false);
      setStep(2);
    }, 700);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    let table: string[][];
    try {
      table = await readImportFile(f);
    } catch {
      toast.error(
        t(
          `Không đọc được file "${f.name}". Hãy mở bằng Excel và lưu lại dạng .xlsx.`,
          `Could not read "${f.name}". Open it in Excel and save it again as .xlsx.`,
        ),
      );
      return;
    }
    runValidation(f.name, table);
  };

  const doImport = () => {
    if (!result) return;
    const b = commitImport(config, result);
    setDone({ success: b.successRows, failed: b.failedRows, status: b.status });
    setStep(3);
    if (b.successRows)
      toast.success(
        t(
          `Đã import ${b.successRows} bản ghi ${entityLabel}${b.failedRows ? `, ${b.failedRows} dòng bị loại` : ""}`,
          `Imported ${b.successRows} ${entityLabel} record(s)${b.failedRows ? `, ${b.failedRows} row(s) rejected` : ""}`,
        ),
      );
    else toast.error(t("Không có dòng nào được import.", "No rows were imported."));
  };

  const rollback = async (id: string, name: string) => {
    const r = await confirm({
      title: t("Rollback lần import này?", "Roll back this import?"),
      description: t(
        `Toàn bộ bản ghi tạo bởi "${name}" sẽ bị gỡ (soft delete). Thao tác được ghi vào audit log.`,
        `All records created by "${name}" will be removed (soft delete). This is written to the audit log.`,
      ),
      cancelLabel: t("Huỷ", "Cancel"),
      confirmLabel: "Rollback",
      tone: "danger",
    });
    if (r !== "confirm") return;
    try {
      rollbackImport(config, id);
      toast.success(t("Đã rollback lần import", "Import rolled back"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    }
  };

  const validCount = result?.validRows.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import {entityLabel}</DialogTitle>
          <DialogDescription>
            {t(
              "Import file Excel (.xlsx) hoặc CSV với 5 bước kiểm tra. Dòng lỗi không bao giờ bị import âm thầm.",
              "Import an Excel (.xlsx) or CSV file with 5 validation steps. Invalid rows are never imported silently.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="history">
              {t("Lịch sử import", "Import history")} ({batches.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-4">
            <ol className="mb-5 grid grid-cols-4 gap-2">
              {(en ? STEPS_EN : STEPS).map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs",
                    i === step
                      ? "border-primary bg-accent text-accent-foreground"
                      : i < step
                        ? "border-success/40 text-success"
                        : "text-muted-foreground",
                  )}
                >
                  <div className="font-bold">Step {i + 1}</div>
                  <div className="font-medium">{s}</div>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div>
                <div className="rounded-lg border border-dashed p-4">
                  <div className="mb-1 text-sm font-semibold">Upload file Excel</div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t("Các cột:", "Columns:")}{" "}
                    {config.columns.map((c) => `${c.header}${c.required ? "*" : ""}`).join(", ")}
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {t("Chấp nhận file Excel", "Accepts Excel")} <b>.xlsx</b> {t("hoặc", "or")}{" "}
                    <b>.csv</b>{" "}
                    {t(
                      "(đọc sheet đầu tiên, dòng 1 là tiêu đề cột).",
                      "(first sheet, row 1 = column headers).",
                    )}
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      {t("Chọn file…", "Choose file…")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        runValidation(`${config.screen}_sample_20rows.xlsx`, config.sampleFile())
                      }
                    >
                      {t("Dùng file demo (20 dòng)", "Use demo file (20 rows)")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="rounded-lg border p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {t("Đang kiểm tra…", "Validating…")}
                </div>
                <ol className="space-y-1 text-sm text-muted-foreground">
                  {(en ? CHECKS_EN : CHECKS).map((c, i) => (
                    <li key={c}>
                      {i + 1}. {c}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {step === 2 && result && !validating && (
              <div className="flex flex-col gap-4">
                {result.structureError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-danger-soft p-4 text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    <div>
                      <div className="font-semibold text-destructive">
                        {t("Cấu trúc file không hợp lệ", "Invalid file structure")} —{" "}
                        {result.fileName}
                      </div>
                      <div>{result.structureError}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">
                          {t("Tổng số dòng", "Total rows")}
                        </div>
                        <div className="text-xl font-bold">{result.totalRows}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">{t("Hợp lệ", "Valid")}</div>
                        <div className="text-xl font-bold text-success">{validCount}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">{t("Lỗi", "Errors")}</div>
                        <div className="text-xl font-bold text-destructive">
                          {result.invalidRowCount}
                        </div>
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            {t("Danh sách lỗi", "Errors")} ({result.errors.length})
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadErrorFile(config, result)}
                          >
                            <Download className="h-4 w-4" />
                            {t("Tải file lỗi", "Download error file")}
                          </Button>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {(en
                                  ? ["Row", "Field", "Value", "Error", "Step"]
                                  : ["Dòng", "Trường", "Giá trị", "Lỗi", "Bước"]
                                ).map((h) => (
                                  <TableHead key={h} className={thClass}>
                                    {h}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.errors.map((e, i) => (
                                <TableRow key={i}>
                                  <TableCell>{e.row}</TableCell>
                                  <TableCell className="font-medium">{e.field}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {e.value || "(empty)"}
                                  </TableCell>
                                  <TableCell className="text-destructive">{e.error}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {e.stage}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                    {result.invalidRowCount > 0 && validCount > 0 && (
                      <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                        {t(
                          `Partial Success: chỉ ${validCount} dòng hợp lệ được import. Sửa file lỗi và import phần còn lại sau.`,
                          `Partial success: only ${validCount} valid rows will be imported. Fix the error file and import the rest later.`,
                        )}
                      </p>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset}>
                    {t("Upload file khác", "Upload another file")}
                  </Button>
                  <Button disabled={!!result.structureError || validCount === 0} onClick={doImport}>
                    Confirm Import {validCount > 0 ? `(${validCount} rows)` : ""}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && done && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <div className="text-lg font-semibold">{done.status}</div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    `${done.success} dòng đã import · ${done.failed} dòng bị loại. Danh sách đã được cập nhật; lần import được ghi vào Audit Log và Lịch sử import.`,
                    `${done.success} rows imported · ${done.failed} rows rejected. The list is updated; this import is in the Audit Log and Import history.`,
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" onClick={reset}>
                    {t("Import file khác", "Import another file")}
                  </Button>
                  <Button onClick={() => close(false)}>Xong</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      t("Tên file", "File name"),
                      t("Đối tượng", "Entity"),
                      t("Người import", "Imported by"),
                      t("Thời gian", "Time"),
                      t("Tổng", "Total"),
                      t("Thành công", "Success"),
                      t("Lỗi", "Errors"),
                      t("Trạng thái", "Status"),
                      "",
                    ].map((h) => (
                      <TableHead key={h} className={thClass}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.fileName}</TableCell>
                      <TableCell>{b.entityType}</TableCell>
                      <TableCell>{b.importedBy}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(b.importedAt)}
                      </TableCell>
                      <TableCell>{b.totalRows}</TableCell>
                      <TableCell className="text-success">{b.successRows}</TableCell>
                      <TableCell className="text-destructive">{b.failedRows}</TableCell>
                      <TableCell>
                        <Tag>{b.status}</Tag>
                      </TableCell>
                      <TableCell>
                        {b.rollbackable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void rollback(b.id, b.fileName)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Rollback
                          </Button>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Only batches imported in this demo with created records can be rolled back"
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {batches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        {t("Chưa có lần import nào.", "No imports yet.")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
