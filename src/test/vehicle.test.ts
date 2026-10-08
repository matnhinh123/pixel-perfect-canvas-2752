import { describe, expect, it } from "vitest";
import {
  expiryState,
  maxDistanceKm,
  newVehicleDraft,
  normalizeVehicle,
  validateVehicle,
  vehicleExpiryAlerts,
} from "@/services/vehicleMasterService";
import type { VehicleMasterRecord } from "@/types";

describe("Vehicle master", () => {
  it("derives Max Distance from fuel capacity and rate", () => {
    expect(maxDistanceKm("25", "200")).toBe("800");
    expect(maxDistanceKm("", "200")).toBe("");
    expect(maxDistanceKm("0", "200")).toBe("");
  });

  it("flags expired and soon-to-expire dates by a configurable threshold", () => {
    const now = new Date("2026-10-07T10:00:00");
    expect(expiryState("2026-10-06", now)).toBe("expired");
    expect(expiryState("2026-10-20", now)).toBe("soon");
    expect(expiryState("2026-10-20", now, 7)).toBe("ok");
    expect(expiryState("2027-07-08", now)).toBe("ok");
    expect(expiryState("", now)).toBe("none");
  });

  it("requires type, group, plate (VIN and inspection report are optional); rejects a duplicate plate", () => {
    const empty = validateVehicle(newVehicleDraft());
    expect(Object.keys(empty).sort()).toEqual(["plateNumber", "vehicleGroup", "vehicleType"]);
    const dup = validateVehicle({
      ...newVehicleDraft(),
      vehicleType: "Trailer",
      vehicleGroup: "Medium Truck",
      plateNumber: "51d-846.32",
      chassisNumber: "ABCDEFGH123456789",
    });
    expect(dup["plateNumber"]).toMatch(/exist|tồn tại/i);
    expect(dup["chassisNumber"]).toBeUndefined();
  });

  it("requires capacity for Truck / Tractor and an owner when outsourced", () => {
    const e = validateVehicle({
      ...newVehicleDraft(),
      vehicleType: "Truck",
      vehicleGroup: "Light Truck",
      plateNumber: "99Z-000.01",
      ownership: "Outsourced",
    });
    expect(e["authorizedPayload"]).toBeDefined();
    expect(e["ownerId"]).toBeDefined();
  });

  it("normalizes legacy stored records", () => {
    const legacy = {
      ...newVehicleDraft(),
      id: "VH-X",
      createdAt: "",
      createdBy: "",
      updatedAt: "",
      updatedBy: "",
      vehicleType: "HEAD",
      vehicleGroup: "DEFAULT",
      inspectionExpiry: "",
      registrationExpiry: "2027-01-01",
    } as unknown as VehicleMasterRecord;
    const n = normalizeVehicle(legacy);
    expect(n.vehicleType).toBe("Tractor");
    expect(n.vehicleGroup).toBe("");
    expect(n.inspectionExpiry).toBe("2027-01-01");
    expect(n.ownership).toBe("Own");
    expect(
      normalizeVehicle({ ...legacy, vehicleType: "5T" } as unknown as VehicleMasterRecord)
        .vehicleType,
    ).toBe("Truck");
  });

  it("lists expiring documents of active vehicles", () => {
    const now = new Date("2026-10-07T10:00:00");
    const v = {
      ...newVehicleDraft(),
      id: "VH-Y",
      createdAt: "",
      createdBy: "",
      updatedAt: "",
      updatedBy: "",
      vehicleType: "Truck",
      plateNumber: "51A-1",
      inspectionExpiry: "2026-10-20",
      insuranceExpiry: "2026-10-01",
      badgeExpiry: "2027-10-01",
    } as VehicleMasterRecord;
    const alerts = vehicleExpiryAlerts([v], 30, now);
    expect(alerts.map((a) => [a.kind, a.state])).toEqual([
      ["Insurance", "expired"],
      ["Registration", "soon"],
    ]);
    expect(vehicleExpiryAlerts([{ ...v, status: "Inactive" }], 30, now)).toEqual([]);
  });
});
