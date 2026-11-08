import { describe, expect, it } from "vitest";
import { commitImport, rollbackImport, validateImport } from "@/services/importExportService";
import { fixedCostMappingImportConfig as cfg } from "@/services/fixedCostService";
import { fixedCostRepository, fixedCostSummaryRepository } from "@/repositories";

const live = () => fixedCostSummaryRepository.all().filter((s) => !s.deleted);
const codesOf = (ids: string[]) => ids.map((id) => fixedCostRepository.get(id)?.code);
const mgtHeader = () => live().find((s) => s.id === "FS-MGT-HEAD")!;

describe("Fixed Cost Mapping import", () => {
  it("demo file: 20 rows, the inactive and the Singapore Internal Cost are rejected", () => {
    const v = validateImport(cfg, "demo.xlsx", cfg.sampleFile());
    expect(v.structureError).toBeNull();
    expect(v.totalRows).toBe(20);
    expect(v.errors.map((e) => e.row)).toEqual([19, 21]);
    expect(v.errors[1]!.error).toBe("FC_SG_INSURANCE belongs to Singapore, not Vietnam.");
  });

  it("groups rows into mappings, replaces an existing one, and rolls back", () => {
    const before = live().length;
    const oldMgt = [...mgtHeader().fixedCostIds];
    const batch = commitImport(cfg, validateImport(cfg, "demo.xlsx", cfg.sampleFile()));
    // 9 groups: MGT×3, DEP HEADER, ADP 40 ft, INU 2 tấn, IFR 5 tấn, GPS HEADER, GPS 40 ft.
    expect(batch.successRows).toBe(18);
    expect(batch.createdIds).toHaveLength(9);
    // New: MGT 5 tấn / 8 tấn, IFR 5 tấn, GPS HEADER / 40 ft; the other 4 already existed.
    expect(live().length).toBe(before + 5);
    expect(codesOf(mgtHeader().fixedCostIds)).toEqual(["FC_MANAGEMENT", "FC_LICENSE"]);

    rollbackImport(cfg, batch.id);
    expect(live().length).toBe(before);
    expect(mgtHeader().fixedCostIds).toEqual(oldMgt);
  });
});
