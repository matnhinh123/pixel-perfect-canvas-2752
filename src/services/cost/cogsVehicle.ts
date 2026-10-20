// Vehicle types a COGS can be built for: taken from the vehicles set up in Master Data > Vehicle.
// Truck → one type per Truck Type ("Truck 5 tấn"); Header → one type per trailer size ("Header + 40 ft").
// Pure (the vehicles are passed in), so the screen, the save and the demo seed agree.
import { BASE_OF_TYPE_NAME, TRAILER_TYPES, type VehicleMasterRecord } from "@/types";
import { VEHICLE_TYPES_BY_CATEGORY } from "./salaryRange";

export interface CogsVehicleType {
  /** Stored on the COGS, e.g. "Truck 5 tấn", "Header + 40 ft". */
  key: string;
  kind: "TRUCK" | "HEADER";
  /** Toll vehicle group (1..5): the vehicles' Vehicle Group / Container Size Mapping. */
  group: number;
  vehicleCount: number;
  /** Average Fuel Rate (l/100km) of those vehicles; 0 = none entered. */
  fuelNorm: number;
  /** Salary Range table (Variable Cost) used for the driver salary. */
  salaryTable: string;
  /** Truck Type (TRUCK) or trailer size (HEADER) — Fixed Costs of that vehicle apply. */
  spec: string;
}

const groupNo = (g: string) => Number(/(\d+)/.exec(g)?.[1] ?? 0);
/** Most frequent non-zero value. */
const mode = (xs: number[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};
const avg = (xs: number[]) => {
  const ok = xs.filter((x) => x > 0);
  return ok.length ? Math.round((ok.reduce((s, x) => s + x, 0) / ok.length) * 10) / 10 : 0;
};
const tonsOf = (s: string) => Number(/(\d+(?:[.,]\d+)?)/.exec(s)?.[1]?.replace(",", ".") ?? 0);

/** Truck salary table for a load class: the smallest table that carries it, else the largest. */
const truckTable = (tons: number) => {
  const tables = VEHICLE_TYPES_BY_CATEGORY.Truck.map((t) => ({ t, tons: tonsOf(t) })).sort(
    (a, b) => a.tons - b.tons,
  );
  return (tables.find((x) => x.tons >= tons) ?? tables[tables.length - 1])?.t ?? "";
};

export function cogsVehicleTypes(vehicles: readonly VehicleMasterRecord[]): CogsVehicleType[] {
  const live = vehicles.filter((v) => !v.deleted && v.status === "Active");
  const base = (v: VehicleMasterRecord) => BASE_OF_TYPE_NAME[v.vehicleType];
  const out: CogsVehicleType[] = [];

  const trucks = live.filter((v) => base(v) === "TRUCK" && v.truckType);
  const truckTypes = [...new Set(trucks.map((v) => v.truckType))].sort(
    (a, b) => tonsOf(a) - tonsOf(b),
  );
  for (const tt of truckTypes) {
    const list = trucks.filter((v) => v.truckType === tt);
    const tons = tonsOf(tt);
    out.push({
      key: `Truck ${tt}`,
      kind: "TRUCK",
      group: mode(list.map((v) => groupNo(v.vehicleGroup))) || 1,
      vehicleCount: list.length,
      fuelNorm: avg(list.map((v) => Number(v.fuelRate))),
      salaryTable: truckTable(tons),
      spec: tt,
    });
  }

  const heads = live.filter((v) => base(v) === "HEAD");
  if (heads.length) {
    const trailerSizes = live
      .filter((v) => base(v) === "TRAILER" && v.trailerSize)
      .map((v) => v.trailerSize);
    const sizes = [...new Set(trailerSizes.length ? trailerSizes : TRAILER_TYPES)].sort(
      (a, b) => tonsOf(a) - tonsOf(b),
    );
    for (const size of sizes) {
      const ft = tonsOf(size);
      const mapped = heads.flatMap((h) =>
        h.containerMappings
          .filter((m) => m.trailerType === size)
          .map((m) => groupNo(m.vehicleGroup)),
      );
      out.push({
        key: `Header + ${size}`,
        kind: "HEADER",
        group: mode(mapped) || (ft <= 20 ? 4 : 5),
        vehicleCount: heads.length,
        fuelNorm: avg(heads.map((v) => Number(v.fuelRate))),
        salaryTable: VEHICLE_TYPES_BY_CATEGORY.Container[0] ?? "",
        spec: size,
      });
    }
  }
  return out;
}
