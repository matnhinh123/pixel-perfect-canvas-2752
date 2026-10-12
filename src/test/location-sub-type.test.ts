import { describe, expect, it } from "vitest";
import { LOCATION_TYPES, normalizeLocationType, subTypesOf } from "@/mock-data/locationCatalog";
import { newLocationDraft, validateLocation, withLocationType } from "@/services/locationService";

const draft = (locationType: string, locationSubType: string) => ({
  ...newLocationDraft(),
  code: "SUBTYPE1",
  name: "Test",
  country: "Vietnam",
  address: "Somewhere",
  locationType,
  locationSubType,
  ...(locationType === "Port" ? { unLocode: "VNABC" } : {}),
  ...(locationType === "Airport" ? { iataCode: "ABC" } : {}),
});

describe("Location Sub Type follows Location Type", () => {
  it("every Location Type has its own sub types", () => {
    for (const t of LOCATION_TYPES) expect(subTypesOf(t).length).toBeGreaterThan(0);
    expect(subTypesOf("")).toEqual([]);
  });

  it("accepts a sub type of the chosen type and rejects one of another type", () => {
    expect(validateLocation(draft("Warehouse", "Cold Storage"))["locationSubType"]).toBeUndefined();
    expect(validateLocation(draft("Warehouse", "ICD"))["locationSubType"]).toBeTruthy();
    expect(validateLocation(draft("Port", "ICD"))["locationSubType"]).toBeUndefined();
  });

  it("changing the type keeps the sub type only when it still belongs", () => {
    const d = draft("Warehouse", "Cold Storage");
    expect(withLocationType(d, "Warehouse").locationSubType).toBe("Cold Storage");
    expect(withLocationType(d, "Farm").locationSubType).toBe("");
  });

  it("keeps stored non-Port sub types and still maps legacy Port values", () => {
    expect(normalizeLocationType("Farm", "Crop Farm")).toEqual({ type: "Farm", sub: "Crop Farm" });
    expect(normalizeLocationType("Port", "Container Terminal")).toEqual({
      type: "Port",
      sub: "Seaport",
    });
    expect(normalizeLocationType("Farm", "ICD")).toEqual({ type: "Farm", sub: "" });
  });
});
