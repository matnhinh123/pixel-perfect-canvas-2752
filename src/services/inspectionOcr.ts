// Scan of the Vietnamese inspection certificate (Chứng nhận kiểm định ATKT & BVMT xe cơ giới).
// A PDF with a text layer is read directly (pdf.js); a photo / scanned page goes through OCR in the
// browser (Tesseract.js). Both engines load from the CDN on first use — no key, no server.
// Fields are read from the certificate's bilingual labels; a field is only filled when the
// certificate actually prints a value for it.

/** Fields the certificate carries, in the order they are reviewed. */
export const SCAN_FIELDS = [
  "vehicleType",
  "plateNumber",
  "inspectionNo",
  "inspectionReportNo",
  "inspectionExpiry",
  "tradeMark",
  "modelCode",
  "chassisNumber",
  "engineNumber",
  "productionYear",
  "lifetimeLimit",
  "fuelType",
  "overallDimension",
  "containerDimension",
  "kerbMass",
  "authorizedPayload",
  "authorizedTowedMass",
  "trailerAxles",
] as const;
export type ScanField = (typeof SCAN_FIELDS)[number];
export type ScanResult = Partial<Record<ScanField, string>>;

export const SCAN_LABELS: Record<ScanField, string> = {
  vehicleType: "Vehicle Type",
  plateNumber: "Plate Number",
  inspectionNo: "Vehicle Inspection No",
  inspectionReportNo: "Inspection Report No",
  inspectionExpiry: "Inspection Expiration Date",
  tradeMark: "Brand Name",
  modelCode: "Model Name",
  chassisNumber: "Chassis Number (VIN)",
  engineNumber: "Engine Number",
  productionYear: "Production Year",
  lifetimeLimit: "Lifetime Limit",
  fuelType: "Fuel Type",
  overallDimension: "Overall Dimension",
  containerDimension: "Cargo / Container Dimensions",
  kerbMass: "Kerb Mass",
  authorizedPayload: "Authorized Payload",
  authorizedTowedMass: "Authorized Towed Mass",
  trailerAxles: "Trailer Axles",
};

/**
 * Lower case without accents, ONE character per character (so a position in the folded text is the
 * same position in the original line).
 */
const fold = (s: string) =>
  [...s]
    .map((c) => (c === "đ" || c === "Đ" ? "d" : (c.normalize("NFD")[0] ?? c)).toLowerCase())
    .join("");

/** Label variants per field (folded), as printed on the certificate (VN and EN). */
const LABELS: Record<ScanField, string[]> = {
  vehicleType: ["loai phuong tien", "vehicle type"],
  plateNumber: ["bien so xe", "bien dang ky", "registration plate", "registration number"],
  inspectionNo: ["so quan ly", "vehicle record no", "vehicle inspection no"],
  inspectionReportNo: ["so phieu kd", "so phieu kiem dinh", "inspection report no"],
  inspectionExpiry: ["co hieu luc den het ngay", "valid until"],
  tradeMark: ["nhan hieu", "trademark", "(mark)"],
  modelCode: ["ma kieu loai", "so loai", "model code"],
  chassisNumber: ["so khung", "chassis no", "chassis number"],
  engineNumber: ["so dong co", "so may", "engine no", "engine number"],
  productionYear: ["nam san xuat", "production year", "manufactured year"],
  lifetimeLimit: ["nien han su dung", "nien han sd", "lifetime limit"],
  fuelType: ["loai nhien lieu", "(fuel)", "type of fuel"],
  overallDimension: ["kich thuoc bao", "overall dimension"],
  containerDimension: ["kich thuoc long", "inside dimension", "inside/outside dimension"],
  kerbMass: ["khoi luong ban than", "kerb mass"],
  authorizedPayload: ["khoi luong hang cc", "khoi luong hang chuyen cho", "pay mass", "pay load"],
  authorizedTowedMass: ["khoi luong keo theo", "towed mass"],
  trailerAxles: ["so luong lop", "number of tires"],
};

/** Other labels printed on the certificate: a value stops where the next label starts. */
const STOP = [
  ...Object.values(LABELS).flat(),
  "nuoc san xuat",
  "khoang cach truc",
  "khoi luong toan bo",
  "so nguoi cho phep",
  "cong thuc banh xe",
  "vet banh xe",
  "loai dong co",
  "ky hieu",
  "the tich lam viec",
  "dat muc khi thai",
  "cong suat",
  "co kinh doanh van tai",
  "co cai tao",
  "so seri tem",
  "ngay kd",
];

const indexOfAny = (line: string, labels: string[], from = 0) => {
  let best = -1;
  for (const l of labels) {
    const i = line.indexOf(l, from);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
};
/** A line that is only the English translation of a label, e.g. "(Production year)". */
const isTranslation = (line: string) => /^\(.*\)$/.test(line.trim());

/**
 * Value printed for a field: the text after the ":" that follows its label, up to the next label on
 * the same line. When the label line has no value, the next line counts only if it is a bare value
 * (not another label, not a translation line).
 */
function valueOf(lines: string[], field: ScanField): string {
  const folded = lines.map(fold);
  for (let i = 0; i < lines.length; i++) {
    const at = indexOfAny(folded[i]!, LABELS[field]);
    if (at < 0) continue;
    const colon = lines[i]!.indexOf(":", at);
    if (colon < 0) continue;
    const end = indexOfAny(folded[i]!, STOP, colon + 1);
    const value = lines[i]!.slice(colon + 1, end < 0 ? undefined : end).trim();
    if (value) return value;
    const next = lines[i + 1];
    if (next && !isTranslation(next) && indexOfAny(fold(next), STOP) < 0) return next.trim();
    return "";
  }
  return "";
}

const digits = (s: string) => s.replace(/[^\d]/g, "");
/** "14670/13670 (kg)" (design / authorized) → the authorized value; a single number stays. */
const authorized = (s: string) => {
  const parts = s.split("/").map(digits).filter(Boolean);
  return parts[parts.length - 1] ?? "";
};
/** "7250 x 2500 x 3800 (mm)" → "7250×2500×3800". */
const dims = (s: string) => {
  const m = s.match(/(\d[\d.,]*)\s*[x×*]\s*(\d[\d.,]*)\s*[x×*]\s*(\d[\d.,]*)/i);
  return m ? [m[1], m[2], m[3]].map((x) => digits(x!)).join("×") : "";
};
/** "08/10/2028" → "2028-10-08". */
const ymd = (s: string) => {
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : "";
};
const year = (s: string) => (s.match(/\b(19|20)\d{2}\b/) ?? [""])[0]!;
/** Certificate numbers: letters, digits, "/", "-" and "." (spaces dropped). */
const code = (s: string) => (s.replace(/\s+/g, "").match(/[A-Z0-9][A-Z0-9/.-]*/i) ?? [""])[0]!;
/** Plate, ignoring the suffix the certificate prints after it (e.g. "50H-609.54ᵛ"). */
const PLATE = /(\d{2}[A-Z]{1,2}\d?)\s*-?\s*(\d{3}[.,]\d{2}|\d{4,5})/;

/** Reads the certificate's fields from its text; a field is left out when no value is printed. */
export function parseInspectionCertificate(text: string): ScanResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const v = (f: ScanField) => valueOf(lines, f);
  const out: ScanResult = {};
  const put = (k: ScanField, value: string) => {
    if (value.trim()) out[k] = value.trim();
  };

  const type = fold(v("vehicleType"));
  if (/so mi ro|ro ?mo+c|semi-?trailer|trailer/.test(type)) put("vehicleType", "TRAILER");
  else if (/dau keo|tractor/.test(type)) put("vehicleType", "HEADER");
  else if (/o to tai|truck/.test(type)) put("vehicleType", "TRUCK");

  const pm = v("plateNumber").toUpperCase().match(PLATE);
  if (pm) put("plateNumber", `${pm[1]}-${pm[2]!.replace(",", ".")}`);
  put("inspectionNo", code(v("inspectionNo")).toUpperCase());
  put("inspectionReportNo", code(v("inspectionReportNo")).toUpperCase());
  put("inspectionExpiry", ymd(v("inspectionExpiry")));
  put("tradeMark", v("tradeMark").replace(/\(.*$/, "").trim().toUpperCase());
  put("modelCode", v("modelCode").replace(/\(.*$/, "").trim());
  put(
    "chassisNumber",
    code(v("chassisNumber"))
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""),
  );
  put("engineNumber", code(v("engineNumber")).toUpperCase());
  put("productionYear", year(v("productionYear")));
  const life = year(v("lifetimeLimit"));
  if (life) put("lifetimeLimit", `${life}-12-31`);
  const fuel = fold(v("fuelType"));
  if (fuel)
    put(
      "fuelType",
      /diesel|dau/.test(fuel)
        ? "Diesel"
        : /xang|gasoline|petrol/.test(fuel)
          ? "Gasoline"
          : /cng/.test(fuel)
            ? "CNG"
            : /lpg/.test(fuel)
              ? "LPG"
              : /dien|electric/.test(fuel)
                ? "Electric"
                : "",
    );
  put("overallDimension", dims(v("overallDimension")));
  put("containerDimension", dims(v("containerDimension")));
  put("kerbMass", digits(v("kerbMass")));
  put("authorizedPayload", authorized(v("authorizedPayload")));
  put("authorizedTowedMass", authorized(v("authorizedTowedMass")));
  // Tyres per axle are listed as "1 : 2; … 2 : 4; … 3 : 4": the highest axle number is the count.
  const axles = [...v("trailerAxles").matchAll(/(?:^|;|\s)(\d)\s*:\s*\d+/g)].map((m) =>
    Number(m[1]),
  );
  if (axles.length) put("trailerAxles", String(Math.max(...axles)));
  return out;
}

/** Text of a real certificate (tractor head 50H-609.54): lets the demo show a scan without a file. */
export const SAMPLE_CERTIFICATE_TEXT = `CƠ SỞ ĐĂNG KIỂM 6114D
Ngày KĐ (Inspection date): 09/10/2026
Số phiếu KĐ (Inspection report No): 22967/26
CHỨNG NHẬN KIỂM ĐỊNH AN TOÀN KỸ THUẬT VÀ BẢO VỆ MÔI TRƯỜNG XE CƠ GIỚI
Số: 26KĐG/015243/6114D
Biển số xe (Registration plate): 50H-609.54V Số quản lý (Vehicle record No): 6114D - 5891
Loại phương tiện (Vehicle type): ô tô đầu kéo
Nhãn hiệu/ tên thương mại: CNHTC
(Trademark/Commercial name)
Số khung (Chassis No): LZZ1CLWCXTJ486944 Mã kiểu loại(Model code): ZZ4257V344KE1
Số động cơ (Engine No): MC114650260617230907
Năm sản xuất: 2026 Nước sản xuất: Trung Quốc Niên hạn sử dụng: 2051
(Production year) (Production country) (Lifetime Limit to)
Có kinh doanh vận tải(Commercial use): x Có cải tạo(Modification): -
THÔNG SỐ KỸ THUẬT (SPECIFICATIONS)
Kích thước bao (Overall dimensions): 7250 x 2500 x 3800 (mm) Khoảng cách trục (Wheel space): 3400+1400 (mm)
Kích thước lòng/ bao thùng xe/ bao ngoài xi téc: (mm)
(Inside/outside dimensions of cargo deck/outside dimensions of tank)
Khối lượng bản thân: 10200 (kg) Khối lượng toàn bộ theo TK/CPLN: 25000/24000 (kg)
(Kerb mass) (Max. total mass: Designed/ Authorized)
Khối lượng hàng CC theo TK/CPLN: 14670/13670(kg) Khối lượng kéo theo TK/CPLN: 38600/37670 (kg)
( Max. cargo pay mass: Design/Authorized) (Max. towed mass: Design/Authorized)
Công thức bánh xe (Drive configuration): 6x4 Vết bánh xe (Tire tread): 2041/1830 (mm)
- Ký hiệu (Engine model): MC11.46-50 - Thể tích làm việc (Engine displacement): 10518 (cm3)
- Loại nhiên liệu (Fuel): Diesel - Đạt mức khí thải (Emission level): 5
Số seri tem KĐ (Inspection sticker serial No): VB-4096969
Chứng nhận có hiệu lực đến hết ngày: 08/10/2028
(Valid until)`;

// ---------------------------------------------------------------- engines (CDN, loaded once)

const loadScript = (src: string, global: string) =>
  new Promise<unknown>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    if (w[global]) return resolve(w[global]);
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => (w[global] ? resolve(w[global]) : reject(new Error(`${global} missing`)));
    s.onerror = () => reject(new Error(`Could not load ${global}`));
    document.head.appendChild(s);
  });

type Tess = {
  recognize: (
    image: File | HTMLCanvasElement,
    langs: string,
    opts: { logger: (m: { status: string; progress: number }) => void },
  ) => Promise<{ data: { text: string } }>;
};
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

type PdfItem = { str: string; transform: number[] };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfItem[] }>;
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { data: ArrayBuffer }) => {
    promise: Promise<{ getPage: (n: number) => Promise<PdfPage> }>;
  };
};
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

type Progress = (p: number, step: string) => void;

async function ocr(image: File | HTMLCanvasElement, onProgress?: Progress) {
  const T = (await loadScript(TESSERACT, "Tesseract")) as Tess;
  const r = await T.recognize(image, "vie+eng", {
    logger: (m) => onProgress?.(m.progress ?? 0, m.status),
  });
  return r.data.text;
}

/** First page of a PDF: its text layer as lines (top to bottom), or the rendered page for OCR. */
async function readPdf(file: File, onProgress?: Progress) {
  const pdfjs = (await loadScript(PDFJS, "pdfjsLib")) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  onProgress?.(0.2, "reading pdf");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const { items } = await page.getTextContent();
  // Items on (almost) the same baseline form one line; lines read top to bottom, left to right.
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4]!;
    const y = it.transform[5]!;
    const row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (row) row.parts.push({ x, s: it.str });
    else rows.push({ y, parts: [{ x, s: it.str }] });
  }
  const text = rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(" ")
        .replace(/\s+/g, " "),
    )
    .join("\n");
  if (text.replace(/\s/g, "").length > 80) return text;
  // Scanned PDF (no text layer): render the page and OCR it.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  return ocr(canvas, onProgress);
}

/** Text of a certificate file: a PDF's text layer, else OCR (Vietnamese + English). */
export async function readCertificate(file: File, onProgress?: Progress): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
    return readPdf(file, onProgress);
  return ocr(file, onProgress);
}
