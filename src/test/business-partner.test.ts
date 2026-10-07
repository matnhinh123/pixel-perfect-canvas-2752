import { describe, expect, it } from "vitest";
import {
  sanitizeBpCode,
  validateBusinessPartner,
  newBusinessPartnerDraft,
  woAccessState,
} from "@/services/businessPartnerService";

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
