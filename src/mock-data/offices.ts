// Offices of the tenant (stand-in until the Tenant Admin › Organization module exists). The
// countries of these offices are the countries a cost can belong to.

export interface TenantOffice {
  code: string;
  name: string;
  country: string;
}

export const TENANT_OFFICES: readonly TenantOffice[] = [
  { code: "HCM", name: "Ho Chi Minh Head Office", country: "Vietnam" },
  { code: "HAN", name: "Ha Noi Office", country: "Vietnam" },
  { code: "SIN", name: "Singapore Office", country: "Singapore" },
  { code: "BKK", name: "Bangkok Office", country: "Thailand" },
];

/** Countries of the tenant's offices, in office order, each once. */
export const tenantCountries = (): string[] => [...new Set(TENANT_OFFICES.map((o) => o.country))];
