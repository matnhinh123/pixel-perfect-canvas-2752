import { describe, expect, it } from "vitest";
import {
  businessPartnerRepository,
  commonCodeRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import {
  codeOptions,
  commonCodeService,
  lastSyncedRecords,
  nextOptionCode,
  withCurrent,
} from "@/services/commonCodeService";

describe("Common Code", () => {
  it("serves the active options of a type and keeps a stored value selectable", () => {
    expect(codeOptions(CC.LEGAL_TYPE)).toEqual(["Company", "Individual", "Representative"]);
    expect(withCurrent(["A", "B"], "C")).toEqual(["A", "B", "C"]);
    expect(withCurrent(["A", "B"], "A", "")).toEqual(["A", "B"]);
  });

  it("customizable types: add, rename and deactivate options", () => {
    const rec = commonCodeRepository.get(CC.GENDER)!;
    const options = [
      ...rec.options.map((o, i) => (i === 0 ? { ...o, active: false } : o)),
      {
        code: nextOptionCode(rec.code, rec.options),
        name: "Dr.",
        attribute: "DEFAULT",
        remark: "",
        active: true,
      },
    ];
    commonCodeService.save(rec.id, { remark: "", options });
    expect(codeOptions(CC.GENDER)).toEqual(["Ms.", "Mrs.", "Dr."]);
  });

  it("fixed types: only activate / deactivate; names and rows are locked", () => {
    const rec = commonCodeRepository.get(CC.LEGAL_TYPE)!;
    const renamed = rec.options.map((o, i) => (i === 0 ? { ...o, name: "Firm" } : o));
    expect(() => commonCodeService.save(rec.id, { remark: "", options: renamed })).toThrow();
    const off = rec.options.map((o, i) => (i === 2 ? { ...o, active: false } : o));
    commonCodeService.save(rec.id, { remark: "", options: off });
    expect(codeOptions(CC.LEGAL_TYPE)).toEqual(["Company", "Individual"]);
  });

  it("needs a name for every option and at least one active option", () => {
    const rec = commonCodeRepository.get(CC.FUEL_TYPE)!;
    const blank = rec.options.map((o, i) => (i === 0 ? { ...o, name: " " } : o));
    expect(() => commonCodeService.save(rec.id, { remark: "", options: blank })).toThrow();
    const none = rec.options.map((o) => ({ ...o, active: false }));
    expect(() => commonCodeService.save(rec.id, { remark: "", options: none })).toThrow();
  });
});

describe("Common Code → records sync", () => {
  const rename = (typeCode: string, from: string, to: string) => {
    const rec = commonCodeRepository.get(typeCode)!;
    commonCodeService.save(rec.id, {
      remark: rec.remark,
      options: rec.options.map((o) => (o.name === from ? { ...o, name: to } : o)),
    });
  };

  it("renaming an option rewrites every record that uses it", () => {
    const trucksBefore = vehicleMasterRepository
      .all()
      .filter((v) => v.truckType === "5 tấn").length;
    expect(trucksBefore).toBeGreaterThan(0);
    rename(CC.TRUCK_TYPE, "5 tấn", "5 Tons");
    expect(vehicleMasterRepository.all().filter((v) => v.truckType === "5 tấn")).toHaveLength(0);
    expect(vehicleMasterRepository.all().filter((v) => v.truckType === "5 Tons")).toHaveLength(
      trucksBefore,
    );
    expect(lastSyncedRecords).toBe(trucksBefore);

    // Other vehicle lists and BP categories (a list field) too.
    rename(CC.VEHICLE_GROUP, "Group 02", "Group 2");
    const groups = vehicleMasterRepository.all().map((v) => v.vehicleGroup);
    expect(groups).toContain("Group 2");
    expect(groups).not.toContain("Group 02");
    const withCat = businessPartnerRepository.all().find((b) => b.businessCategory.length > 0)!;
    const cat = withCat.businessCategory[0]!;
    rename(CC.BUSINESS_CATEGORY, cat, `${cat} (renamed)`);
    expect(businessPartnerRepository.get(withCat.id)!.businessCategory).toContain(
      `${cat} (renamed)`,
    );
  });

  it("renaming a UoM Category keeps its units attached", () => {
    const uom = commonCodeRepository.get(CC.UOM)!;
    const cat = uom.options[0]!.attribute;
    rename(CC.UOM_CATEGORY, cat, `${cat} X`);
    expect(commonCodeRepository.get(CC.UOM)!.options[0]!.attribute).toBe(`${cat} X`);
  });
});

describe("Trailer Size is editable", () => {
  it("is Customizable: a size can be added and renaming one updates trailers and head mappings", () => {
    const ts = commonCodeRepository.get(CC.TRAILER_SIZE)!;
    expect(ts.kind).toBe("Customizable");
    const before = vehicleMasterRepository.all().filter((v) => v.trailerSize === "40 ft").length;
    expect(before).toBeGreaterThan(0);
    commonCodeService.save(ts.id, {
      remark: ts.remark,
      options: [
        ...ts.options.map((o) => (o.name === "40 ft" ? { ...o, name: "40'" } : o)),
        { code: `${ts.code}99`, name: "45 ft", attribute: "DEFAULT", remark: "", active: true },
      ],
    });
    expect(vehicleMasterRepository.all().filter((v) => v.trailerSize === "40'")).toHaveLength(
      before,
    );
  });
});
