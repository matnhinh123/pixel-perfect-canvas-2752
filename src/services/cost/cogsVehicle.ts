// Vehicle types of Variable Cost and COGS, picked as in Master Data › Vehicle: TRUCK, then its Truck Type
// (load), or HEADER, then the container behind it (trailer size) and whether it is a reefer (cont lạnh);
// then, optionally, the Brand. Keys: "TRUCK · 5 tấn", "TRUCK · 5 tấn · HINO", "HEADER · 40 ft",
// "HEADER · 40 ft · Reefer · HYUNDAI". A type without a brand covers every brand.
// Pure (the vehicles are passed in), so the screens, the save and the seed agree.
import { BASE_OF_TYPE_NAME, TRAILER_TYPES, type VehicleMasterRecord } from "@/types";

export type VariableVehicleKind = "TRUCK" | "HEADER";

export interface VehicleKeyParts {
  kind: VariableVehicleKind;
  /** Truck Type (TRUCK) or container / trailer size (HEADER). */
  spec: string;
  /** HEADER only: reefer container (cont lạnh). */
  reefer: boolean;
  /** Brand (Vehicle › Brand); "" = every brand. */
  brand: string;
}

export interface CogsVehicleType extends VehicleKeyParts {
  /** Stored on the setups and the COGS. */
  key: string;
  category: "Truck" | "Container";
  /** Toll vehicle group (1..5): the vehicles' Vehicle Group / Container Size Mapping. */
  group: number;
  vehicleCount: number;
  /** Average Fuel Rate (per 100 km) of those vehicles; 0 = none entered. */
  fuelNorm: number;
  /** Fuel Type most of those vehicles run on; "" = none entered. */
  fuelType: string;
  /** Every Fuel Type those vehicles run on. */
  fuelTypes: string[];
}

const SEP = " · ";
export const REEFER = "Reefer";
export const vehicleKey = (v: {
  kind: VariableVehicleKind;
  spec: string;
  reefer?: boolean;
  brand?: string;
}) =>
  [v.kind, v.spec, v.kind === "HEADER" && v.reefer ? REEFER : "", v.brand ?? ""]
    .filter(Boolean)
    .join(SEP);
export function parseVehicleKey(key: string): VehicleKeyParts | undefined {
  const [kind, spec, ...rest] = key.split(SEP).map((s) => s.trim());
  if (kind !== "TRUCK" && kind !== "HEADER") return undefined;
  const reefer = kind === "HEADER" && rest[0] === REEFER;
  const brand = (reefer ? rest[1] : rest[0]) ?? "";
  return { kind, spec: spec ?? "", reefer, brand };
}
export const specLabel = (kind: VariableVehicleKind) =>
  kind === "TRUCK" ? "Truck Type" : "Container";
/** The same type with every brand (the setups of all brands apply to it). */
export const withoutBrand = (key: string) => {
  const p = parseVehicleKey(key);
  return p ? vehicleKey({ ...p, brand: "" }) : key;
};
/**
 * Does a setup made for `setupKey` apply to a vehicle of `key`? Same type (kind, Truck Type /
 * Container, reefer) and either no brand on the setup or the same brand.
 */
export function coversVehicle(setupKey: string, key: string): boolean {
  const s = parseVehicleKey(setupKey);
  const v = parseVehicleKey(key);
  if (!s || !v) return setupKey === key;
  return (
    s.kind === v.kind &&
    s.spec === v.spec &&
    s.reefer === v.reefer &&
    (!s.brand || s.brand === v.brand)
  );
}

const groupNo = (g: string) => Number(/(\d+)/.exec(g)?.[1] ?? 0);
/** Most frequent non-zero value. */
const mode = (xs: number[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};
const modeText = (xs: string[]) => {
  const n = new Map<string, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
};
const avg = (xs: number[]) => {
  const ok = xs.filter((x) => x > 0);
  return ok.length ? Math.round((ok.reduce((s, x) => s + x, 0) / ok.length) * 10) / 10 : 0;
};
const sizeOf = (s: string) => Number(/(\d+(?:[.,]\d+)?)/.exec(s)?.[1]?.replace(",", ".") ?? 0);
const brandsOf = (list: VehicleMasterRecord[]) =>
  [...new Set(list.map((v) => v.tradeMark).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const fuelOf = (list: VehicleMasterRecord[]) => ({
  fuelNorm: avg(list.map((v) => Number(v.fuelRate))),
  fuelType: modeText(list.map((v) => v.fuelType)),
  fuelTypes: [...new Set(list.map((v) => v.fuelType).filter(Boolean))].sort(),
});

export function cogsVehicleTypes(vehicles: readonly VehicleMasterRecord[]): CogsVehicleType[] {
  const live = vehicles.filter((v) => !v.deleted && v.status === "Active");
  const base = (v: VehicleMasterRecord) => BASE_OF_TYPE_NAME[v.vehicleType];
  const out: CogsVehicleType[] = [];

  // Trucks: one type per Truck Type (every brand), then one per brand of it.
  const trucks = live.filter((v) => base(v) === "TRUCK" && v.truckType);
  const truckTypes = [...new Set(trucks.map((v) => v.truckType))].sort(
    (a, b) => sizeOf(a) - sizeOf(b),
  );
  for (const tt of truckTypes) {
    const all = trucks.filter((v) => v.truckType === tt);
    for (const brand of ["", ...brandsOf(all)]) {
      const list = brand ? all.filter((v) => v.tradeMark === brand) : all;
      out.push({
        key: vehicleKey({ kind: "TRUCK", spec: tt, brand }),
        kind: "TRUCK",
        category: "Truck",
        spec: tt,
        reefer: false,
        brand,
        group: mode(list.map((v) => groupNo(v.vehicleGroup))) || 1,
        vehicleCount: list.length,
        ...fuelOf(list),
      });
    }
  }

  // Headers: one type per container size of the trailers (dry, and reefer), then one per head brand.
  const heads = live.filter((v) => base(v) === "HEAD");
  if (heads.length) {
    const trailers = live.filter((v) => base(v) === "TRAILER" && v.trailerSize);
    const sizes = [
      ...new Set(trailers.length ? trailers.map((v) => v.trailerSize) : [...TRAILER_TYPES]),
    ].sort((a, b) => sizeOf(a) - sizeOf(b));
    for (const size of sizes) {
      const ft = sizeOf(size);
      for (const reefer of [false, true])
        for (const brand of ["", ...brandsOf(heads)]) {
          const list = brand ? heads.filter((v) => v.tradeMark === brand) : heads;
          const mapped = list.flatMap((h) =>
            h.containerMappings
              .filter((m) => m.trailerType.includes(size))
              .map((m) => groupNo(m.vehicleGroup)),
          );
          out.push({
            key: vehicleKey({ kind: "HEADER", spec: size, reefer, brand }),
            kind: "HEADER",
            category: "Container",
            spec: size,
            reefer,
            brand,
            group: mode(mapped) || (ft <= 20 ? 4 : 5),
            vehicleCount: list.length,
            ...fuelOf(list),
          });
        }
    }
  }
  return out;
}
