// Fixed Cost allocation chain (pure). Only converts from the anchor unit DOWN; larger units are null.
import type { AllocationUnit } from "@/types";

export interface AllocationInput {
  /** Cost Value already converted to VND. */
  value: number;
  base: number;
  unit: AllocationUnit;
  days: number;
  utilContainer: number;
  utilDay: number;
  apply: boolean;
}

export interface AllocationResult {
  allocation: number | null;
  year: number | null;
  month: number | null;
  day: number | null;
  trip: number | null;
}

const ok = (n: number) => Number.isFinite(n) && n > 0;
const div = (a: number | null, b: number): number | null => (a === null || !ok(b) ? null : a / b);

export function allocate(i: AllocationInput): AllocationResult {
  const allocation = div(i.value, i.base);
  const r: AllocationResult = { allocation, year: null, month: null, day: null, trip: null };
  if (i.unit === "Trip") return { ...r, trip: allocation };
  if (i.unit === "Year") {
    r.year = allocation;
    r.month = div(r.year, 12);
  } else if (i.unit === "Month") r.month = allocation;
  if (i.unit !== "Day") r.day = div(r.month, i.days);
  else r.day = allocation;
  r.trip = i.apply ? div(r.day, i.utilContainer / i.utilDay) : r.day;
  return r;
}

export const fmtMoney = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
