import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  commitImport,
  dateCell,
  parseXlsx,
  rollbackImport,
  validateImport,
  type ImportEntityConfig,
} from "@/services/importExportService";
import { locationImportConfig } from "@/services/locationService";
import { routeImportConfig } from "@/services/routeService";
import { vehicleImportConfig } from "@/services/vehicleMasterService";
import { businessPartnerImportConfig } from "@/services/businessPartnerService";
import { locationRepository, routeRepository } from "@/repositories";

const CONFIGS: [string, ImportEntityConfig, number][] = [
  ["Location", locationImportConfig, 3],
  ["Route", routeImportConfig, 2],
  ["Vehicle", vehicleImportConfig, 3],
  ["Business Partner", businessPartnerImportConfig, 3],
];

describe("Import / Export", () => {
  it.each(CONFIGS)("%s demo file: 20 rows, the planted errors are rejected", (_, cfg, bad) => {
    const v = validateImport(cfg, "demo.xlsx", cfg.sampleFile());
    expect(v.structureError).toBeNull();
    expect(v.totalRows).toBe(20);
    expect(v.invalidRowCount).toBe(bad);
    expect(v.validRows).toHaveLength(20 - bad);
  });

  it.each(CONFIGS)("%s: valid rows are created and can be rolled back", (_, cfg, bad) => {
    const before = cfg.existingKeys().size;
    const batch = commitImport(cfg, validateImport(cfg, "demo.xlsx", cfg.sampleFile()));
    expect(batch.successRows).toBe(20 - bad);
    expect(cfg.existingKeys().size).toBe(before + 20 - bad);
    rollbackImport(cfg, batch.id);
    expect(cfg.existingKeys().size).toBe(before);
  });

  it("accepts the list's own column labels and only requires the required columns", () => {
    const table = [
      ["Mã", "Tên", "Loại", "Quốc gia", "Địa chỉ", "Trạng thái"],
      ["imp-x1", "Kho thử", "warehouse", "vietnam", "Quận 7, TP. Hồ Chí Minh", ""],
    ];
    const v = validateImport(locationImportConfig, "location_export.xlsx", table);
    expect(v.structureError).toBeNull();
    expect(v.errors).toEqual([]);
    const ids = locationImportConfig.commit(v.validRows);
    const rec = locationRepository.get(ids[0]!)!;
    expect(rec).toMatchObject({
      code: "IMP-X1",
      locationType: "Warehouse",
      country: "Vietnam",
      status: "Active",
    });
    locationImportConfig.rollback(ids);
  });

  it("reports missing required columns and unsupported files", () => {
    const v = validateImport(locationImportConfig, "x.csv", [
      ["Code", "Name"],
      ["A1", "B"],
    ]);
    expect(v.structureError).toMatch(/Location Type.*Country.*Address/);
    expect(validateImport(locationImportConfig, "x.xls", []).structureError).toMatch(/\.xlsx/);
  });

  it("uses the location code column for route stops and reads type / terrain", () => {
    const loc = locationRepository
      .all()
      .find((l) => !l.deleted && l.code && l.status === "Active")!;
    const table = [
      [
        "Mã route",
        "Tên route",
        "Mã đi",
        "Điểm đi",
        "Mã đến",
        "Loại xe",
        "Phương tiện",
        "Tải trọng (kg)",
        "Loại tuyến",
        "Địa hình",
      ],
      [
        "RT-IMP-1",
        "Test",
        loc.code!,
        "ignored name",
        loc.code!,
        "truck",
        "Medium Truck",
        "8000",
        "round trip",
        "highland",
      ],
    ];
    const v = validateImport(routeImportConfig, "routing.xlsx", table);
    expect(v.errors).toEqual([]);
    const [id] = routeImportConfig.commit(v.validRows);
    expect(routeRepository.get(id!)).toMatchObject({
      type: "Round Trip",
      terrain: "Highland",
      vehicleProfile: "Truck",
      origin: { locationId: loc.id },
    });
    routeImportConfig.rollback([id!]);
  });

  it("reads Excel dates and typed cells from .xlsx", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    ws.addRow(["Plate Number", "Registration Expiry", "Capacity (kg)"]);
    ws.addRow(["51D-999.01", new Date(Date.UTC(2027, 5, 30)), 8000]);
    ws.addRow([]);
    const buf = await wb.xlsx.writeBuffer();
    const table = await parseXlsx(buf as ArrayBuffer);
    expect(table).toEqual([
      ["Plate Number", "Registration Expiry", "Capacity (kg)"],
      ["51D-999.01", "2027-06-30", "8000"],
    ]);
  });

  it("normalizes date cells", () => {
    expect(dateCell("2027-6-3")).toBe("2027-06-03");
    expect(dateCell("30/06/2027")).toBe("2027-06-30");
    expect(dateCell("June 30")).toBe("");
  });
});
