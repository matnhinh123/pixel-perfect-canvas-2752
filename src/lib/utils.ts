import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "A, B" ⇄ ["A", "B"]: several picks kept in one text field (e.g. a table cell). */
export const splitList = (v: unknown): string[] =>
  String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
export const joinList = (v: readonly string[]) => v.join(", ");
