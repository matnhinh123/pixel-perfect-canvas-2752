import type { CostLine, VehicleGroup } from "@/types";

/** Operating cost rate master per MoveX Vehicle Group (mock). Used to prefill new cost lines. */
export const RATE_TABLE: Record<
  VehicleGroup,
  { fixed: number; fuelPerKm: number; driverPerHour: number; tirePerKm: number }
> = {
  "Van / Pickup": { fixed: 250000, fuelPerKm: 3200, driverPerHour: 70000, tirePerKm: 300 },
  "Light Truck": { fixed: 350000, fuelPerKm: 4500, driverPerHour: 80000, tirePerKm: 450 },
  "Medium Truck": { fixed: 500000, fuelPerKm: 6800, driverPerHour: 95000, tirePerKm: 700 },
  "Heavy Truck": { fixed: 650000, fuelPerKm: 8900, driverPerHour: 110000, tirePerKm: 1000 },
  "Tractor / Container Truck": {
    fixed: 850000,
    fuelPerKm: 10500,
    driverPerHour: 130000,
    tirePerKm: 1400,
  },
};

export function defaultCostLines(group: VehicleGroup): CostLine[] {
  const r = RATE_TABLE[group];
  return [
    {
      id: "L-FIX",
      category: "Fixed",
      description: "Khấu hao + bảo hiểm xe",
      basis: "Per trip",
      rate: r.fixed,
    },
    {
      id: "L-FUEL",
      category: "Fuel",
      description: "Nhiên liệu dầu DO",
      basis: "Per km",
      rate: r.fuelPerKm,
    },
    {
      id: "L-DRV",
      category: "Driver",
      description: "Lương tài xế",
      basis: "Per hour",
      rate: r.driverPerHour,
    },
    {
      id: "L-TIRE",
      category: "Other",
      description: "Hao mòn lốp",
      basis: "Per km",
      rate: r.tirePerKm,
    },
  ];
}

export interface OperatingRateRow {
  id: string;
  code: string;
  name: string;
  category: string;
  vehicleGroup: VehicleGroup;
  unit: string;
  amount: number;
}

export const operatingRateRows = (): OperatingRateRow[] =>
  (Object.entries(RATE_TABLE) as [VehicleGroup, (typeof RATE_TABLE)[VehicleGroup]][]).flatMap(
    ([g, r], i) => [
      {
        id: `OP-FIX-${i}`,
        code: `OP-FIX-${i + 1}`,
        name: "Khấu hao + bảo hiểm xe",
        category: "Fixed",
        vehicleGroup: g,
        unit: "₫/chuyến",
        amount: r.fixed,
      },
      {
        id: `OP-FUEL-${i}`,
        code: `OP-FUEL-${i + 1}`,
        name: "Nhiên liệu dầu DO",
        category: "Fuel",
        vehicleGroup: g,
        unit: "₫/km",
        amount: r.fuelPerKm,
      },
      {
        id: `OP-DRV-${i}`,
        code: `OP-DRV-${i + 1}`,
        name: "Lương tài xế",
        category: "Driver",
        vehicleGroup: g,
        unit: "₫/giờ",
        amount: r.driverPerHour,
      },
      {
        id: `OP-TIRE-${i}`,
        code: `OP-TIRE-${i + 1}`,
        name: "Hao mòn lốp",
        category: "Other",
        vehicleGroup: g,
        unit: "₫/km",
        amount: r.tirePerKm,
      },
    ],
  );
