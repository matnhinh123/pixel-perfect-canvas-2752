import { describe, expect, it } from "vitest";
import { deriveReturnLeg, reverseLeg } from "@/services/routing/routingService";
import type { RouteCalculation, TollStation } from "@/types";

const toll = (id: string, price: number, addedTo?: TollStation["addedTo"]): TollStation => ({
  id,
  name: id,
  feeType: "Toll",
  price,
  vehicleTollGroup: "Class 3",
  passCount: 1,
  source: addedTo ? "Manual" : "Vietmap",
  ...(addedTo ? { addedTo } : {}),
});

const leg = (tollStations: TollStation[]): RouteCalculation => ({
  distance: 100,
  estimatedTime: 90,
  geometry: [
    [10, 106],
    [11, 107],
  ],
  bbox: null,
  instructions: [],
  tollCost: tollStations.reduce((n, t) => n + t.price, 0),
  tollStations,
  warnings: [],
  roadTypes: { national: 0, expressway: 0, other: 0 },
  provider: "mock",
  calculatedAt: "",
});

const ids = (c: RouteCalculation) => c.tollStations.map((t) => t.id);

describe("Toll direction (Add Toll → Outbound / Return)", () => {
  it("without manual tolls the return leg is the outbound reversed", () => {
    const out = leg([toll("A", 10), toll("B", 20)]);
    expect(deriveReturnLeg(out)).toEqual(reverseLeg(out));
  });

  it("a toll added to the Outbound is not mirrored on the Return", () => {
    const out = leg([toll("A", 10), toll("B", 20), toll("M", 5, "Outbound")]);
    const ret = deriveReturnLeg(out);
    expect(ids(ret)).toEqual(["B", "A"]);
    expect(ret.tollCost).toBe(30);
  });

  it("a toll added to the Return survives re-deriving the return leg", () => {
    const out = leg([toll("A", 10)]);
    const prev = { ...reverseLeg(out), tollStations: [toll("A", 10), toll("R", 7, "Return")] };
    const ret = deriveReturnLeg(out, prev);
    expect(ids(ret)).toEqual(["A", "R"]);
    expect(ret.tollCost).toBe(17);
  });
});
