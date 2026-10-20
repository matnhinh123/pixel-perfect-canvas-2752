// Loan behind a fixed cost (e.g. a vehicle bought on credit): repayment schedule and total interest.
// Only the interest is a cost — the principal pays for the vehicle, already costed by depreciation.

import type { LoanTerms } from "@/types";

export { REPAYMENT_METHODS, type LoanTerms, type RepaymentMethod } from "@/types";

export interface LoanRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  /** Still owed after this payment. */
  balance: number;
}

export interface LoanSchedule {
  rows: LoanRow[];
  firstPayment: number;
  lastPayment: number;
  totalPayment: number;
  totalInterest: number;
}

export const EMPTY_SCHEDULE: LoanSchedule = {
  rows: [],
  firstPayment: 0,
  lastPayment: 0,
  totalPayment: 0,
  totalInterest: 0,
};

export function loanSchedule(l: LoanTerms): LoanSchedule {
  const n = Math.floor(l.termMonths);
  if (!(l.amount > 0) || !(n > 0) || !(l.ratePct >= 0)) return EMPTY_SCHEDULE;
  const r = l.ratePct / 100 / 12;
  const annuity = r === 0 ? l.amount / n : (l.amount * r) / (1 - Math.pow(1 + r, -n));
  const rows: LoanRow[] = [];
  let balance = l.amount;
  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    const principal =
      m === n
        ? balance
        : l.method === "Annuity"
          ? annuity - interest
          : l.method === "Equal Principal"
            ? l.amount / n
            : 0;
    balance = Math.max(0, balance - principal);
    rows.push({ month: m, payment: principal + interest, principal, interest, balance });
  }
  const totalInterest = rows.reduce((s, x) => s + x.interest, 0);
  return {
    rows,
    firstPayment: rows[0]!.payment,
    lastPayment: rows[rows.length - 1]!.payment,
    totalPayment: l.amount + totalInterest,
    totalInterest,
  };
}
