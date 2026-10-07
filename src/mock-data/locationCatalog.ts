// Dropdown catalogs for the Location form. Stand-ins for the future Common Code master.

/** Location Type → its Location Sub Types (Sub Type stays disabled until a Type is picked). */
export const LOCATION_TYPES: Record<string, readonly string[]> = {
  Seaport: ["Container Terminal", "Bulk Terminal", "River Port"],
  Airport: ["International Airport", "Domestic Airport", "Cargo Terminal"],
  "Inland Depot": ["ICD", "Container Depot", "Rail Terminal"],
  Warehouse: ["General Warehouse", "Bonded Warehouse", "Cold Storage", "CFS"],
  "Border Gate": ["International Border Gate", "Auxiliary Border Gate"],
  "Customer Site": ["Factory", "Office", "Store"],
  Other: ["Other"],
};

export const SERVICE_MODES = ["Sea", "Air", "Road", "Rail", "Inland Waterway", "Multimodal"];
export const LOCATION_COUNTRIES = [
  "Vietnam",
  "Cambodia",
  "Laos",
  "Thailand",
  "Singapore",
  "China",
  "Japan",
  "Korea",
  "USA",
];

/** Best-effort type for the legacy seed rows (name keywords), so they can be edited without re-typing. */
export function guessLocationType(name: string): { type: string; sub: string; mode: string } {
  const n = name.toLowerCase();
  if (/cảng|cát lái|cai mep|cái mép|hiep phuoc|hiệp phước/.test(n))
    return { type: "Seaport", sub: "Container Terminal", mode: "Sea" };
  if (/sân bay|airport/.test(n))
    return { type: "Airport", sub: "International Airport", mode: "Air" };
  if (/icd/.test(n)) return { type: "Inland Depot", sub: "ICD", mode: "Road" };
  if (/cửa khẩu/.test(n))
    return { type: "Border Gate", sub: "International Border Gate", mode: "Road" };
  if (/kho/.test(n)) return { type: "Warehouse", sub: "General Warehouse", mode: "Road" };
  if (/kcn|khu công nghiệp/.test(n)) return { type: "Customer Site", sub: "Factory", mode: "Road" };
  return { type: "Other", sub: "Other", mode: "Road" };
}
