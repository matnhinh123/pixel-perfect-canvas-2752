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

describe("Cost modules stay in sync", () => {
  it("a route used by a COGS cannot be deleted", () => {
    const cogs = cogsRepository.all().find((c) => !c.deleted)!;
    const check = routeCrud.checkDelete(cogs.routeId);
    expect(check.canDelete).toBe(false);
    expect(check.reason).toMatch(/COGS/);
  });

  it("a Fare Code booked by a Fixed / Variable Cost Mapping cannot be deleted", () => {
    expect(costItemCrud.checkDelete("CI-TDS").reason).toMatch(/Variable Cost Mapping/);
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

  it("a COGS keeps its route and vehicle type", () => {
    const c = cogsRepository.all().find((x) => !x.deleted && x.vehicleType.startsWith("TRUCK"))!;
    expect(() =>
      cogsService.save({ ...draftOfCogs(c), vehicleType: "HEADER · 42GP" }, c.id),
    ).toThrow();
  });
});
