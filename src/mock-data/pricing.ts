import type { Status } from "@/types";

// Pricing module is out of the demo scope — kept as static reference data for the Pricing page.
export interface PricingInput {
  code: string;
  route: string;
  service: string;
  cogs: number;
  margin: number;
  status: Status;
}
export const pricingInputs: PricingInput[] = [
  {
    code: "PI-001",
    route: "RT-HCM-CL",
    service: "Container Trucking",
    cogs: 2150000,
    margin: 18,
    status: "Active",
  },
  {
    code: "PI-002",
    route: "RT-HN-HP",
    service: "Container Trucking",
    cogs: 5480000,
    margin: 15,
    status: "Active",
  },
  {
    code: "PI-003",
    route: "RT-HCM-BD",
    service: "Domestic Trucking",
    cogs: 1320000,
    margin: 20,
    status: "Draft",
  },
  {
    code: "PI-004",
    route: "RT-HCM-DN",
    service: "Domestic Trucking",
    cogs: 1900000,
    margin: 16,
    status: "Draft",
  },
];
