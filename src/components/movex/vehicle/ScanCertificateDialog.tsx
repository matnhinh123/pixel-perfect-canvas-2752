import { useEffect, useState } from "react";
import { FileImage, Loader2, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  readCertificate,
  parseInspectionCertificate,
  SAMPLE_CERTIFICATE_TEXT,
  SCAN_FIELDS,
  SCAN_LABELS,
  type ScanField,
  type ScanResult,
} from "@/services/inspectionOcr";
import { showsField, type VehicleDraft } from "@/services/vehicleMasterService";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Phase = "pick" | "reading" | "review";

/**
 * Scan of the inspection certificate: pick a photo / scan of the certificate, OCR it in the
 * browser, review what was read next to the current values, then fill the ticked fields.
 */
export function ScanCertificateDialog({
  open,
  onOpenChange,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: VehicleDraft;
  onApply: (p: Partial<VehicleDraft>) => void;
}) {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [raw, setRaw] = useState("");
  const [values, setValues] = useState<ScanResult>({});
  const [ticked, setTicked] = useState<Set<ScanField>>(new Set());

  // Fresh start each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setPreview("");
    setProgress(0);
    setError("");
    setRaw("");
    setValues({});
  }, [open]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const review = (text: string) => {
    const found = parseInspectionCertificate(text);
    const type = found.vehicleType || current.vehicleType;
    setRaw(text);
    setValues(found);
    // Tick what was read, differs from the form and applies to the vehicle type.
    setTicked(
      new Set(
        SCAN_FIELDS.filter(
          (k) =>
            found[k] &&
            found[k] !== String(current[k] ?? "") &&
            (k === "vehicleType" || !type || showsField(type, k)),
        ),
      ),
    );
    setPhase("review");
  };

  const scan = async (file: File) => {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf && !file.type.startsWith("image/")) {
      setError(
        t(
          "Chọn file PDF hoặc ảnh chụp / ảnh scan (JPG, PNG) của giấy kiểm định.",
          "Pick a PDF or a photo / scan (JPG, PNG) of the certificate.",
        ),
      );
      return;
    }
    setError("");
    setPreview(isPdf ? "" : URL.createObjectURL(file));
    setPhase("reading");
    setProgress(0);
    try {
      const text = await readCertificate(file, (p, s) => {
        setProgress(p);
        setStep(s);
      });
      review(text);
    } catch (e) {
      setPhase("pick");
      setError(
        t(
          `Không đọc được ảnh (${e instanceof Error ? e.message : "OCR"}). Kiểm tra kết nối mạng hoặc thử ảnh rõ hơn.`,
          `Could not read the image (${e instanceof Error ? e.message : "OCR"}). Check the connection or try a sharper image.`,
        ),
      );
    }
  };

  const toggle = (k: ScanField, on: boolean) =>
    setTicked((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });

  const apply = () => {
    const p: Record<string, string> = {};
    for (const k of SCAN_FIELDS) if (ticked.has(k) && values[k]) p[k] = values[k]!;
    onApply(p as Partial<VehicleDraft>);
    onOpenChange(false);
  };

  const found = SCAN_FIELDS.filter((k) => values[k] !== undefined);
  const missing = SCAN_FIELDS.filter((k) => values[k] === undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            {t("Scan giấy kiểm định", "Scan inspection certificate")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Chụp hoặc scan Giấy chứng nhận kiểm định ATKT & BVMT; hệ thống đọc các thông số và điền vào form sau khi bạn xác nhận.",
              "Photo or scan of the inspection certificate; the readings fill the form after you confirm them.",
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" && (
          <div className="space-y-3">
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void scan(f);
              }}
            >
              <FileImage className="h-10 w-10 text-primary" />
              <span className="font-semibold">
                {t("Chọn hoặc kéo thả file giấy kiểm định", "Choose or drop the certificate file")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(
                  "PDF (bản điện tử từ cơ sở đăng kiểm — chính xác nhất) hoặc ảnh JPG / PNG chụp thẳng, rõ chữ. Xử lý ngay trên trình duyệt.",
                  "PDF (the station's e-certificate — most accurate) or a straight, sharp JPG / PNG. Processed in the browser.",
                )}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void scan(f);
                  e.target.value = "";
                }}
              />
            </label>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              onClick={() => review(SAMPLE_CERTIFICATE_TEXT)}
            >
              <Sparkles className="h-4 w-4" />
              {t(
                "Demo: giấy kiểm định đầu kéo 50H-609.54",
                "Demo: certificate of tractor head 50H-609.54",
              )}
            </button>
          </div>
        )}

        {phase === "reading" && (
          <div className="flex items-center gap-5 py-4">
            {preview && (
              <img
                src={preview}
                alt=""
                className="h-32 w-24 shrink-0 rounded-md border object-cover"
              />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {t("Đang đọc giấy kiểm định…", "Reading the certificate…")}
                <span className="text-xs text-muted-foreground">{step}</span>
              </div>
              <Progress value={Math.round(progress * 100)} />
              <p className="text-xs text-muted-foreground">
                {t(
                  "PDF có lớp chữ được đọc thẳng. Ảnh cần nhận dạng chữ: lần đầu tải bộ tiếng Việt (vài MB), các lần sau nhanh hơn.",
                  "A PDF with a text layer is read directly. Images need OCR: the first one downloads the Vietnamese data (a few MB).",
                )}
              </p>
            </div>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-3">
            {found.length === 0 ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
                {t(
                  "Không tìm thấy thông số nào. Hãy thử ảnh rõ hơn, chụp thẳng và đủ sáng.",
                  "No fields found. Try a sharper, straight, well-lit image.",
                )}
              </p>
            ) : (
              <div className="max-h-[52vh] overflow-y-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs font-semibold">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2">{t("Trường", "Field")}</th>
                      <th className="px-3 py-2">{t("Hiện tại", "Current")}</th>
                      <th className="px-3 py-2">{t("Đọc từ giấy", "From the certificate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {found.map((k) => {
                      const now = String(current[k] ?? "");
                      const same = now === values[k];
                      return (
                        <tr key={k} className={cn("border-t", same && "text-muted-foreground")}>
                          <td className="px-3 py-1.5 text-center">
                            <Checkbox
                              checked={ticked.has(k)}
                              onCheckedChange={(v) => toggle(k, v === true)}
                              aria-label={SCAN_LABELS[k]}
                            />
                          </td>
                          <td className="px-3 py-1.5 font-medium">{SCAN_LABELS[k]}</td>
                          <td className="px-3 py-1.5">{now || "—"}</td>
                          <td className="px-3 py-1.5">
                            <Input
                              className="h-8"
                              value={values[k] ?? ""}
                              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {missing.length > 0 && found.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Không đọc được: ", "Not found: ")}
                {missing.map((k) => SCAN_LABELS[k]).join(", ")}
              </p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {t("Xem văn bản đã nhận dạng", "Show the recognized text")}
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2">
                {raw}
              </pre>
            </details>
          </div>
        )}

        <DialogFooter>
          {phase === "review" && (
            <Button variant="outline" onClick={() => setPhase("pick")}>
              {t("Scan ảnh khác", "Scan another image")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {phase === "review" && (
            <Button onClick={apply} disabled={ticked.size === 0}>
              {t(`Điền ${ticked.size} trường`, `Fill ${ticked.size} fields`)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
