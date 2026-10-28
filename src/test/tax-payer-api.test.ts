import { describe, expect, it, vi } from "vitest";
import {
  TAX_PAYER_API,
  fetchTaxPayer,
  isActiveTaxPayer,
  normalizeTaxCode,
} from "@/services/taxPayerApi";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Tax payer lookup (xInvoice API)", () => {
  it("reads 10 digits, or 10 + 3 for a branch", () => {
    expect(normalizeTaxCode(" 0101248141 ")).toBe("0101248141");
    expect(normalizeTaxCode("0316794479001")).toBe("0316794479-001");
    expect(normalizeTaxCode("0316794479-001")).toBe("0316794479-001");
    expect(normalizeTaxCode("abc")).toBeNull();
  });

  it("calls GET /gdt-api/tax-payer/:taxCode and returns the registered name and address", async () => {
    const fetchFn = vi.fn(async () =>
      json(200, {
        orgType: "Doanh nghiệp / Đơn vị sự nghiệp công lập",
        taxID: "0101248141",
        name: "CÔNG TY CỔ PHẦN FPT",
        address: "Số 10 phố Phạm Văn Bạch, Phường Cầu Giấy, TP Hà Nội",
        taxDepartment: "Chi cục Thuế Doanh nghiệp lớn",
        status: "NNT đang hoạt động",
        updatedAt: "2026-10-09T13:49:10.000Z",
      }),
    );
    const res = await fetchTaxPayer("0101248141", fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledWith(`${TAX_PAYER_API}/0101248141`, {
      headers: { Accept: "application/json" },
    });
    expect(res).toMatchObject({ info: { name: "CÔNG TY CỔ PHẦN FPT", taxID: "0101248141" } });
    expect(isActiveTaxPayer("NNT đang hoạt động")).toBe(true);
    expect(isActiveTaxPayer("NNT ngừng hoạt động và đã đóng MST")).toBe(false);
  });

  it("says why when there is nothing: not found, too many lookups, offline, bad code", async () => {
    const as = (f: () => Promise<Response>) => f as unknown as typeof fetch;
    const notFound = await fetchTaxPayer(
      "0000000000",
      as(async () => json(404, { success: false, message: "Tax not found" })),
    );
    expect("error" in notFound && notFound.error).toMatch(/0000000000/);
    const limited = await fetchTaxPayer(
      "0101248141",
      as(async () => json(429, {})),
    );
    expect("error" in limited && limited.error).toMatch(/10/);
    const offline = await fetchTaxPayer(
      "0101248141",
      as(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect("error" in offline).toBe(true);
    const fetchFn = vi.fn();
    const bad = await fetchTaxPayer("12", fetchFn as unknown as typeof fetch);
    expect("error" in bad).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
