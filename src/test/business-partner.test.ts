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
  it("uppercases, strips disallowed characters and caps at 12", () => {
    expect(sanitizeBpCode("abc 12/ú.x_y-z")).toBe("ABC12.X_Y-Z");
    expect(sanitizeBpCode("a".repeat(80))).toHaveLength(12);
    expect(
      validateBusinessPartner({ ...newBusinessPartnerDraft(), bpCode: "ABCDEFGHIJKLM" })["bpCode"],
    ).toBeTruthy();
  });

  it("rejects a duplicate BP Code and requires a role", () => {
    const d = { ...newBusinessPartnerDraft(), bpCode: "qtl" };
    const e = validateBusinessPartner(d);
    // The message names the partner that already has it: BP Code – Local Name.
    const qtl = seedBusinessPartners().find((b) => b.bpCode === "QTL")!;
    expect(e["bpCode"]).toContain(`QTL – ${qtl.localName}`);
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
    const qtl = seedBusinessPartners().find((b) => b.bpCode === "QTL")!;
    expect(validateBusinessPartner(d)["taxCode"]).toContain(`QTL – ${qtl.localName}`);
    expect(validateBusinessPartner(d, "BP-6")["taxCode"]).toBeUndefined();
  });

  it("Currency starts empty (it follows the Country) and is required", () => {
    const d = newBusinessPartnerDraft();
    expect(d.currency).toBe("");
    expect(validateBusinessPartner(d)["currency"]).toBeTruthy();
    expect(
      validateBusinessPartner({ ...d, currency: "VND", currencies: ["VND"] })["currency"],
    ).toBeUndefined();
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
    const d = { ...newBusinessPartnerDraft(), taxCode: "", identityNo: "" };
    const company = validateBusinessPartner({ ...d, legalType: "Company" });
    expect(company["taxCode"]).toBeTruthy();
    expect(company["identityNo"]).toBeUndefined();
    const person = validateBusinessPartner({ ...d, legalType: "Individual" });
    expect(person["identityNo"]).toBeTruthy();
    expect(person["taxCode"]).toBeUndefined();
    const rep = validateBusinessPartner({ ...d, legalType: "Representative" });
    expect(rep["taxCode"]).toBeUndefined();
    expect(rep["identityNo"]).toBeUndefined();
    const v = (p: Partial<typeof d>) =>
      validateBusinessPartner({ ...d, legalType: "Individual", ...p });
    expect(v({ identityNo: "079085001234" })["identityNo"]).toBeUndefined();
    expect(v({ identityNo: "0312" })["identityNo"]).toBeTruthy();
    expect(v({ identityNo: "079085001234", taxCode: "12345" })["taxCode"]).toBeTruthy();
  });

  it("moves an old Individual's CCCD from Tax Code to Identity Number", () => {
    const old = {
      ...seedBusinessPartners()[0]!,
      legalType: "Individual",
      taxCode: "079085001234",
      identityNo: undefined,
    } as unknown as BusinessPartnerRecord;
    const n = normalizeBusinessPartner(old);
    expect(n.identityNo).toBe("079085001234");
    expect(n.taxCode).toBe("");
  });
});

describe("Change History", () => {
  it("logs each table change with the field, old value and new value", async () => {
    const { businessPartnerRepository, auditRepository } = await import("@/repositories");
    const { businessPartnerService, draftOf, blankDocument } =
      await import("@/services/businessPartnerService");
    const bp = businessPartnerRepository.get("BP-6")!;
    const d = draftOf(bp);
    const hung = d.customer.contacts.find((c) => c.fullName === "Nguyễn Văn Hùng")!;
    hung.mobilePhone = "0909 999 999";
    d.customer.contacts = d.customer.contacts.filter((c) => c.fullName !== "Trần Thị Lan");
    d.documents = [
      { ...(d.documents[0] ?? blankDocument()), docType: "Contract", docName: "HD-01" },
    ];
    const before = auditRepository.all().length;
    businessPartnerService.save(d, "BP-6");
    const fields = auditRepository
      .all()
      .slice(before)
      .map((e) => [e.field, e.oldValue, e.newValue]);
    expect(fields).toContainEqual([
      "Customer › Contact Info › Nguyễn Văn Hùng › Mobile Phone",
      "0909 123 456",
      "0909 999 999",
    ]);
    expect(
      fields.some(
        ([f, o]) => f === "Customer › Contact Info › Row removed" && o?.includes("Trần Thị Lan"),
      ),
    ).toBe(true);
    expect(fields.some(([f, , n]) => f === "Documents › Row added" && n?.includes("HD-01"))).toBe(
      true,
    );
    // Saving again without changes logs nothing.
    const after = auditRepository.all().length;
    businessPartnerService.save(draftOf(businessPartnerRepository.get("BP-6")!), "BP-6");
    expect(auditRepository.all().length).toBe(after);
  });
});

describe("Petrolimex Tiền Giang demo partners", () => {
  it("are valid Vendor partners with the registry tax codes", async () => {
    const { seedPetrolimexTienGiang } = await import("@/mock-data/businessPartners");
    const { draftOf } = await import("@/services/businessPartnerService");
    const rows = seedPetrolimexTienGiang();
    expect(rows.map((r) => r.taxCode)).toEqual([
      "1200100370",
      "1200100370-010",
      "1200100370-016",
      "1200100370-017",
    ]);
    for (const r of rows) {
      expect(r.roles).toEqual(["Vendor"]);
      expect(validateBusinessPartner(draftOf(r), r.id)).toEqual({});
    }
  });

  it("requires a Document Type on every Documents row, blank rows included", async () => {
    const { businessPartnerRepository } = await import("@/repositories");
    const { businessPartnerService, draftOf, blankDocument } =
      await import("@/services/businessPartnerService");
    const d = draftOf(businessPartnerRepository.get("BP-6")!);
    d.documents = [blankDocument()];
    expect(() => businessPartnerService.save(d, "BP-6")).toThrow();
    d.documents = [
      {
        ...blankDocument(),
        docType: "Contract",
        validDate: "2026-05-01",
        expiryDate: "2026-04-01",
      },
    ];
    expect(() => businessPartnerService.save(d, "BP-6")).toThrow();
    d.documents = [{ ...blankDocument(), docType: "Contract" }];
    expect(() => businessPartnerService.save(d, "BP-6")).not.toThrow();
  });
});
