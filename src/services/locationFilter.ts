// Location list filters: quick filters (Status, Code Type, Country, Province/City) and the
// advanced panel (+ Location Type, Has Coordinates, Created / Updated date ranges).
// All conditions combine with AND (BR1); the state lives in the URL query (BR4).
import { locationOrigin, type LocationMasterRecord } from "@/mock-data/locations";
import { CODE_KINDS, type CodeKind } from "@/mock-data/standardCodes";
import { LOCATION_TYPES } from "@/mock-data/locationCatalog";
import type { SortState } from "@/types";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/lib/paging";

/** Dates are compared as calendar days in the tenant's time zone. */
export const TENANT_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type YesNo = "" | "Yes" | "No";

export interface LocationFilter {
  status: "" | "Active" | "Inactive";
  origin: "" | CodeKind;
  countries: string[];
  provinces: string[];
  types: string[];
  hasCoordinates: YesNo;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
}

export const EMPTY_LOCATION_FILTER: LocationFilter = {
  status: "",
  origin: "",
  countries: [],
  provinces: [],
  types: [],
  hasCoordinates: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
};

const ymdFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TENANT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** ISO timestamp → YYYY-MM-DD in the tenant time zone ("" when missing / invalid). */
export function tenantYmd(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? ymdFormat.format(d) : "";
}

export const hasCoordinates = (l: Pick<LocationMasterRecord, "lat" | "lng">) =>
  Number.isFinite(l.lat) && Number.isFinite(l.lng);

/** Province/City values that exist in the tenant's data, limited to the chosen countries. */
export function provincesFor(rows: LocationMasterRecord[], countries: string[]): string[] {
  const set = new Set<string>();
  for (const l of rows)
    if (l.province && (countries.length === 0 || countries.includes(l.country ?? "")))
      set.add(l.province);
  return [...set].sort((a, b) => a.localeCompare(b, "vi"));
}

/** BR2: changing Country drops the Provinces/Cities that no longer belong to the chosen countries. */
export function withCountries(
  f: LocationFilter,
  countries: string[],
  rows: LocationMasterRecord[],
): LocationFilter {
  const allowed = provincesFor(rows, countries);
  return { ...f, countries, provinces: f.provinces.filter((p) => allowed.includes(p)) };
}

const inRange = (day: string, from: string, to: string) =>
  (!from || (!!day && day >= from)) && (!to || (!!day && day <= to));

/** BR1: every condition must hold (AND). */
export function matchLocation(l: LocationMasterRecord, f: LocationFilter): boolean {
  if (f.status && l.status !== f.status) return false;
  if (f.origin && locationOrigin(l) !== f.origin) return false;
  if (f.countries.length && !f.countries.includes(l.country ?? "")) return false;
  if (f.provinces.length && !f.provinces.includes(l.province ?? "")) return false;
  if (f.types.length && !f.types.includes(l.locationType ?? "")) return false;
  if (f.hasCoordinates && hasCoordinates(l) !== (f.hasCoordinates === "Yes")) return false;
  if (!inRange(tenantYmd(l.createdAt), f.createdFrom, f.createdTo)) return false;
  if (!inRange(tenantYmd(l.updatedAt), f.updatedFrom, f.updatedTo)) return false;
  return true;
}

/** E1: a date range whose From is after its To. */
export const DATE_RANGE_ERROR = "From date must be before To date";
export const rangeError = (from: string, to: string) =>
  from && to && from > to ? DATE_RANGE_ERROR : null;
export const filterHasErrors = (f: LocationFilter) =>
  !!(rangeError(f.createdFrom, f.createdTo) || rangeError(f.updatedFrom, f.updatedTo));

// ---------------------------------------------------------------- chips / labels

type T = (vi: string, en: string) => string;
export type FilterField =
  | "status"
  | "origin"
  | "countries"
  | "province"
  | "types"
  | "hasCoordinates"
  | "created"
  | "updated";

export const fieldLabel = (k: FilterField, t: T): string =>
  ({
    status: t("Trạng thái", "Status"),
    origin: t("Loại mã", "Code Type"),
    countries: t("Quốc gia", "Country"),
    province: t("Tỉnh/Thành phố", "Province/City"),
    types: t("Loại", "Location Type"),
    hasCoordinates: t("Có toạ độ", "Has Coordinates"),
    created: t("Ngày tạo", "Created At"),
    updated: t("Ngày cập nhật", "Updated At"),
  })[k];

const range = (from: string, to: string) =>
  from && to ? `${from} – ${to}` : from ? `≥ ${from}` : to ? `≤ ${to}` : "";

/** The applied conditions in display order: one entry per filter field that has a value. */
export function appliedConditions(f: LocationFilter, t: T): { field: FilterField; text: string }[] {
  const all: [FilterField, string][] = [
    ["status", f.status],
    ["origin", f.origin],
    ["countries", f.countries.join(", ")],
    ["province", f.provinces.join(", ")],
    ["types", f.types.join(", ")],
    ["hasCoordinates", f.hasCoordinates],
    ["created", range(f.createdFrom, f.createdTo)],
    ["updated", range(f.updatedFrom, f.updatedTo)],
  ];
  return all
    .filter(([, v]) => v)
    .map(([field, v]) => ({ field, text: `${fieldLabel(field, t)}: ${v}` }));
}

/** The filter without one field (chip ×). */
export function withoutField(
  f: LocationFilter,
  field: FilterField,
  rows: LocationMasterRecord[],
): LocationFilter {
  switch (field) {
    case "countries":
      return withCountries(f, [], rows);
    case "province":
      return { ...f, provinces: [] };
    case "created":
      return { ...f, createdFrom: "", createdTo: "" };
    case "updated":
      return { ...f, updatedFrom: "", updatedTo: "" };
    default:
      return { ...f, [field]: EMPTY_LOCATION_FILTER[field] };
  }
}

// ---------------------------------------------------------------- URL query (BR4)

export interface LocationListSearch {
  q?: string;
  sort?: string;
  page?: number;
  size?: number;
  status?: string;
  origin?: string;
  country?: string;
  province?: string;
  type?: string;
  coords?: string;
  cFrom?: string;
  cTo?: string;
  uFrom?: string;
  uTo?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const list = (v: unknown) =>
  str(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const oneOf = <V extends string>(v: unknown, allowed: readonly V[]): V | "" => {
  const s = str(v);
  return allowed.find((a) => a.toLowerCase() === s.toLowerCase()) ?? "";
};
const day = (v: unknown) => (YMD.test(str(v)) ? str(v) : "");

/** Route `validateSearch`: keeps only well-formed values. */
export function parseLocationSearch(s: Record<string, unknown>): LocationListSearch {
  const out: LocationListSearch = {};
  const put = <K extends keyof LocationListSearch>(k: K, v: LocationListSearch[K] | "" | 0) => {
    if (v) out[k] = v as LocationListSearch[K];
  };
  put("q", str(s["q"]));
  put("sort", /^[\w.-]+\.(asc|desc)$/.test(str(s["sort"])) ? str(s["sort"]) : "");
  const page = Math.floor(Number(s["page"]));
  put("page", page > 1 ? page : 0);
  const size = Number(s["size"]);
  put(
    "size",
    (PAGE_SIZES as readonly number[]).includes(size) && size !== DEFAULT_PAGE_SIZE ? size : 0,
  );
  put("status", oneOf(s["status"], ["Active", "Inactive"]));
  put("origin", oneOf(s["origin"], CODE_KINDS));
  put("country", list(s["country"]).join(","));
  put("province", list(s["province"]).join(","));
  put("type", list(s["type"]).join(","));
  put("coords", oneOf(s["coords"], ["Yes", "No"]));
  put("cFrom", day(s["cFrom"]));
  put("cTo", day(s["cTo"]));
  put("uFrom", day(s["uFrom"]));
  put("uTo", day(s["uTo"]));
  return out;
}

export function filterFromSearch(s: LocationListSearch): LocationFilter {
  return {
    status: oneOf(s.status, ["Active", "Inactive"]),
    origin: oneOf(s.origin, CODE_KINDS),
    countries: list(s.country),
    provinces: list(s.province),
    types: list(s.type).filter((x) => (LOCATION_TYPES as readonly string[]).includes(x)),
    hasCoordinates: oneOf(s.coords, ["Yes", "No"]),
    createdFrom: s.cFrom ?? "",
    createdTo: s.cTo ?? "",
    updatedFrom: s.uFrom ?? "",
    updatedTo: s.uTo ?? "",
  };
}

export const sortFromSearch = (s: LocationListSearch): SortState | null => {
  const m = /^(.+)\.(asc|desc)$/.exec(s.sort ?? "");
  return m ? { key: m[1]!, dir: m[2] as SortState["dir"] } : null;
};

/** Filter + list state → URL query; default values are left out to keep the URL short. */
export function toLocationSearch(
  f: LocationFilter,
  l: { q: string; sort: SortState | null; page: number; pageSize: number },
): LocationListSearch {
  return parseLocationSearch({
    q: l.q,
    sort: l.sort ? `${l.sort.key}.${l.sort.dir}` : "",
    page: l.page,
    size: l.pageSize,
    status: f.status,
    origin: f.origin,
    country: f.countries.join(","),
    province: f.provinces.join(","),
    type: f.types.join(","),
    coords: f.hasCoordinates,
    cFrom: f.createdFrom,
    cTo: f.createdTo,
    uFrom: f.updatedFrom,
    uTo: f.updatedTo,
  });
}
