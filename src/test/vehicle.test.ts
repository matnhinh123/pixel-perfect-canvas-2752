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
  cargoVolumeM3,
  baseTypeOf,
  vehicleGroupForTruckType,
  vehicleService,
  type VehicleDraft,
} from "@/services/vehicleMasterService";
import type { VehicleMasterRecord } from "@/types";
import { commonCodeRepository } from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import { commonCodeService, validateCommonCode } from "@/services/commonCodeService";

const valid = (p: Partial<VehicleDraft> = {}): VehicleDraft => ({
  ...newVehicleDraft(),
  vehicleType: "TRAILER",
  plateNumber: "99R-123.45",
  chassisNumber: "TESTVIN0001",
  trailerType: "Skeletal",
  trailerSize: "40 ft",
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

  it("requires exactly Vehicle Type, Plate Number and Inspection Report No", () => {
    const empty = validateVehicle(newVehicleDraft());
    expect(Object.keys(empty).sort()).toEqual(["inspectionReportNo", "plateNumber", "vehicleType"]);
    expect(validateVehicle(valid())).toEqual({});
  });

  it("requires Truck Type for a TRUCK only", () => {
    expect(validateVehicle(valid({ vehicleType: "TRUCK" }))["truckType"]).toBeDefined();
    expect(validateVehicle(valid({ vehicleType: "TRUCK", truckType: "5 tấn" }))).toEqual({});
    expect(validateVehicle(valid({ vehicleType: "HEAD" }))["truckType"]).toBeUndefined();
  });

  it("requires Trailer Size for a TRAILER (Trailer Type = body type, optional)", () => {
    expect(validateVehicle(valid({ trailerSize: "" }))["trailerSize"]).toBeDefined();
    expect(validateVehicle(valid({ trailerType: "" }))).toEqual({});
    expect(
      validateVehicle(valid({ vehicleType: "HEAD", trailerSize: "" }))["trailerSize"],
    ).toBeUndefined();
  });

  it("Trailer Axles: whole number 1–9, trailers only", () => {
    expect(validateVehicle(valid({ trailerAxles: "3" }))).toEqual({});
    expect(validateVehicle(valid({ trailerAxles: "0" }))["trailerAxles"]).toBeDefined();
    expect(validateVehicle(valid({ trailerAxles: "12" }))["trailerAxles"]).toBeDefined();
    expect(showsField("TRUCK", "trailerAxles")).toBe(false);
  });

  it("moves a size stored in Trailer Type (before the split) to Trailer Size", () => {
    const old = { ...valid({ trailerType: "40 ft", trailerSize: "" }), id: "VH-OLD" } as never;
    const n = normalizeVehicle(old);
    expect(n.trailerSize).toBe("40 ft");
    expect(n.trailerType).toBe("");
  });

  it("a trailer has no cargo box, cargo volume or kerb mass", () => {
    expect(showsField("TRAILER", "containerDimension")).toBe(false);
    expect(showsField("TRAILER", "kerbMass")).toBe(false);
    expect(showsField("TRUCK", "kerbMass")).toBe(true);
  });

  it("checks plate / VIN / code formats and uniqueness", () => {
    expect(validateVehicle(valid({ plateNumber: "ABC" }))["plateNumber"]).toBeDefined();
    for (const p of ["61C-123.45", "30A-12345", "29LD-123.45"])
      expect(validateVehicle(valid({ plateNumber: p }))["plateNumber"]).toBeUndefined();
    expect(validateVehicle(valid({ plateNumber: "51c-123.45" }))["plateNumber"]).toMatch(
      /exist|tồn tại/i,
    );
    expect(validateVehicle(valid({ chassisNumber: "VIN-01" }))["chassisNumber"]).toBeDefined();
    expect(
      validateVehicle(
        valid({ vehicleType: "TRUCK", truckType: "5 tấn", modelCode: "Canter TF8.5" }),
      )["modelCode"],
    ).toBeUndefined();
    expect(
      validateVehicle(valid({ vehicleType: "TRUCK", truckType: "5 tấn", modelCode: "HD@210" }))[
        "modelCode"
      ],
    ).toBeDefined();
    expect(
      validateVehicle(valid({ vehicleType: "TRUCK", truckType: "5 tấn", kerbMass: "0" }))[
        "kerbMass"
      ],
    ).toBeDefined();
    expect(validateVehicle(valid({ productionYear: "1850" }))["productionYear"]).toBeDefined();
  });

  it("shows fields by vehicle type", () => {
    expect(showsField("TRUCK", "truckType")).toBe(true);
    expect(showsField("HEAD", "vehicleGroup")).toBe(false);
    expect(showsField("TRAILER", "fuelType")).toBe(false);
    expect(showsField("TRAILER", "engineNumber")).toBe(false);
    expect(showsField("TRAILER", "trailerType")).toBe(true);
    expect(showsField("", "truckType")).toBe(false);
    const truck = valid({ vehicleType: "TRUCK", truckType: "5 tấn", fuelRate: "20" });
    expect(fieldsLostOnTypeChange(truck, "TRAILER")).toEqual(["Truck Type", "Fuel Rate"]);
  });

  it("no longer shows the Container Size Mapping", () => {
    expect(showsField("HEADER", "containerMappings")).toBe(false);
  });

  it("clears the fields a type hides when saving", () => {
    const saved = vehicleService.save(
      valid({
        plateNumber: "98R-111.22",
        chassisNumber: "TESTVIN0002",
        vehicleType: "TRAILER",
        trailerType: "Skeletal",
        truckType: "5 tấn",
        fuelRate: "22",
      }),
    );
    expect(saved.trailerType).toBe("Skeletal");
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
      engineNumber: "D6CB1234567",
      telematics: false,
      tachograph: true,
    } as unknown as VehicleMasterRecord;
    const n = normalizeVehicle(legacy);
    expect(n.vehicleType).toBe("HEADER");
    expect(n.vehicleGroup).toBe("");
    expect(n).not.toHaveProperty("ownership");
    // Unknown fields go (Engine Number is kept; old equipment flags are dropped).
    expect(n.engineNumber).toBe("D6CB1234567");
    expect(n).not.toHaveProperty("tachograph");
    expect(n).not.toHaveProperty("telematics");
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

describe("Vehicle Type from Common Code", () => {
  it("a type added in Common Code behaves like its base type (attribute)", () => {
    const vt = commonCodeRepository.get(CC.VEHICLE_TYPE)!;
    commonCodeService.save(vt.id, {
      remark: vt.remark,
      options: [
        ...vt.options,
        { code: "BP0699", name: "REEFER TRUCK", attribute: "TRUCK", remark: "", active: true },
      ],
    });
    expect(baseTypeOf("REEFER TRUCK")).toBe("TRUCK");
    expect(showsField("REEFER TRUCK", "truckType")).toBe(true);
    expect(showsField("REEFER TRUCK", "trailerType")).toBe(false);
    expect(validateVehicle(valid({ vehicleType: "REEFER TRUCK" }))["truckType"]).toBeDefined();
    expect(
      normalizeVehicle({ ...valid({ vehicleType: "Reefer Truck" }) } as VehicleMasterRecord)
        .vehicleType,
    ).toBe("REEFER TRUCK");
  });

  it("keeps TRUCK / HEADER / TRAILER locked: no rename, no removal", () => {
    const vt = commonCodeRepository.get(CC.VEHICLE_TYPE)!;
    expect(vt.kind).toBe("Customizable");
    const renamed = vt.options.map((o) => (o.name === "HEADER" ? { ...o, name: "TRACTOR" } : o));
    expect(validateCommonCode(vt, { remark: "", options: renamed })["options"]).toMatch(/system/);
    const removed = vt.options.filter((o) => o.name !== "TRAILER");
    expect(validateCommonCode(vt, { remark: "", options: removed })["options"]).toMatch(/system/);
    const off = vt.options.map((o) => (o.name === "TRAILER" ? { ...o, active: false } : o));
    expect(validateCommonCode(vt, { remark: "", options: off })["options"]).toBeUndefined();
  });
});

describe("Fields per vehicle type (as on the real certificates)", () => {
  it("a head has no cargo box; a trailer has no engine, fuel or service-life limit", () => {
    expect(showsField("HEAD", "containerDimension")).toBe(false);
    expect(showsField("HEAD", "authorizedPayload")).toBe(true);
    expect(showsField("HEAD", "authorizedTowedMass")).toBe(true);
    expect(showsField("TRAILER", "lifetimeLimit")).toBe(false);
    expect(showsField("TRAILER", "engineNumber")).toBe(false);
    expect(showsField("TRAILER", "authorizedPayload")).toBe(true);
    expect(showsField("TRUCK", "containerDimension")).toBe(true);
    expect(showsField("TRUCK", "lifetimeLimit")).toBe(true);
    expect(showsField("TRAILER", "trailerSize")).toBe(true);
    expect(showsField("TRUCK", "trailerSize")).toBe(false);
    expect(showsField("TRAILER", "modelCode")).toBe(false);
    expect(showsField("HEADER", "modelCode")).toBe(true);
  });
});

describe("Cargo volume", () => {
  it("is L × W × H of the cargo box in m³ (2 decimals), empty until complete", () => {
    expect(cargoVolumeM3("5200×2100×2050")).toBe("22.39");
    expect(cargoVolumeM3("6200×2350×2400")).toBe("34.97");
    expect(cargoVolumeM3("5200×2100×")).toBe("");
    expect(cargoVolumeM3("")).toBe("");
  });
});

describe("HEADER is the head base type", () => {
  it("shows the head fields for HEADER (and old stored HEAD)", () => {
    expect(baseTypeOf("HEADER")).toBe("HEAD");
    expect(baseTypeOf("HEAD")).toBe("HEAD");
    expect(showsField("HEADER", "authorizedTowedMass")).toBe(true);
    expect(validateVehicle(valid({ vehicleType: "HEADER", trailerType: "" }))).toEqual({});
  });
});

describe("Vehicle Group follows the Truck Type", () => {
  it("maps tonnage to the toll class load bands", () => {
    expect(
      ["1 tấn", "2 tấn", "5 tấn", "8 tấn", "10 tấn", "15 tấn", "20 tấn"].map((x) =>
        vehicleGroupForTruckType(x),
      ),
    ).toEqual(["Group 01", "Group 02", "Group 03", "Group 03", "Group 04", "Group 04", "Group 05"]);
    expect(vehicleGroupForTruckType("Xe bồn")).toBe("");
  });
});
