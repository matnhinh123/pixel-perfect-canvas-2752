import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
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
  downloadFile,
  errorFileCsv,
  parseCsv,
  rollbackImport,
  templateCsv,
  toCsv,
  validateImport,
  type ImportEntityConfig,
  type ImportValidation,
} from "@/services/importExportService";
import { importHistoryRepository } from "@/repositories";
import { useCollection } from "@/hooks/use-store";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = [
  "Download Template",
  "Upload File",
  "Validate",
  "Preview Result",
  "Confirm Import",
] as const;
const CHECKS = [
  "File structure",
  "Required fields",
  "Reference / master data",
  "Duplicate",
  "Row-level rules",
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
    setStep(2);
    setValidating(true);
    setTimeout(() => {
      setResult(validateImport(config, fileName, table));
      setValidating(false);
      setStep(3);
    }, 700);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = /\.csv$/i.test(f.name) ? await f.text() : "";
    runValidation(f.name, parseCsv(text));
  };

  const doImport = () => {
    if (!result) return;
    const b = commitImport(config, result);
    setDone({ success: b.successRows, failed: b.failedRows, status: b.status });
    setStep(4);
    if (b.successRows)
      toast.success(
        `Imported ${b.successRows} ${entityLabel.toLowerCase()} record(s)${b.failedRows ? `, ${b.failedRows} rejected` : ""}`,
      );
    else toast.error("No rows were imported.");
  };

  const rollback = async (id: string, name: string) => {
    const r = await confirm({
      title: "Rollback import?",
      description: `All records created by "${name}" will be removed (soft delete). This is recorded in the audit log.`,
      confirmLabel: "Rollback",
      tone: "danger",
    });
    if (r !== "confirm") return;
    try {
      rollbackImport(config, id);
      toast.success("Import batch rolled back");
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
            Excel-compatible CSV import with 5-step validation. Invalid rows are never imported
            silently.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={initialTab}>
          <TabsList>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="history">Import History ({batches.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-4">
            <ol className="mb-5 grid grid-cols-5 gap-2">
              {STEPS.map((s, i) => (
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

            {step <= 1 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="mb-1 text-sm font-semibold">1. Download Template</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Columns:{" "}
                    {config.columns.map((c) => `${c.header}${c.required ? "*" : ""}`).join(", ")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        downloadFile(`${config.screen}_import_template.csv`, templateCsv(config));
                        setStep(1);
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download Template
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const [h, ...rows] = config.sampleFile();
                        downloadFile(`${config.screen}_sample_20rows.csv`, toCsv(h!, rows));
                      }}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Sample file (20 rows)
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed p-4">
                  <div className="mb-1 text-sm font-semibold">2. Upload Excel file</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Save your Excel sheet as <b>CSV UTF-8</b> and upload it here.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      Choose file…
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        runValidation(`${config.screen}_sample_20rows.csv`, config.sampleFile())
                      }
                    >
                      Use demo file (20 rows)
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="rounded-lg border p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Validating…
                </div>
                <ol className="space-y-1 text-sm text-muted-foreground">
                  {CHECKS.map((c, i) => (
                    <li key={c}>
                      {i + 1}. {c}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {step === 3 && result && !validating && (
              <div className="flex flex-col gap-4">
                {result.structureError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-danger-soft p-4 text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    <div>
                      <div className="font-semibold text-destructive">
                        File structure invalid — {result.fileName}
                      </div>
                      <div>{result.structureError}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Total rows</div>
                        <div className="text-xl font-bold">{result.totalRows}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Valid</div>
                        <div className="text-xl font-bold text-success">{validCount}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Invalid</div>
                        <div className="text-xl font-bold text-destructive">
                          {result.invalidRowCount}
                        </div>
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            Errors ({result.errors.length})
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              downloadFile(
                                `${config.screen}_import_errors.csv`,
                                errorFileCsv(result),
                              )
                            }
                          >
                            <Download className="h-4 w-4" />
                            Download Error File
                          </Button>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {["Row", "Field", "Value", "Error", "Step"].map((h) => (
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
                        Partial Success: only the {validCount} valid rows will be imported. Fix the
                        error file and import the rest later.
                      </p>
                    )}
                  </>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset}>
                    Upload another file
                  </Button>
                  <Button disabled={!!result.structureError || validCount === 0} onClick={doImport}>
                    Confirm Import {validCount > 0 ? `(${validCount} rows)` : ""}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && done && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <div className="text-lg font-semibold">{done.status}</div>
                <p className="text-sm text-muted-foreground">
                  {done.success} imported · {done.failed} rejected. The list has been updated and
                  the import is recorded in Audit Log and Import History.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" onClick={reset}>
                    Import another file
                  </Button>
                  <Button onClick={() => close(false)}>Done</Button>
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
                      "File Name",
                      "Entity",
                      "Imported By",
                      "Imported At",
                      "Total",
                      "Success",
                      "Failed",
                      "Status",
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
                        No imports yet.
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
