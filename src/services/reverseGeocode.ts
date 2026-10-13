// Spot on the map → Country / Province / Address (OpenStreetMap Nominatim reverse geocoding;
// the Vietmap proxy has no key in the demo).
import { COUNTRY_ISO2, VN_PROVINCES } from "@/mock-data/locationCatalog";

export interface ReverseAddress {
  /** Country name from the Location form's list ("" when the spot is in another country). */
  country: string;
  /** Province / city: the catalog value when it matches, else the name OpenStreetMap gives. */
  province: string;
  /** Full address without postcode and country. */
  address: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/^(thanh pho|tp\.?|tinh)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const COUNTRY_OF_ISO = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([n, c]) => [c, n]));

/** "Thành phố Hồ Chí Minh" → "TP. Hồ Chí Minh" (catalog spelling) when the names match. */
export const matchProvince = (name: string) =>
  VN_PROVINCES.find((p) => fold(p) === fold(name)) ?? name;

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseAddress | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    "accept-language": "vi",
    addressdetails: "1",
  }).toString();
  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) return null;
  const j = (await r.json()) as {
    display_name?: string;
    address?: Record<string, string>;
  };
  const a = j.address ?? {};
  if (!j.display_name) return null;
  const country = COUNTRY_OF_ISO[(a["country_code"] ?? "").toUpperCase()] ?? "";
  const rawProvince = a["state"] ?? a["city"] ?? a["province"] ?? "";
  const drop = new Set([a["postcode"], a["country"]].filter(Boolean));
  const address = j.display_name
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !drop.has(x))
    .join(", ");
  return {
    country,
    province: country === "Vietnam" ? matchProvince(rawProvince) : rawProvince,
    address,
  };
}
