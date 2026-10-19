// Demo seed for Master Data > Cost (Cost Group + Cost). Loaded into localStorage on first visit.
import type { CostGroupRecord, CostItemRecord } from "@/types";
import { COST_DETAIL_SEED } from "./costDetailSeed";

const meta = {
  createdAt: "2026-09-10T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-09-10T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

/** The sample Cost Groups (flat); Cost Details name their group as text. */
export const seedCostGroups = (): CostGroupRecord[] => {
  const g = (id: string, code: string, name: string, remark = ""): CostGroupRecord => ({
    id,
    code,
    name,
    parentId: null,
    remark,
    status: "Active",
    ...meta,
  });
  return [
    g("CG-FREIGHT", "FREIGHT", "Freight Fee", "Freight and the charges that come with it."),
    g("CG-WAREHOUSE", "WAREHOUSE", "Warehouse", "Storage, handling, lift on / lift off."),
    g(
      "CG-VEH-OPS",
      "VEH-OPS",
      "Vehicle Operation",
      "Running the vehicle: fuel, tolls, driver, repairs.",
    ),
    g("CG-VEH-INV", "VEH-INV", "Vehicle Investment", "Buying and investing in the vehicle."),
    g("CG-CUSTOMS", "CUSTOMS", "Customs", "Customs clearance, permits, inspections."),
  ];
};

/** Cost Details (ELSA fare list mapped to the current fields); id = "CI-" + code. */
export const seedCostItems = (): CostItemRecord[] =>
  COST_DETAIL_SEED.map(
    ([code, name, localName, group, subGroup, taxTariff, currency, taxEvidence]) => ({
      id: `CI-${code}`,
      code,
      name,
      localName,
      group,
      subGroup,
      serviceIds: [],
      taxEvidence,
      currency,
      taxTariff,
      remark: "",
      status: "Active",
      ...meta,
    }),
  );

/** Dropdown catalogs for the Cost form (stand-ins for the future Common Code / UoM masters). */
export const COST_TAX_EVIDENCES = ["VAT Invoice", "Sales Invoice", "Receipt", "No Invoice"];
export const COST_TAX_TARIFFS = ["0%", "5%", "8%", "10%"];
export const COST_CURRENCIES = ["VND", "USD", "EUR", "SGD", "JPY", "CNY"];
export const COST_UOM_CATALOG: Record<string, readonly string[]> = {
  Quantity: ["Piece", "Package", "Pallet", "Container", "Trip"],
  Weight: ["Kg", "Ton"],
  Volume: ["CBM", "Liter"],
  Distance: ["Km"],
  Time: ["Hour", "Day"],
};
