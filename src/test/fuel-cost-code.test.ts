import { describe, expect, it } from "vitest";
import { fuelCostRepository } from "@/repositories";
import {
  fuelCostService,
  validateFuelCost,
  type FuelCostDraft,
} from "@/services/cost/variableSetup";
import type { FuelCostRecord } from "@/types";
import { fareCodeOf } from "@/services/cost/fareCode";

const draftOf = (r: FuelCostRecord, p: Partial<FuelCostDraft> = {}): FuelCostDraft => ({
  code: r.code,
  name: r.name ?? `${r.fuelType} Fuel Cost`,
  fuelType: r.fuelType,
  fuelPrice: r.fuelPrice,
  vehicles: r.vehicles ?? [],
  fareCode: fareCodeOf(r.fareCostId),
  remark: r.remark,
  status: r.status === "Inactive" ? "Inactive" : "Active",
  ...p,
});

describe("Fuel Cost Code", () => {
  it("can be changed, stays unique and well-formed", () => {
    const [a, b] = fuelCostRepository.all().filter((r) => !r.deleted);
    expect(validateFuelCost(draftOf(a!, { code: b!.code }), a!.id)["code"]).toMatch(/already used/);
    expect(validateFuelCost(draftOf(a!, { code: "" }), a!.id)["code"]).toMatch(/required/);
    expect(validateFuelCost(draftOf(a!, { code: "HAS SPACE" }), a!.id)["code"]).toMatch(/may only/);
    const saved = fuelCostService.save(draftOf(a!, { code: "fu-diesel-hcm" }), a!.id);
    expect(saved.code).toBe("FU-DIESEL-HCM");
  });
});
