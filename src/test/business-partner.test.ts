import { describe, expect, it } from "vitest";
import {
  nextBpNumber,
  roleDigit,
  sanitizeBpCode,
  validateBusinessPartner,
  newBusinessPartnerDraft,
  woAccessState,
} from "@/services/businessPartnerService";

describe("BP Identity Number", () => {
  it("maps roles to the BP0..BP3 digit", () => {
    expect(roleDigit(["Customer", "Vendor"])).toBe("0");
    expect(roleDigit(["Vendor"])).toBe("1");
    expect(roleDigit(["Customer"])).toBe("2");
    expect(roleDigit(["Employee"])).toBe("3");
  });

  it("continues the shared sequence (seed max is BP0260007) and counts Employee separately", () => {
    const now = new Date("2026-09-01T00:00:00");
    expect(nextBpNumber(["Customer"], now)).toBe("BP2260008");
    expect(nextBpNumber(["Customer", "Vendor"], now)).toBe("BP0260008");
    expect(nextBpNumber(["Employee"], now)).toBe("BP3260001");
    // A new year restarts the sequence.
    expect(nextBpNumber(["Vendor"], new Date("2027-01-02T00:00:00"))).toBe("BP1270001");
  });
});

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
