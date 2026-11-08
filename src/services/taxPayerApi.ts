// Tax payer lookup (MST) through the xInvoice API: GET https://api.xinvoice.vn/gdt-api/tax-payer/:taxCode
// (docs: https://xinvoice.vn/apis/tra-cuu-ma-so-thue/). The API answers the browser directly (CORS *).
// A client-id / api-key pair, when set (VITE_XINVOICE_CLIENT_ID / VITE_XINVOICE_API_KEY), is sent too.
import { tr } from "@/lib/i18n";

export const TAX_PAYER_API = "https://api.xinvoice.vn/gdt-api/tax-payer";

/** What the API returns for a tax code. */
export interface TaxPayerInfo {
  /** "Doanh nghiệp / Đơn vị sự nghiệp công lập", "Chi nhánh", "Hộ kinh doanh cá thể". */
  orgType: string;
  taxID: string;
  name: string;
  address: string;
  taxDepartment: string;
  /** "NNT đang hoạt động", "NNT ngừng hoạt động và đã đóng MST"… */
  status: string;
  updatedAt: string;
}

export type TaxPayerResult = { info: TaxPayerInfo } | { error: string };

/**
 * A Tax Code (MST) comes in three forms (Circular 86/2024/TT-BTC):
 * - 10 digits: an enterprise or organisation;
 * - 10 + 3 digits: a branch or dependent unit ("0316794479-001"; "0316794479001" is read the same);
 * - 12 digits: an individual or household business, whose personal ID number is the MST since 01/07/2025.
 */
const MST = /^(\d{10})(?:-?(\d{3}))?$/;
const PERSONAL_MST = /^\d{12}$/;

/** The tax code as the API wants it ("0316794479-001"), or null when it is not one. */
export function normalizeTaxCode(v: string): string | null {
  const s = v.replace(/\s+/g, "");
  if (PERSONAL_MST.test(s)) return s;
  const m = MST.exec(s);
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : m[1]!;
}

/** Is it a Tax Code in one of its three forms? */
export const isTaxCode = (v: string) => normalizeTaxCode(v) !== null;

/** The error for a Tax Code in none of its forms. */
export const taxCodeFormatError = () =>
  tr(
    "Mã số thuế gồm 10 số, 10 + 3 số với chi nhánh, hoặc 12 số (số định danh cá nhân).",
    "Tax Code should be 10 digits, 10 + 3 digits for a branch, or 12 digits (personal ID number).",
  );

/** Is the tax payer still running ("NNT đang hoạt động…")? */
export const isActiveTaxPayer = (status: string) => /đang hoạt động/i.test(status);

const env = (k: string): string | undefined =>
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k];

/** Looks a tax code up; never throws (the error is in the result). */
export async function fetchTaxPayer(
  taxCode: string,
  fetchFn: typeof fetch = fetch,
): Promise<TaxPayerResult> {
  const code = normalizeTaxCode(taxCode);
  if (!code) return { error: taxCodeFormatError() };
  const headers: Record<string, string> = { Accept: "application/json" };
  const clientId = env("VITE_XINVOICE_CLIENT_ID");
  const apiKey = env("VITE_XINVOICE_API_KEY");
  if (clientId && apiKey) {
    headers["client-id"] = clientId;
    headers["api-key"] = apiKey;
  }
  let res: Response;
  try {
    res = await fetchFn(`${TAX_PAYER_API}/${encodeURIComponent(code)}`, { headers });
  } catch {
    return {
      error: tr(
        "Không kết nối được dịch vụ tra cứu MST. Kiểm tra mạng rồi thử lại.",
        "Could not reach the tax lookup service. Check the connection and try again.",
      ),
    };
  }
  if (res.status === 404)
    return {
      error: tr(`Không tìm thấy MST ${code}.`, `Tax Code ${code} was not found.`),
    };
  if (res.status === 429)
    return {
      error: tr(
        "Tra cứu quá nhanh. Đợi một chút rồi thử lại.",
        "Too many lookups. Wait a moment and try again.",
      ),
    };
  if (res.status === 401 || res.status === 403)
    return {
      error: tr(
        "Dịch vụ tra cứu MST yêu cầu client-id / api-key.",
        "The tax lookup service asks for a client-id / api-key.",
      ),
    };
  if (!res.ok)
    return {
      error: tr(
        `Dịch vụ tra cứu MST lỗi (${res.status}).`,
        `The tax lookup service failed (${res.status}).`,
      ),
    };
  try {
    const body = (await res.json()) as Partial<TaxPayerInfo>;
    if (!body.name)
      return { error: tr(`Không tìm thấy MST ${code}.`, `Tax Code ${code} was not found.`) };
    return {
      info: {
        orgType: body.orgType ?? "",
        taxID: body.taxID ?? code,
        name: body.name,
        address: body.address ?? "",
        taxDepartment: body.taxDepartment ?? "",
        status: body.status ?? "",
        updatedAt: body.updatedAt ?? "",
      },
    };
  } catch {
    return {
      error: tr("Dịch vụ tra cứu MST trả dữ liệu lỗi.", "The tax lookup service sent bad data."),
    };
  }
}
