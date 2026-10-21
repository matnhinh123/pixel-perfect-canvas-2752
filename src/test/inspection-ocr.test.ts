import { describe, expect, it } from "vitest";
import { parseInspectionCertificate, SAMPLE_CERTIFICATE_TEXT } from "@/services/inspectionOcr";

describe("Inspection certificate scan", () => {
  it("reads a real certificate (tractor head 50H-609.54); no value → no field", () => {
    expect(parseInspectionCertificate(SAMPLE_CERTIFICATE_TEXT)).toEqual({
      vehicleType: "HEADER",
      plateNumber: "50H-609.54",
      inspectionNo: "6114D-5891",
      inspectionReportNo: "22967/26",
      inspectionExpiry: "2028-10-08",
      tradeMark: "CNHTC",
      modelCode: "ZZ4257V344KE1",
      chassisNumber: "LZZ1CLWCXTJ486944",
      engineNumber: "MC114650260617230907",
      productionYear: "2026",
      lifetimeLimit: "2051-12-31",
      fuelType: "Diesel",
      overallDimension: "7250×2500×3800",
      // The cargo-deck dimension line is blank on a head's certificate: not filled.
      kerbMass: "10200",
      authorizedPayload: "13670",
      authorizedTowedMass: "37670",
    });
  });

  it("keeps labels that share a line apart and takes a bare value from the next line", () => {
    const text = [
      "Loai phuong tien (Vehicle type): So mi ro mooc",
      "Bien so xe (Registration plate):",
      "51R 045.67",
      "Khoi luong ban than: 6800 (kg) Khoi luong toan bo theo TK/CPLN: 39000/38000 (kg)",
      "Kich thuoc long/ bao thung xe/ bao ngoai xi tec: 12150 x 2420 x 600 (mm)",
    ].join("\n");
    expect(parseInspectionCertificate(text)).toEqual({
      vehicleType: "TRAILER",
      plateNumber: "51R-045.67",
      kerbMass: "6800",
      containerDimension: "12150×2420×600",
    });
  });
});

describe("Scanned values pass the vehicle form's checks", () => {
  it("the 50H-609.54 certificate fills a valid HEAD", async () => {
    const { newVehicleDraft, validateVehicle, showsField } =
      await import("@/services/vehicleMasterService");
    const scanned = parseInspectionCertificate(SAMPLE_CERTIFICATE_TEXT);
    const draft = { ...newVehicleDraft(), ...scanned };
    expect(validateVehicle(draft)).toEqual({});
    // Every field read applies to a HEAD (nothing filled that the form would hide).
    for (const k of Object.keys(scanned))
      if (k !== "vehicleType") expect([k, showsField("HEAD", k as never)]).toEqual([k, true]);
  }, 20_000); // imports the whole vehicle service: slow when the suite runs in parallel
});

describe("Trailer axles from the tyre line", () => {
  it("counts the axles listed in 'Số lượng lốp/cỡ lốp/trục'", () => {
    const text =
      "Số lượng lốp/cỡ lốp/trục: 1 : 4; 11.00R20 2 : 4; 11.00R20 3 : 4; 11.00R20\n(The number of tires / tire size / axle)";
    expect(parseInspectionCertificate(text).trailerAxles).toBe("3");
  });
});
