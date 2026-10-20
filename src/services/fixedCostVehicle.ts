// Vehicle types of a Fixed Cost, picked like on the Vehicle form: Vehicle Type, then Truck Type
// (truck) or Trailer Size (trailer), then Brand — only combinations an active vehicle has.
// Stored as labels: "TRUCK · 5 tấn", "TRUCK · 5 tấn · HINO", "HEADER · HYUNDAI", "TRAILER · 40 ft".
import { BASE_OF_TYPE_NAME, type VehicleMasterRecord } from "@/types";

export type FcVehicleKind = "TRUCK" | "HEADER" | "TRAILER";
export const FC_VEHICLE_KINDS: readonly FcVehicleKind[] = ["TRUCK", "HEADER", "TRAILER"];

export interface FcVehicle {
  kind: FcVehicleKind;
  /** Truck Type (TRUCK) or Trailer Size (TRAILER); "" for HEADER. */
  spec: string;
  /** "" = every brand. */
  brand: string;
}

const SEP = " · ";
export const specLabelOf = (kind: FcVehicleKind | "") =>
  kind === "TRUCK" ? "Truck Type" : kind === "TRAILER" ? "Trailer Size" : "";
export const needsSpec = (kind: FcVehicleKind | "") => kind === "TRUCK" || kind === "TRAILER";

export const fcVehicleLabel = (v: FcVehicle) =>
  [v.kind, needsSpec(v.kind) ? v.spec : "", v.brand].filter(Boolean).join(SEP);

/** Label → parts; undefined when the label is not one of ours. */
export function parseFcVehicle(label: string): FcVehicle | undefined {
  const [kind, ...rest] = label.split("·").map((s) => s.trim());
  const k = FC_VEHICLE_KINDS.find((x) => x === (kind ?? "").toUpperCase());
  if (!k) return undefined;
  if (!needsSpec(k))
    return rest.length <= 1 ? { kind: k, spec: "", brand: rest[0] ?? "" } : undefined;
  if (rest.length > 2) return undefined;
  return { kind: k, spec: rest[0] ?? "", brand: rest[1] ?? "" };
}

const kindOf = (v: VehicleMasterRecord): FcVehicleKind | undefined => {
  const b = BASE_OF_TYPE_NAME[v.vehicleType];
  return b === "HEAD" ? "HEADER" : b;
};
const specOf = (v: VehicleMasterRecord, k: FcVehicleKind) =>
  k === "TRUCK" ? v.truckType : k === "TRAILER" ? v.trailerSize : "";
const live = (vehicles: readonly VehicleMasterRecord[]) =>
  vehicles.filter((v) => !v.deleted && v.status === "Active");
const sortTons = (a: string, b: string) =>
  (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b);

/** Active vehicles that a selection covers. */
export const vehiclesOf = (sel: FcVehicle, vehicles: readonly VehicleMasterRecord[]) =>
  live(vehicles).filter(
    (v) =>
      kindOf(v) === sel.kind &&
      (!needsSpec(sel.kind) || specOf(v, sel.kind) === sel.spec) &&
      (!sel.brand || v.tradeMark === sel.brand),
  );

/** Pick lists built from the active vehicles. */
export function fcVehicleOptions(vehicles: readonly VehicleMasterRecord[]) {
  const list = live(vehicles);
  const kinds = FC_VEHICLE_KINDS.filter((k) => list.some((v) => kindOf(v) === k));
  const specs = (k: FcVehicleKind | "") =>
    k && needsSpec(k)
      ? [
          ...new Set(
            list
              .filter((v) => kindOf(v) === k)
              .map((v) => specOf(v, k))
              .filter(Boolean),
          ),
        ].sort(sortTons)
      : [];
  const brands = (k: FcVehicleKind | "", spec: string) =>
    k
      ? [
          ...new Set(
            vehiclesOf({ kind: k, spec, brand: "" }, list)
              .map((v) => v.tradeMark)
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b))
      : [];
  return { kinds, specs, brands };
}

/** Errors of a list of vehicle labels (unknown, incomplete, duplicate or no vehicle behind it). */
export function fcVehicleErrors(
  labels: readonly string[],
  vehicles: readonly VehicleMasterRecord[],
): string | null {
  const seen = new Set<string>();
  for (const [i, label] of labels.entries()) {
    const v = parseFcVehicle(label);
    const n = `Vehicle Type row ${i + 1}`;
    if (!v) return `${n}: pick a Vehicle Type${label ? ` (“${label}” is not valid)` : ""}.`;
    if (needsSpec(v.kind) && !v.spec) return `${n}: pick a ${specLabelOf(v.kind)}.`;
    const key = fcVehicleLabel(v).toLowerCase();
    if (seen.has(key)) return `${n}: ${fcVehicleLabel(v)} is listed twice.`;
    seen.add(key);
    if (!vehiclesOf(v, vehicles).length)
      return `${n}: no active vehicle is ${fcVehicleLabel(v)} in Vehicle.`;
  }
  return null;
}

/** Does a fixed-cost vehicle row cover a COGS vehicle type (truck type / header + trailer size)? */
export function coversCogsVehicle(
  label: string,
  cogs: { kind: "TRUCK" | "HEADER"; spec: string },
): boolean {
  const v = parseFcVehicle(label);
  if (!v) return false;
  if (cogs.kind === "TRUCK") return v.kind === "TRUCK" && v.spec === cogs.spec;
  return v.kind === "HEADER" || (v.kind === "TRAILER" && v.spec === cogs.spec);
}

/** Vehicle types a Summary / list filter can pick: Vehicle Type + Truck Type / Trailer Size (no brand). */
export function vehicleTypeChoices(vehicles: readonly VehicleMasterRecord[]): string[] {
  const o = fcVehicleOptions(vehicles);
  return o.kinds.flatMap((kind) =>
    needsSpec(kind)
      ? o.specs(kind).map((spec) => fcVehicleLabel({ kind, spec, brand: "" }))
      : [fcVehicleLabel({ kind, spec: "", brand: "" })],
  );
}

/** Does a fixed-cost vehicle row fall under a choice of vehicleTypeChoices() (any brand)? */
export function coversChoice(label: string, choice: string): boolean {
  const v = parseFcVehicle(label);
  const c = parseFcVehicle(choice);
  return !!v && !!c && v.kind === c.kind && (!needsSpec(c.kind) || v.spec === c.spec);
}
