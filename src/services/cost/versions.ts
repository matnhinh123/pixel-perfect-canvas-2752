// Versions of a setup (Salary Range, Fuel Cost): 1 when created, +1 on each save that changes it; the
// earlier ones are kept with when and by whom they were saved.
import type { BaseRecord, SetupVersion } from "@/types";

export type Versioned<D> = Pick<
  BaseRecord,
  "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
> & {
  version?: number;
  history?: SetupVersion<D>[];
};

/** The current version (older records: 1). */
export const versionOf = (r: { version?: number }) => r.version ?? 1;

/** A setup as it was in a version; the current version (or an unknown one): the setup itself. */
export function atVersion<T extends Versioned<Partial<T>>>(r: T, version: number): T {
  const v = r.history?.find((h) => h.version === version);
  return v ? { ...r, ...v.data, version: v.version } : r;
}
