import { describe, expect, it } from "vitest";
import { loanSchedule } from "@/services/loanMath";

const loan = { amount: 840_000_000, ratePct: 9, termMonths: 60 };

describe("fixed cost loan interest", () => {
  it("Annuity: the same payment every month, the loan is fully repaid", () => {
    const s = loanSchedule({ ...loan, method: "Annuity" });
    expect(s.rows).toHaveLength(60);
    expect(Math.round(s.firstPayment)).toBe(17_437_018);
    expect(Math.round(s.lastPayment)).toBe(17_437_018);
    expect(s.rows[59]!.balance).toBe(0);
    expect(Math.round(s.totalInterest)).toBe(Math.round(s.totalPayment - loan.amount));
  });
  it("Equal Principal: interest = amount × monthly rate × (n + 1) / 2, payments go down", () => {
    const s = loanSchedule({ ...loan, method: "Equal Principal" });
    expect(Math.round(s.totalInterest)).toBe(192_150_000);
    expect(s.firstPayment).toBeGreaterThan(s.lastPayment);
    expect(Math.round(s.firstPayment)).toBe(20_300_000); // 14,000,000 principal + 6,300,000 interest
  });
  it("no schedule for an empty or invalid loan", () => {
    expect(loanSchedule({ ...loan, amount: 0, method: "Annuity" }).rows).toEqual([]);
    expect(loanSchedule({ ...loan, termMonths: 0, method: "Annuity" }).totalInterest).toBe(0);
  });
});
