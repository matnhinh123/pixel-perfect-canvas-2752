// Demo seed for Master Data > Cost (Cost Group + Cost). Loaded into localStorage on first visit.
import type { CostGroupRecord, CostItemRecord } from "@/types";

const meta = {
  createdAt: "2026-09-10T02:00:00.000Z",
  createdBy: "Nguyễn Minh Anh",
  updatedAt: "2026-09-10T02:00:00.000Z",
  updatedBy: "Nguyễn Minh Anh",
};

export const seedCostGroups = (): CostGroupRecord[] => {
  const g = (
    id: string,
    code: string,
    name: string,
    parentId: string | null,
    remark = "",
  ): CostGroupRecord => ({ id, code, name, parentId, remark, status: "Active", ...meta });
  return [
    g("CG-TRANS", "TRANS", "Transportation Cost", null, "Costs of moving cargo by road."),
    g("CG-ROAD", "ROAD", "Road Cost", "CG-TRANS", "Tolls, bridges and road fees."),
    g("CG-FUEL", "FUEL", "Fuel Cost", "CG-TRANS"),
    g("CG-DRIVER", "DRIVER", "Driver Cost", "CG-TRANS", "Driver salary and allowances."),
    g("CG-PORT", "PORT", "Port Cost", null, "Costs charged at the port."),
    g("CG-HANDLING", "HANDLING", "Handling Cost", "CG-PORT"),
    g("CG-STORAGE", "STORAGE", "Storage Cost", "CG-PORT"),
    g("CG-CUSTOMS", "CUSTOMS", "Customs Cost", null),
  ];
};

export const seedCostItems = (): CostItemRecord[] => [
  {
    id: "CI-TOLL",
    code: "TOLL_FEE",
    name: "Toll Fee",
    localName: "Phí cầu đường",
    groupId: "CG-ROAD",
    subGroup: "",
    serviceIds: ["S-TRK-DOM", "S-TRK-CONT", "S-TRK-CONT-IM", "S-TRK-CONT-EX"],
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "8%",
    remark: "",
    status: "Active",
    ...meta,
  },
  {
    id: "CI-FUEL",
    code: "FUEL",
    name: "Fuel Cost",
    localName: "Chi phí nhiên liệu",
    groupId: "CG-FUEL",
    subGroup: "",
    serviceIds: ["S-TRK-DOM", "S-TRK-CONT-IM", "S-TRK-CONT-EX"],
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "10%",
    remark: "",
    status: "Active",
    ...meta,
  },
  {
    id: "CI-LIFT",
    code: "LIFT_ON_OFF",
    name: "Lift On / Lift Off",
    localName: "Phí nâng hạ",
    groupId: "CG-PORT",
    subGroup: "",
    serviceIds: ["S-FRT-SEA", "S-FRT-SEA-IM", "S-FRT-SEA-EX"],
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "",
    remark: "",
    status: "Active",
    ...meta,
  },
];

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
