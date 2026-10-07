// Location master access for routing code. Kept free of service imports (the mock provider loads
// while repositories are still initialising), so only lazy access here.
import { locationRepository } from "@/repositories";
import type { LocationMasterRecord } from "@/mock-data/locations";

/** Every non-deleted location (incl. inactive) — for looking up stops saved earlier. */
export const allLocations = (): LocationMasterRecord[] =>
  locationRepository.all().filter((l) => !l.deleted);

/** Locations that can be picked for new stops. */
export const activeLocations = (): LocationMasterRecord[] =>
  allLocations().filter((l) => l.status === "Active");

/** Match by code, name or id (case-insensitive) — used by route import. */
export const findLocationByName = (name: string) => {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return activeLocations().find(
    (l) =>
      l.code?.toLowerCase() === n ||
      l.name.toLowerCase() === n ||
      `${l.name}, ${l.address}`.toLowerCase() === n,
  );
};
