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
    serviceId: "S-TRK",
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "8%",
    uom: "Trip",
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
    serviceId: "S-TRK",
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "",
    uom: "Liter",
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
    serviceId: "S-FRT",
    taxEvidence: "VAT Invoice",
    currency: "VND",
    taxTariff: "",
    uom: "Container",
    remark: "",
    status: "Active",
    ...meta,
  },
];
