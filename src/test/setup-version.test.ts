import { describe, expect, it } from "vitest";
import { fuelCostRepository, salaryRangeRepository } from "@/repositories";
import {
  fuelCostService,
  salaryRangeService,
  type FuelCostDraft,
  type SalaryRangeDraft,
} from "@/services/cost/variableSetup";
import { ruleOf } from "@/services/cost/salaryRange";
import { salaryVehiclesOf } from "@/services/cost/cogsVehicle";
import { setupsFor } from "@/services/cost/cogsBuild";
import { atVersion, versionOf } from "@/services/cost/versions";
import { fareCodeOf } from "@/services/cost/fareCode";
import type { FuelCostRecord, SalaryRangeRecord } from "@/types";

const salaryDraft = (r: SalaryRangeRecord): SalaryRangeDraft => ({
  code: r.code,
  name: r.name,
  vehicleTypes: salaryVehiclesOf(r),
  tiers: r.tiers.map((t) => ({ ...t })),
  containers: r.containers.map((c) => ({ ...c })),
  rule: ruleOf(r.rule),
  fareCode: fareCodeOf(r.fareCostId),
  remark: r.remark,
  status: r.status,
});
const fuelDraft = (r: FuelCostRecord): FuelCostDraft => ({
  code: r.code,
  name: r.name ?? `${r.fuelType} Fuel Cost`,
  fuelType: r.fuelType,
  fuelPrice: r.fuelPrice,
  vehicles: r.vehicles ?? [],
  fareCode: fareCodeOf(r.fareCostId),
  remark: r.remark,
  status: r.status === "Inactive" ? "Inactive" : "Active",
});

describe("Salary Range and Fuel Cost keep their versions", () => {
  it("a Salary Range goes up a version on each save that changes it, and keeps the old one", () => {
    const r = salaryRangeRepository.all().find((x) => !x.deleted && x.status === "Active")!;
    const v = versionOf(r);
    const oldName = r.name;
    // Saved as it is: no new version.
    expect(versionOf(salaryRangeService.save(salaryDraft(r), r.id))).toBe(v);
    const next = salaryRangeService.save({ ...salaryDraft(r), name: `${oldName} B` }, r.id);
    expect(versionOf(next)).toBe(v + 1);
    expect(next.history!.at(-1)).toMatchObject({ version: v, data: { name: oldName } });
    // The earlier version, as it was.
    expect(atVersion(next, v).name).toBe(oldName);
    expect(atVersion(next, v + 1).name).toBe(`${oldName} B`);
  });

  it("a new Salary Range starts at version 1; a copy too", () => {
    const r = salaryRangeRepository.all().find((x) => !x.deleted)!;
    expect(versionOf(salaryRangeService.duplicate(r.id))).toBe(1);
  });

  it("a Fuel Cost goes up a version when its price or vehicle types change", () => {
    const f = fuelCostRepository.all().find((x) => !x.deleted)!;
    const v = versionOf(f);
    const next = fuelCostService.save({ ...fuelDraft(f), fuelPrice: f.fuelPrice + 500 }, f.id);
    expect(versionOf(next)).toBe(v + 1);
    expect(atVersion(next, v).fuelPrice).toBe(f.fuelPrice);
    expect(versionOf(fuelCostService.save(fuelDraft(next), f.id))).toBe(v + 1);
  });
});

describe("A Salary Range pays one or more Truck Types, or Header alone", () => {
  it("covers each of its Truck Types; a Header takes no Truck Type; a Truck Type is in one only", () => {
    const r = salaryRangeRepository
      .all()
      .find((x) => !x.deleted && x.vehicleType === "TRUCK · 2 tấn")!;
    const other = salaryRangeRepository
      .all()
      .find((x) => !x.deleted && x.status !== "Draft" && x.vehicleType === "TRUCK · 5 tấn")!;
    // Taken by another Salary Range: refused.
    expect(() =>
      salaryRangeService.save(
        { ...salaryDraft(r), vehicleTypes: ["TRUCK · 2 tấn", "TRUCK · 5 tấn"] },
        r.id,
      ),
    ).toThrow();
    // Freed (the other one back to Draft): both paid by the first one, which COGS finds for either.
    salaryRangeRepository.update(other.id, (x) => ({ ...x, status: "Draft" }));
    const both = salaryRangeService.save(
      { ...salaryDraft(r), vehicleTypes: ["TRUCK · 2 tấn", "TRUCK · 5 tấn"] },
      r.id,
    );
    expect(salaryVehiclesOf(both)).toEqual(["TRUCK · 2 tấn", "TRUCK · 5 tấn"]);
    expect(setupsFor(salaryRangeRepository.all(), "TRUCK · 5 tấn")[0]?.id).toBe(r.id);
    expect(() =>
      salaryRangeService.save(
        { ...salaryDraft(r), vehicleTypes: ["HEADER", "TRUCK · 2 tấn"] },
        r.id,
      ),
    ).toThrow();
  });
});
