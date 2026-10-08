import { describe, expect, it } from "vitest";
import {
  sanitizeBpCode,
  validateBusinessPartner,
  newBusinessPartnerDraft,
  woAccessState,
  normalizeBusinessPartner,
} from "@/services/businessPartnerService";
import { seedBusinessPartners } from "@/mock-data/businessPartners";
import type { BusinessPartnerRecord } from "@/types";

describe("BP Code convention", () => {
  it("uppercases, strips disallowed characters and caps at 50", () => {
    expect(sanitizeBpCode("abc 12/ú.x_y-z")).toBe("ABC12.X_Y-Z");
    expect(sanitizeBpCode("a".repeat(80))).toHaveLength(50);
  });

  it("rejects a duplicate BP Code and requires a role", () => {
    const d = { ...newBusinessPartnerDraft(), bpCode: "qtl" };
    const e = validateBusinessPartner(d);
    expect(e["bpCode"]).toMatch(/exist|tồn tại/i);
    expect(e["roles"]).toBeTruthy();
  });
});

describe("WO access window", () => {
  const row = { woAccessFrom: "2026-07-24T08:00", woAccessTo: "2026-07-31T17:00" };
  it("locks before From, allows inside, locks after To", () => {
    expect(woAccessState(row, new Date("2026-07-24T07:59"))).toBe("Locked");
    expect(woAccessState(row, new Date("2026-07-28T12:00"))).toBe("Allowed");
    expect(woAccessState(row, new Date("2026-07-31T17:01"))).toBe("Expired");
  });
  it("falls back to the default credit policy without a window", () => {
    expect(woAccessState({ woAccessFrom: "", woAccessTo: "" })).toBe("Default");
  });
});

describe("Profile rules", () => {
  it("rejects a duplicate Tax Code (case/space-insensitive)", () => {
    const d = { ...newBusinessPartnerDraft(), taxCode: " 0316 497684 " };
    expect(validateBusinessPartner(d)["taxCode"]).toMatch(/QTL/);
    expect(validateBusinessPartner(d, "BP-6")["taxCode"]).toBeUndefined();
  });

  it("defaults Currency to the tenant currency and requires it", () => {
    const d = newBusinessPartnerDraft();
    expect(d.currency).toBe("VND");
    expect(validateBusinessPartner(d)["currency"]).toBeUndefined();
    expect(validateBusinessPartner({ ...d, currency: "" })["currency"]).toBeTruthy();
  });

  it("normalizes records stored by older versions", () => {
    const old = {
      ...seedBusinessPartners()[0]!,
      legalType: "Government",
      businessCategory: "Trading",
      currencies: undefined,
      contacts: undefined,
      salesAssignments: undefined,
      customer: {
        creditTerms: [],
        banks: [],
        contacts: [{ rid: "x", fullName: "A", mobile: "09", contactRole: "Sales Contact" }],
        salesmen: [{ rid: "y", salesName: "Lê Thị Hoa", serviceCode: "", serviceName: "" }],
      },
    } as unknown as BusinessPartnerRecord;
    const n = normalizeBusinessPartner(old);
    expect(n.legalType).toBe("Company");
    expect(n.businessCategory).toEqual(["Trading"]);
    expect(n.currencies).toEqual(["VND"]);
    expect(n.customer.contacts[0]).toMatchObject({
      fullName: "A",
      mobilePhone: "09",
      contactRole: "Sales Contact",
    });
    expect(n.customer.salesmen[0]).toMatchObject({ staffId: "E-002", staffName: "Lê Thị Hoa" });
    expect(n).not.toHaveProperty("contacts");
  });

  it("moves the shared contact list into every role the partner has", () => {
    const old = {
      ...seedBusinessPartners()[0]!,
      roles: ["Customer", "Vendor"],
      contacts: [{ rid: "x", fullName: "B", phone: "08", position: "Director" }],
      salesAssignments: [],
      customer: { creditTerms: [], banks: [] },
      vendor: { paymentTerms: [], banks: [] },
    } as unknown as BusinessPartnerRecord;
    const n = normalizeBusinessPartner(old);
    expect(n.customer.contacts[0]?.fullName).toBe("B");
    expect(n.vendor.contacts[0]?.fullName).toBe("B");
    expect(n).not.toHaveProperty("salesAssignments");
  });

  it("requires Tax Code for a Company, Identity Number for an Individual, neither for a Representative", () => {
    const d = { ...newBusinessPartnerDraft(), taxCode: "" };
    expect(validateBusinessPartner({ ...d, legalType: "Company" })["taxCode"]).toBeTruthy();
    expect(validateBusinessPartner({ ...d, legalType: "Individual" })["taxCode"]).toBeTruthy();
    expect(
      validateBusinessPartner({ ...d, legalType: "Representative" })["taxCode"],
    ).toBeUndefined();
    expect(
      validateBusinessPartner({ ...d, legalType: "Individual", taxCode: "079085001234" })[
        "taxCode"
      ],
    ).toBeUndefined();
    expect(
      validateBusinessPartner({ ...d, legalType: "Individual", taxCode: "0312" })["taxCode"],
    ).toBeTruthy();
  });
});
