import { describe, expect, it } from "vitest";
import {
  expiryState,
  fieldsLostOnTypeChange,
  maxDistanceKm,
  newVehicleDraft,
  normalizeVehicle,
  showsField,
  validateVehicle,
  vehicleExpiryAlerts,
  vehicleService,
  type VehicleDraft,
} from "@/services/vehicleMasterService";
import type { VehicleMasterRecord } from "@/types";

const valid = (p: Partial<VehicleDraft> = {}): VehicleDraft => ({
  ...newVehicleDraft(),
  vehicleType: "TRAILER",
  plateNumber: "99R-123.45",
  chassisNumber: "TESTVIN0001",
  inspectionReportNo: "KD-2026-0001",
  ...p,
});

describe("Vehicle master", () => {
  it("derives Max Distance = capacity ÷ rate × 100, rounded down", () => {
    expect(maxDistanceKm("22", "200")).toBe("909");
    expect(maxDistanceKm("38", "400")).toBe("1052");
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

  it("requires exactly Vehicle Type, Plate Number, VIN and Inspection Report No", () => {
    const empty = validateVehicle(newVehicleDraft());
    expect(Object.keys(empty).sort()).toEqual([
      "chassisNumber",
      "inspectionReportNo",
      "plateNumber",
      "vehicleType",
    ]);
    expect(validateVehicle(valid())).toEqual({});
  });

  it("requires Truck Type for a TRUCK only", () => {
    expect(validateVehicle(valid({ vehicleType: "TRUCK" }))["truckType"]).toBeDefined();
    expect(validateVehicle(valid({ vehicleType: "TRUCK", truckType: "5 tấn" }))).toEqual({});
    expect(validateVehicle(valid({ vehicleType: "HEAD" }))["truckType"]).toBeUndefined();
  });

  it("checks plate / VIN / code formats and uniqueness", () => {
    expect(validateVehicle(valid({ plateNumber: "ABC" }))["plateNumber"]).toBeDefined();
    for (const p of ["61C-123.45", "30A-12345", "29LD-123.45"])
      expect(validateVehicle(valid({ plateNumber: p }))["plateNumber"]).toBeUndefined();
    expect(validateVehicle(valid({ plateNumber: "51c-123.45" }))["plateNumber"]).toMatch(
      /exist|tồn tại/i,
    );
    expect(validateVehicle(valid({ chassisNumber: "VIN-01" }))["chassisNumber"]).toBeDefined();
    expect(validateVehicle(valid({ modelCode: "HD 210" }))["modelCode"]).toBeDefined();
    expect(validateVehicle(valid({ productionYear: "1850" }))["productionYear"]).toBeDefined();
  });

  it("shows fields by vehicle type", () => {
    expect(showsField("TRUCK", "truckType")).toBe(true);
    expect(showsField("HEAD", "vehicleGroup")).toBe(false);
    expect(showsField("HEAD", "containerMappings")).toBe(true);
    expect(showsField("TRAILER", "engineNumber")).toBe(false);
    expect(showsField("TRAILER", "trailerType")).toBe(true);
    expect(showsField("", "truckType")).toBe(false);
    const truck = valid({ vehicleType: "TRUCK", truckType: "5 tấn", fuelRate: "20" });
    expect(fieldsLostOnTypeChange(truck, "TRAILER")).toEqual(["Truck Type", "Fuel Rate"]);
  });

  it("validates the head's Container Size Mapping rows", () => {
    const head = (rows: VehicleDraft["containerMappings"]) =>
      validateVehicle(valid({ vehicleType: "HEAD", containerMappings: rows }));
    expect(head([])).toEqual({});
    expect(
      head([{ rid: "a", trailerType: "20 ft", vehicleGroup: "" }])["containerMappings"],
    ).toBeDefined();
    expect(
      head([
        { rid: "a", trailerType: "20 ft", vehicleGroup: "Group 02" },
        { rid: "b", trailerType: "20 ft", vehicleGroup: "Group 04" },
      ])["containerMappings"],
    ).toMatch(/already|đã được/);
  });

  it("clears the fields a type hides when saving", () => {
    const saved = vehicleService.save(
      valid({
        plateNumber: "98R-111.22",
        chassisNumber: "TESTVIN0002",
        vehicleType: "TRAILER",
        trailerType: "40 ft",
        truckType: "5 tấn",
        fuelRate: "22",
      }),
    );
    expect(saved.trailerType).toBe("40 ft");
    expect(saved.truckType).toBe("");
    expect(saved.fuelRate).toBe("");
  });

  it("normalizes legacy stored records", () => {
    const legacy = {
      ...newVehicleDraft(),
      id: "VH-X",
      createdAt: "",
      createdBy: "",
      updatedAt: "",
      updatedBy: "",
      vehicleType: "Tractor",
      vehicleGroup: "Medium Truck",
      ownership: "Outsourced",
    } as unknown as VehicleMasterRecord;
    const n = normalizeVehicle(legacy);
    expect(n.vehicleType).toBe("HEAD");
    expect(n.vehicleGroup).toBe("");
    expect(n).not.toHaveProperty("ownership");
    expect(
      normalizeVehicle({ ...legacy, vehicleType: "Truck" } as unknown as VehicleMasterRecord)
        .vehicleType,
    ).toBe("TRUCK");
  });

  it("lists expiring registration / inspection dates of active vehicles", () => {
    const now = new Date("2026-10-07T10:00:00");
    const v = {
      ...valid({ vehicleType: "TRUCK", truckType: "5 tấn" }),
      id: "VH-Y",
      createdAt: "",
      createdBy: "",
      updatedAt: "",
      updatedBy: "",
      registrationExpiry: "2026-10-01",
      inspectionExpiry: "2026-10-20",
    } as VehicleMasterRecord;
    const alerts = vehicleExpiryAlerts([v], 30, now);
    expect(alerts.map((a) => [a.kind, a.state])).toEqual([
      ["Registration", "expired"],
      ["Inspection", "soon"],
    ]);
    expect(vehicleExpiryAlerts([{ ...v, status: "Inactive" }], 30, now)).toEqual([]);
  });
});
