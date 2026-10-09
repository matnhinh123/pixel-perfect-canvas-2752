import { describe, expect, it } from "vitest";
import { vehicleGroupFor } from "@/services/routing/RouteProvider";

describe("Route Vehicle Group follows the vehicle picked on the route map", () => {
  it("maps Truck groups 1–5 by weight class", () => {
    expect([1, 2, 3, 4, 5].map((c) => vehicleGroupFor("Truck", c))).toEqual([
      "Van / Pickup",
      "Light Truck",
      "Medium Truck",
      "Heavy Truck",
      "Heavy Truck",
    ]);
  });

  it("maps any Container group to Tractor / Container Truck", () => {
    expect([3, 4, 5].map((c) => vehicleGroupFor("Container", c))).toEqual(
      Array(3).fill("Tractor / Container Truck"),
    );
  });

  it("derives the class from the capacity when none is picked (default 8 t → Medium Truck)", () => {
    expect(vehicleGroupFor("Truck", undefined, 8000)).toBe("Medium Truck");
    expect(vehicleGroupFor("Truck", undefined, 3000)).toBe("Light Truck");
  });
});
