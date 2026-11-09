import { describe, expect, it } from "vitest";
import {
  cogsRepository,
  commonCodeRepository,
  fixedCostSummaryRepository,
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
} from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import { commonCodeService } from "@/services/commonCodeService";
import { routeCrud } from "@/services/routeService";
import { costItemCrud } from "@/services/costMasterService";
import {
  cogsService,
  currentCogsVehicleTypes,
  draftOfCogs,
  routeGroupOf,
  syncAllCogs,
} from "@/services/cost/cogsService";
import { mappingsFor } from "@/services/cost/cogsBuild";
import {
  defaultFuelVehicles,
  fuelRateFor,
  fuelUsers,
  fuelVehiclesOf,
  HEADER_ROW,
} from "@/services/cost/fuelRates";

describe("Cost modules stay in sync", () => {
  it("a route used by a COGS cannot be deleted", () => {
    const cogs = cogsRepository.all().find((c) => !c.deleted)!;
    const check = routeCrud.checkDelete(cogs.routeId);
    expect(check.canDelete).toBe(false);
    expect(check.reason).toMatch(/COGS/);
  });

  it("a Fare Code booked by a Fixed Cost Mapping or a variable cost setup cannot be deleted", () => {
    expect(costItemCrud.checkDelete("CI-TDS").reason).toMatch(/Salary Range/);
    expect(costItemCrud.checkDelete("CI-DEP").reason).toMatch(/Fixed Cost Mapping/);
  });

  it("an inactive Fixed Cost Mapping is not loaded into a COGS", () => {
    const vt = currentCogsVehicleTypes().find((t) => t.key === "TRUCK · 5 tấn")!;
    const all = fixedCostSummaryRepository.all();
    const before = mappingsFor(all, vt);
    expect(before.length).toBeGreaterThan(0);
    const off = all.map((m) =>
      m.id === before[0]!.id ? { ...m, status: "Inactive" as const } : m,
    );
    expect(mappingsFor(off, vt).map((m) => m.id)).not.toContain(before[0]!.id);
  });

  it("renaming a Container Type renames the Salary Range columns and their rates", () => {
    const sr = salaryRangeRepository.get("SR-H")!;
    expect(sr.containers.map((c) => c.container)).toContain("42RT");
    const rec = commonCodeRepository.get(CC.CONTAINER_TYPE)!;
    commonCodeService.save(rec.id, {
      remark: rec.remark,
      options: rec.options.map((o) => (o.name === "42RT" ? { ...o, name: "42R1" } : o)),
    });
    const next = salaryRangeRepository.get("SR-H")!;
    expect(next.containers.map((c) => c.container)).toContain("42R1");
    expect(next.containers.map((c) => c.container)).not.toContain("42RT");
    expect(next.tiers[1]!.containerRates?.["42R1"]).toBe(sr.tiers[1]!.containerRates?.["42RT"]);
  });

  it("COGS run by themselves: created for every route × vehicle type, worked out again on a change", () => {
    syncAllCogs();
    const live = () => cogsRepository.all().filter((c) => !c.deleted);
    const types = currentCogsVehicleTypes().filter((t) => !t.brand);
    for (const r of routeRepository
      .all()
      .filter((x) => !x.deleted && x.status === "Active" && x.outbound))
      for (const t of types.filter((x) => x.group <= routeGroupOf(r)))
        expect(live().some((c) => c.routeId === r.id && c.vehicleType === t.key)).toBe(true);
    // Code and name from the route and the vehicle type.
    const auto = live().find((c) => c.vehicleType === "TRUCK · 2 tấn" && c.code.endsWith("-T2"))!;
    expect(auto.code.startsWith(auto.routeCode.slice(0, 10))).toBe(true);
    expect(auto.name).toBe(`${auto.routeName} · TRUCK · 2 tấn`);
    // A dearer fuel: the COGS of that vehicle type follow.
    const before = auto.total;
    const t2 = currentCogsVehicleTypes().find((t) => t.key === "TRUCK · 2 tấn")!;
    const fu = fuelCostRepository.all().find((f) => f.fuelType === t2.fuelType)!;
    fuelCostRepository.update(fu.id, (f) => ({ ...f, fuelPrice: f.fuelPrice + 1_000 }));
    expect(syncAllCogs().updated).toBeGreaterThan(0);
    expect(cogsRepository.get(auto.id)!.total).toBeGreaterThan(before);
    // Nothing changed: nothing written.
    expect(syncAllCogs()).toEqual({ created: 0, updated: 0 });
  }, 30_000);

  it("a Fuel Rate set in the Fuel Cost replaces the vehicles' average in the COGS", () => {
    syncAllCogs();
    const t2 = currentCogsVehicleTypes().find((t) => t.key === "TRUCK · 2 tấn")!;
    const fu = fuelCostRepository.all().find((f) => f.fuelType === t2.fuelType)!;
    const fuelLine = () =>
      cogsRepository
        .all()
        .find((c) => !c.deleted && c.vehicleType === "TRUCK · 2 tấn" && c.code.endsWith("-T2"))!
        .lines.find((l) => l.component === "Fuel Cost")!;
    expect(fuelLine().basis).toMatch(/average of/);
    const avgAmount = fuelLine().amount;
    const avg = t2.fuelRates[t2.fuelType]!.avg;
    const types = currentCogsVehicleTypes();
    const list = fuelVehiclesOf(fu, types);
    // Every vehicle type running on the fuel is listed at first (no brands).
    expect(list.map((v) => v.vehicleType)).toEqual(
      defaultFuelVehicles(types, fu.fuelType).map((v) => v.vehicleType),
    );
    expect(list.some((v) => v.vehicleType.startsWith("TRUCK · 5 tấn · "))).toBe(false);
    const withRate = list.map((v) =>
      v.vehicleType === "TRUCK · 2 tấn" ? { ...v, rate: avg * 2 } : v,
    );
    fuelCostRepository.update(fu.id, (f) => ({ ...f, vehicles: withRate }));
    syncAllCogs();
    expect(fuelLine().basis).toMatch(/set in Fuel Cost/);
    expect(fuelLine().amount).toBeGreaterThan(avgAmount * 1.9);
    // Removed from the Fuel Cost: the COGS has no fuel for it.
    fuelCostRepository.update(fu.id, (f) => ({
      ...f,
      vehicles: withRate.filter((v) => !v.vehicleType.startsWith("TRUCK · 2 tấn")),
    }));
    syncAllCogs();
    expect(fuelLine().amount).toBe(0);
    expect(fuelLine().basis).toMatch(/not a vehicle type of Fuel Cost/);
  }, 30_000);

  it("burns the Estimate (K1 empty + K2 loaded) ÷ 2; one left empty stays the vehicles' average", () => {
    const types = currentCogsVehicleTypes();
    const type = types.find((t) => t.key === "TRUCK · 5 tấn")!;
    const f = (rate: number | null, rateLoaded: number | null) => ({
      fuelType: type.fuelType,
      vehicles: [{ vehicleType: type.key, rate, rateLoaded }],
    });
    expect(fuelRateFor(f(18, 24), type)).toMatchObject({ rate: 21, k1: 18, k2: 24, source: "set" });
    const avg = type.fuelRates[type.fuelType]!.avg;
    const est = (a: number, b: number) => Math.round(((a + b) / 2) * 100) / 100;
    // Typing K2 leaves K1 as it is (the average), and the other way round.
    expect(fuelRateFor(f(18, null), type)).toMatchObject({ k1: 18, k2: avg, rate: est(18, avg) });
    expect(fuelRateFor(f(null, 24), type)).toMatchObject({ k1: avg, k2: 24, rate: est(avg, 24) });
    expect(fuelRateFor(f(null, null), type)).toMatchObject({ rate: avg, source: "average" });
    // An older Fuel Cost (one rate, no K2): K2 = that rate, so it burns as before.
    const old = { fuelType: type.fuelType, vehicles: [{ vehicleType: type.key, rate: 18 }] };
    expect(fuelRateFor(old, type)).toMatchObject({ k1: 18, k2: 18, rate: 18 });
  });

  it("a brand burns the rate of its vehicle type (no brand of its own)", () => {
    const types = currentCogsVehicleTypes();
    const brand = types.find((t) => t.key.startsWith("TRUCK · 5 tấn · ") && t.fuelType)!;
    const type = types.find((t) => t.key === "TRUCK · 5 tấn")!;
    const f = { fuelType: brand.fuelType, vehicles: [{ vehicleType: type.key, rate: 20 }] };
    expect(fuelRateFor(f, brand)).toMatchObject({ rate: 20, source: "set" });
    // An older brand entry is not read, and not listed any more.
    const old = { ...f, vehicles: [...f.vehicles, { vehicleType: brand.key, rate: 25 }] };
    expect(fuelRateFor(old, brand)).toMatchObject({ rate: 20, source: "set" });
    expect(fuelVehiclesOf(old, types).map((v) => v.vehicleType)).toEqual([type.key]);
    expect(fuelUsers(types, brand.fuelType).some((t) => t.brand)).toBe(false);
    expect(fuelRateFor({ ...f, vehicles: [] }, brand)).toBeUndefined();
  });

  it("headers burn HEADER, or the rate of their container when one is set", () => {
    const types = currentCogsVehicleTypes();
    const h = types.find((t) => t.kind === "HEADER" && !t.brand && t.fuelType)!;
    const other = types.find((t) => t.kind === "HEADER" && !t.brand && t.key !== h.key)!;
    const avg = h.fuelRates[h.fuelType]!.avg;
    const base = { fuelType: h.fuelType, vehicles: [{ vehicleType: HEADER_ROW, rate: null }] };
    // Listed once as HEADER, not once per container.
    const list = defaultFuelVehicles(types, h.fuelType).map((v) => v.vehicleType);
    expect(list.filter((k) => k.startsWith("HEADER"))).toEqual([HEADER_ROW]);
    expect(fuelRateFor(base, h)).toMatchObject({ rate: avg, source: "average" });
    const set = { ...base, vehicles: [{ vehicleType: HEADER_ROW, rate: 40 }] };
    expect(fuelRateFor(set, h)).toMatchObject({ rate: 40, source: "set" });
    // A container with a rate of its own; another (or one left empty) burns HEADER.
    const own = {
      ...set,
      vehicles: [
        ...set.vehicles,
        { vehicleType: h.key, rate: 45 },
        { vehicleType: other.key, rate: null },
      ],
    };
    expect(fuelRateFor(own, h)).toMatchObject({ rate: 45 });
    expect(fuelRateFor(own, other)).toMatchObject({ rate: 40 });
    // An older list (a row per container, no rate): one HEADER.
    const old = {
      fuelType: h.fuelType,
      vehicles: [
        { vehicleType: h.key, rate: null },
        { vehicleType: other.key, rate: null },
      ],
    };
    expect(fuelVehiclesOf(old, types)).toEqual([{ vehicleType: HEADER_ROW, rate: null }]);
  });

  it("a COGS keeps its route and vehicle type", () => {
    const c = cogsRepository.all().find((x) => !x.deleted && x.vehicleType.startsWith("TRUCK"))!;
    expect(() =>
      cogsService.save({ ...draftOfCogs(c), vehicleType: "HEADER · 42GP" }, c.id),
    ).toThrow();
  });
});
