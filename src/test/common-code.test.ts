import { describe, expect, it } from "vitest";
import { commonCodeRepository } from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import {
  codeOptions,
  commonCodeService,
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
