import { describe, expect, it } from "vitest";
import {
  expiryState,
  maxDistanceKm,
  newVehicleDraft,
  validateVehicle,
} from "@/services/vehicleMasterService";

describe("Vehicle master", () => {
  it("derives Max Distance from fuel capacity and rate", () => {
    expect(maxDistanceKm("25", "200")).toBe("800");
    expect(maxDistanceKm("", "200")).toBe("");
    expect(maxDistanceKm("0", "200")).toBe("");
  });

  it("flags expired and soon-to-expire dates", () => {
    const now = new Date("2026-10-07T10:00:00");
    expect(expiryState("2026-10-06", now)).toBe("expired");
    expect(expiryState("2026-10-20", now)).toBe("soon");
    expect(expiryState("2027-07-08", now)).toBe("ok");
    expect(expiryState("", now)).toBe("none");
  });

  it("requires type, plate, VIN and inspection report; rejects a duplicate plate", () => {
    const empty = validateVehicle(newVehicleDraft());
    expect(Object.keys(empty).sort()).toEqual([
      "chassisNumber",
      "inspectionReportNo",
      "plateNumber",
      "vehicleType",
    ]);
    const dup = validateVehicle({
      ...newVehicleDraft(),
      vehicleType: "TRUCK",
      plateNumber: "51d-846.32",
      chassisNumber: "ABCDEFGH123456789",
      inspectionReportNo: "R1",
    });
    expect(dup["plateNumber"]).toMatch(/exist|tồn tại/i);
    expect(dup["chassisNumber"]).toBeUndefined();
  });
});
