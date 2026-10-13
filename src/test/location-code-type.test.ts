import { describe, expect, it } from "vitest";
import { normalizeLocationType } from "@/mock-data/locationCatalog";
import { findStandardCode, typesAllowedFor, type CodeKind } from "@/mock-data/standardCodes";
import {
  newLocationDraft,
  typeFits,
  validateLocation,
  withCodeType,
  withStandardCode,
  type LocationDraft,
} from "@/services/locationService";
import { matchProvince } from "@/services/reverseGeocode";

const d = (codeType: CodeKind, code: string, locationType = "Seaport"): LocationDraft => ({
  ...newLocationDraft(),
  codeType,
  code,
  name: "Test",
  country: "Vietnam",
  address: "Somewhere",
  locationType,
});

describe("Code Type decides what the code is", () => {
  it("a UN/LOCODE / IATA Code must be in the reference list", () => {
    expect(validateLocation(d("UN/LOCODE", "VNTPP"))["code"]).toBeUndefined();
    expect(validateLocation(d("UN/LOCODE", "VNXYZ"))["code"]).toMatch(/UN\/LOCODE/);
    expect(validateLocation(d("IATA Code", "BMV", "Airport"))["code"]).toBeUndefined();
    expect(validateLocation(d("IATA Code", "XXQ", "Airport"))["code"]).toMatch(/IATA/);
  });

  it("a Local Code is free but cannot be a standard code", () => {
    expect(validateLocation(d("Local Code", "PHUOCAN"))["code"]).toBeUndefined();
    expect(validateLocation(d("Local Code", "VNTPP"))["code"]).toMatch(/UN\/LOCODE/);
  });

  it("switching the Code Type keeps a fitting code and clears the rest", () => {
    expect(withCodeType(d("UN/LOCODE", "VNCLI"), "UN/LOCODE").code).toBe("VNCLI");
    expect(withCodeType(d("Local Code", "PHUOCAN"), "IATA Code").code).toBe("");
    expect(withCodeType(d("UN/LOCODE", "VNCLI"), "Local Code").code).toMatch(/^VN\d{3}$/);
  });
});

describe("Location Type follows the standard code", () => {
  it("a UN/LOCODE is a Seaport or a Depot, an IATA Code an Airport", () => {
    expect(typesAllowedFor(findStandardCode("SGN"))).toEqual(["Airport"]);
    expect(typesAllowedFor(findStandardCode("VNCLI"))).toEqual(["Seaport", "Depot"]);
    // Ho Chi Minh City also has an airport function, still a Seaport / Depot as a UN/LOCODE.
    expect(typesAllowedFor(findStandardCode("VNSGN"))).toEqual(["Seaport", "Depot"]);
    expect(typeFits(d("UN/LOCODE", "VNSGN"), "Airport")).toBe(false);
    expect(typeFits(d("UN/LOCODE", "VNCLI"), "Depot")).toBe(true);
    expect(typeFits(d("Local Code", "PHUOCAN"), "Farm")).toBe(true);
    expect(typeFits(d("IATA Code", "BMV"), "Seaport")).toBe(false);
  });

  it("rejects a type the code cannot carry", () => {
    expect(validateLocation(d("UN/LOCODE", "VNTPP", "Warehouse"))["locationType"]).toMatch(
      /Seaport/,
    );
    expect(validateLocation(d("UN/LOCODE", "VNTPP", "Airport"))["locationType"]).toMatch(/Seaport/);
    expect(validateLocation(d("IATA Code", "BMV", "Seaport"))["locationType"]).toMatch(/Airport/);
  });

  it("applying a code fills Country, a fitting type, name and coordinates (when empty)", () => {
    const next = withStandardCode(
      { ...newLocationDraft(), country: "Laos", locationType: "Warehouse" },
      findStandardCode("BMV")!,
    );
    expect(next).toMatchObject({
      codeType: "IATA Code",
      code: "BMV",
      country: "Vietnam",
      locationType: "Airport",
      name: "Buon Ma Thuot Airport",
    });
    expect(Number.isFinite(next.lat)).toBe(true);
    const named = withStandardCode(
      { ...newLocationDraft(), name: "Kho A" },
      findStandardCode("VNCLI")!,
    );
    expect(named.name).toBe("Kho A");
    // Gia Lam: road + multimodal, no port function → an ICD, so a Depot.
    expect(withStandardCode(newLocationDraft(), findStandardCode("VNGIL")!).locationType).toBe(
      "Depot",
    );
    expect(withStandardCode(newLocationDraft(), findStandardCode("VNCLI")!).locationType).toBe(
      "Seaport",
    );
  });

  it("maps legacy stored types to the current list", () => {
    expect(normalizeLocationType("Port")).toBe("Seaport");
    expect(normalizeLocationType("Inland Depot")).toBe("Depot");
    expect(normalizeLocationType("Other")).toBe("Customer Site");
    expect(normalizeLocationType("Farm")).toBe("Farm");
  });
});

describe("Map spot → address", () => {
  it("matches OpenStreetMap province names to the catalog spelling", () => {
    expect(matchProvince("Thành phố Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(matchProvince("Hà Nội")).toBe("Hà Nội");
    expect(matchProvince("Tỉnh Đồng Nai")).toBe("Đồng Nai");
  });
});
