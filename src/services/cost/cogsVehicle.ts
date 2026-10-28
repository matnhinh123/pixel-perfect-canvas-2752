// Vehicle types of Variable Cost and COGS, picked as in Master Data › Vehicle: TRUCK, then its Truck Type
// (load), or HEADER, then the Container Type it pulls (Common Code, ISO group code — the same list as the
// container columns of the Salary Ranges); then, optionally, the Brand. Keys: "TRUCK · 5 tấn",
// "TRUCK · 5 tấn · HINO", "HEADER · 42GP", "HEADER · 42RT · HYUNDAI". A type without a brand covers every
// brand. Older keys ("HEADER · 40 ft · Reefer") are still read.
// Pure (vehicles and container types are passed in), so the screens, the save and the seed agree.
import { BASE_OF_TYPE_NAME, TRAILER_TYPES, type VehicleMasterRecord } from "@/types";
import { CONTAINER_TYPES } from "@/mock-data/commonCodes";

export type VariableVehicleKind = "TRUCK" | "HEADER";

export interface VehicleKeyParts {
  kind: VariableVehicleKind;
  /** Truck Type (TRUCK) or Container Type (HEADER, ISO group code; old keys: trailer size). */
  spec: string;
  /** HEADER only: reefer container (ISO type R; old keys: "Reefer"). */
  reefer: boolean;
  /** Brand (Vehicle › Brand); "" = every brand. */
  brand: string;
}

export interface CogsVehicleType extends VehicleKeyParts {
  /** Stored on the setups and the COGS. */
  key: string;
  category: "Truck" | "Container";
  /** HEADER: the length of its container ("40 ft"), as the trailers' sizes; "" for a truck. */
  size: string;
  /** HEADER: name of the Container Type ("Reefer (40 ft)"); "" for a truck. */
  specName: string;
  /** Toll vehicle group (1..5): the vehicles' Vehicle Group / Container Size Mapping. */
  group: number;
  vehicleCount: number;
  /** Average Fuel Rate (per 100 km) of those vehicles; 0 = none entered. */
  fuelNorm: number;
  /** Fuel Type most of those vehicles run on; "" = none entered. */
  fuelType: string;
  /** Every Fuel Type those vehicles run on. */
  fuelTypes: string[];
  /** Fuel Rate (per 100 km) of those vehicles, by Fuel Type: smallest, largest, average, how many. */
  fuelRates: Record<string, { min: number; max: number; avg: number; vehicles: number }>;
}

/** A Container Type (Common Code): ISO group code, its length and its name. */
export interface ContainerTypeChoice {
  iso: string;
  size: string;
  name: string;
}
/** The Container Types of the demo seed (screens pass the live Common Code list). */
export const SEED_CONTAINER_TYPES: ContainerTypeChoice[] = CONTAINER_TYPES.map((c) => ({
  iso: c[0],
  size: c[6],
  name: c[3],
}));

const SEP = " · ";
export const REEFER = "Reefer";
/** A header spec that is a Container Type code (not an old trailer size such as "40 ft"). */
const isContainerCode = (spec: string) => !!spec && !/\bft$/i.test(spec);
/** Reefer Container Type: ISO type letter R ("22RT", "42RT", "45RT"). */
export const isReeferCode = (iso: string) => iso[2] === "R";

export const vehicleKey = (v: {
  kind: VariableVehicleKind;
  spec: string;
  reefer?: boolean;
  brand?: string;
}) =>
  [
    v.kind,
    v.spec,
    v.kind === "HEADER" && v.reefer && !isContainerCode(v.spec) ? REEFER : "",
    v.brand ?? "",
  ]
    .filter(Boolean)
    .join(SEP);
export function parseVehicleKey(key: string): VehicleKeyParts | undefined {
  const [kind, spec = "", ...rest] = key.split(SEP).map((s) => s.trim());
  if (kind !== "TRUCK" && kind !== "HEADER") return undefined;
  const oldReefer = kind === "HEADER" && rest[0] === REEFER;
  const reefer = kind === "HEADER" && (oldReefer || (isContainerCode(spec) && isReeferCode(spec)));
  const brand = (oldReefer ? rest[1] : rest[0]) ?? "";
  return { kind, spec, reefer, brand };
}
export const specLabel = (kind: VariableVehicleKind) =>
  kind === "TRUCK" ? "Truck Type" : "Container Type";
/** The same type with every brand (the setups of all brands apply to it). */
export const withoutBrand = (key: string) => {
  const p = parseVehicleKey(key);
  return p ? vehicleKey({ ...p, brand: "" }) : key;
};
/**
 * Does a setup made for `setupKey` apply to a vehicle of `key`? Same type (kind, Truck Type /
 * Container Type) and either no brand on the setup or the same brand. A bare "HEADER" (Salary Range)
 * applies to every header.
 */
export function coversVehicle(setupKey: string, key: string): boolean {
  const s = parseVehicleKey(setupKey);
  const v = parseVehicleKey(key);
  if (!s || !v) return setupKey === key;
  if (s.kind === "HEADER" && !s.spec) return v.kind === "HEADER";
  return (
    s.kind === v.kind &&
    s.spec === v.spec &&
    s.reefer === v.reefer &&
    (!s.brand || s.brand === v.brand)
  );
}

/** Container of a header key ("HEADER · 42RT · HINO" → "42RT"; old "HEADER · 40 ft · Reefer" → "40 ft · Reefer"). */
export function containerOf(key: string): string {
  const p = parseVehicleKey(key);
  if (p?.kind !== "HEADER" || !p.spec) return "";
  if (isContainerCode(p.spec)) return p.spec;
  return p.reefer ? `${p.spec}${SEP}${REEFER}` : p.spec;
}
/** Length of an ISO group code (Common Code Container Type): 1st character 2 / 4 / L. */
const ISO_LENGTH: Record<string, string> = { "2": "20 ft", "4": "40 ft", L: "45 ft" };
/**
 * Does a container column of a Salary Range (ISO group code "42RT") apply to a header key? The same
 * Container Type; an old key ("HEADER · 40 ft · Reefer") by length and reefer (R) / general purpose (G).
 */
export function isoFitsVehicle(iso: string, key: string): boolean {
  const p = parseVehicleKey(key);
  if (p?.kind !== "HEADER" || !p.spec) return false;
  if (isContainerCode(p.spec)) return p.spec === iso;
  return ISO_LENGTH[iso[0] ?? ""] === p.spec && iso[2] === (p.reefer ? "R" : "G");
}
/** Vehicle types of a Salary Range: every Truck Type (all brands), and "HEADER". */
export const salaryVehicleChoices = (types: readonly CogsVehicleType[]) => [
  ...types.filter((t) => t.kind === "TRUCK" && !t.brand).map((t) => t.key),
  ...(types.some((t) => t.kind === "HEADER") ? ["HEADER"] : []),
];

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
const fuelOf = (list: VehicleMasterRecord[]) => {
  const fuelTypes = [...new Set(list.map((v) => v.fuelType).filter(Boolean))].sort();
  const fuelRates = Object.fromEntries(
    fuelTypes.map((ft) => {
      const vs = list.filter((v) => v.fuelType === ft);
      const rates = vs.map((v) => Number(v.fuelRate)).filter((r) => r > 0);
      return [
        ft,
        {
          min: rates.length ? Math.min(...rates) : 0,
          max: rates.length ? Math.max(...rates) : 0,
          avg: avg(rates),
          vehicles: vs.length,
        },
      ];
    }),
  );
  return {
    fuelNorm: avg(list.map((v) => Number(v.fuelRate))),
    fuelType: modeText(list.map((v) => v.fuelType)),
    fuelTypes,
    fuelRates,
  };
};

/**
 * Vehicle types of the active vehicles: each Truck Type, and each Container Type a header can pull (its
 * length is a trailer size of the fleet), every brand first, then one per brand.
 */
export function cogsVehicleTypes(
  vehicles: readonly VehicleMasterRecord[],
  containers: readonly ContainerTypeChoice[] = SEED_CONTAINER_TYPES,
): CogsVehicleType[] {
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
        size: "",
        specName: "",
        group: mode(list.map((v) => groupNo(v.vehicleGroup))) || 1,
        vehicleCount: list.length,
        ...fuelOf(list),
      });
    }
  }

  // Headers: one type per Container Type of a trailer length of the fleet, then one per head brand.
  const heads = live.filter((v) => base(v) === "HEAD");
  if (heads.length) {
    const trailers = live.filter((v) => base(v) === "TRAILER" && v.trailerSize);
    const sizes = new Set(
      trailers.length ? trailers.map((v) => v.trailerSize) : [...TRAILER_TYPES],
    );
    const list = containers
      .filter((c) => sizes.has(c.size))
      .sort((a, b) => sizeOf(a.size) - sizeOf(b.size) || a.iso.localeCompare(b.iso));
    for (const c of list)
      for (const brand of ["", ...brandsOf(heads)]) {
        const hs = brand ? heads.filter((v) => v.tradeMark === brand) : heads;
        const mapped = hs.flatMap((h) =>
          h.containerMappings
            .filter((m) => m.trailerType.includes(c.size))
            .map((m) => groupNo(m.vehicleGroup)),
        );
        out.push({
          key: vehicleKey({ kind: "HEADER", spec: c.iso, brand }),
          kind: "HEADER",
          category: "Container",
          spec: c.iso,
          reefer: isReeferCode(c.iso),
          brand,
          size: c.size,
          specName: `${c.name} (${c.size})`,
          group: mode(mapped) || (sizeOf(c.size) <= 20 ? 4 : 5),
          vehicleCount: hs.length,
          ...fuelOf(hs),
        });
      }
  }
  return out;
}
