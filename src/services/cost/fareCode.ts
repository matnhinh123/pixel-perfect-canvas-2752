// Fare Code of a variable cost setup (Salary Range, Fuel Cost, Toll Fee): typed as its code, stored as the
// id of the Fare Code (Fare Code Management). Empty: the setup is not booked to a Fare Code yet.
import { costItemRepository } from "@/repositories";
import type { CostItemRecord } from "@/types";

/** Fare Codes that can be picked: live and Active. */
export const activeFares = (): CostItemRecord[] =>
  costItemRepository.all().filter((c) => !c.deleted && c.status === "Active");

/** The id of the Fare Code typed, or the error to show; nothing typed: no Fare Code. */
export function fareIdOf(code: string): { id?: string; error?: string } {
  const c = code.trim().toUpperCase();
  if (!c) return {};
  const hit = activeFares().find((x) => x.code.toUpperCase() === c);
  return hit ? { id: hit.id } : { error: `Fare Code ${c} is not an active Fare Code.` };
}

/** Code of a Fare Code id ("" when there is none). */
export const fareCodeOf = (id?: string) => (id && costItemRepository.get(id)?.code) || "";

/** "TOL · Toll Fee" for a Fare Code id ("" when there is none). */
export const fareLabelOf = (id?: string) => {
  const c = id ? costItemRepository.get(id) : undefined;
  return c ? `${c.code} · ${c.name}` : "";
};
