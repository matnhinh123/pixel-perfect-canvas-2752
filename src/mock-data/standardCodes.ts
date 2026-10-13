// International location codes, a sample (~200) taken from real reference data (standardCodes.json
// "source"): Vietnamese ports / ICDs + main regional ports (UN/LOCODE, UNECE) and Vietnamese +
// main regional airports (IATA, OurAirports). A location whose code is one of these is
// a standard location; any other code is a tenant-defined Local Code.
import data from "./standardCodes.json";
import { COUNTRY_ISO2 } from "./locationCatalog";

export const CODE_KINDS = ["UN/LOCODE", "IATA Code", "Local Code"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

export interface StandardCode {
  kind: Exclude<CodeKind, "Local Code">;
  code: string;
  /** Official name in the list. */
  name: string;
  /** ISO 3166-1 alpha-2. */
  iso2: string;
  /** Country name as used by the Location form ("" when the country is not in its list). */
  country: string;
  /** UN/LOCODE: ISO 3166-2 subdivision as published (not always current); IATA: ISO region. */
  subdivision: string;
  /** IATA: the city the airport serves. */
  city: string;
  /** What the place handles: UN/LOCODE functions (Port, Road…); IATA: ["Airport"]. */
  functions: string[];
  lat: number;
  lng: number;
  /** UN/LOCODE only. */
  status: string;
  /** UN/LOCODE only: last change, "MM/YYYY". */
  updated: string;
  remarks: string;
  /** IATA only. */
  icao: string;
  /** IATA only: Large / Medium / Small airport. */
  size: string;
  /** IATA only: has scheduled passenger service. */
  scheduled: boolean;
}

/** UN/LOCODE function classifier digits. */
const FUNCTIONS: Record<string, string> = {
  "1": "Port",
  "2": "Rail",
  "3": "Road",
  "4": "Airport",
  "5": "Postal",
  "6": "Multimodal",
  "7": "Fixed transport",
  B: "Border crossing",
};

/** UN/LOCODE status codes (UNECE). */
export const UN_LOCODE_STATUS: Record<string, string> = {
  AA: "Approved by competent national government agency",
  AC: "Approved by Customs Authority",
  AF: "Approved by national facilitation body",
  AI: "Code adopted by international organisation (IATA or ECLAC)",
  AM: "Approved by the UN/LOCODE Maintenance Agency",
  AQ: "Entry approved, functions not verified",
  AS: "Approved by national standardisation body",
  RL: "Recognised location (name checked against a gazetteer)",
  RN: "Request from credible national sources",
  RQ: "Request under consideration",
  RR: "Request rejected",
  QQ: "Original entry not verified since the date indicated",
  XX: "Entry that will be removed from the next issue",
};
/** Statuses that make a code doubtful to use. */
export const DOUBTFUL_STATUSES = ["RQ", "RR", "QQ", "XX"];

const COUNTRY_OF_ISO = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([n, c]) => [c, n]));
const num = (v: unknown) => (typeof v === "number" ? v : NaN);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const yymm = (v: string) => (/^\d{4}$/.test(v) ? `${v.slice(2)}/20${v.slice(0, 2)}` : "");
const SIZES: Record<string, string> = { large: "Large", medium: "Medium", small: "Small" };

type Row = (string | number | null)[];
const UN_LOCODES: StandardCode[] = (data.unLocode as Row[]).map((r) => ({
  kind: "UN/LOCODE",
  code: str(r[0]),
  name: str(r[1]),
  iso2: str(r[0]).slice(0, 2),
  country: COUNTRY_OF_ISO[str(r[0]).slice(0, 2)] ?? "",
  subdivision: str(r[2]),
  city: "",
  functions: [...str(r[3])].map((f) => FUNCTIONS[f] ?? f),
  lat: num(r[4]),
  lng: num(r[5]),
  status: str(r[6]),
  updated: yymm(str(r[7])),
  remarks: str(r[8]),
  icao: "",
  size: "",
  scheduled: false,
}));
const IATA_CODES: StandardCode[] = (data.iata as Row[]).map((r) => ({
  kind: "IATA Code",
  code: str(r[0]),
  name: str(r[1]),
  iso2: str(r[2]),
  country: COUNTRY_OF_ISO[str(r[2])] ?? "",
  subdivision: str(r[9]),
  city: str(r[3]),
  functions: ["Airport"],
  lat: num(r[4]),
  lng: num(r[5]),
  status: "",
  updated: "",
  remarks: "",
  icao: str(r[6]),
  size: SIZES[str(r[7])] ?? str(r[7]),
  scheduled: r[8] === 1,
}));
const BY_CODE = new Map<string, StandardCode>(
  [...UN_LOCODES, ...IATA_CODES].map((c) => [c.code, c]),
);

/** The reference entry of a code (UN/LOCODE: 5 characters, IATA: 3 letters), if it is one. */
export const findStandardCode = (code: string | undefined) =>
  BY_CODE.get((code ?? "").trim().toUpperCase());

/** UN/LOCODE / IATA Code when the code is in the reference data, else a tenant Local Code. */
export const codeKindOf = (code: string | undefined): CodeKind =>
  findStandardCode(code)?.kind ?? "Local Code";

/**
 * Location Types a standard code can carry: a UN/LOCODE is a Seaport or a Depot (ICD), an IATA
 * code an Airport. `null` = no restriction (Local Code).
 */
export function typesAllowedFor(c: StandardCode | undefined): string[] | null {
  if (!c) return null;
  return c.kind === "IATA Code" ? ["Airport"] : ["Seaport", "Depot"];
}

/**
 * Type a standard code starts with: IATA → Airport; a UN/LOCODE with the port function → Seaport,
 * one that is only multimodal / road (an ICD) → Depot.
 */
export const defaultTypeFor = (c: StandardCode): string =>
  c.kind === "IATA Code" ? "Airport" : c.functions.includes("Port") ? "Seaport" : "Depot";

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/**
 * Codes matching a search (code prefix first, then name / city), of one kind when given; a chosen
 * country narrows the list.
 */
export function searchStandardCodes(
  q: string,
  opts: { kind?: CodeKind; country?: string } = {},
  limit = 12,
): StandardCode[] {
  const needle = fold(q.trim());
  if (!needle) return [];
  const iso = opts.country ? COUNTRY_ISO2[opts.country] : undefined;
  const pool =
    opts.kind === "UN/LOCODE"
      ? UN_LOCODES
      : opts.kind === "IATA Code"
        ? IATA_CODES
        : opts.kind === "Local Code"
          ? []
          : [...UN_LOCODES, ...IATA_CODES];
  const inCountry = iso ? pool.filter((c) => c.iso2 === iso) : pool;
  const byCode = inCountry.filter((c) => c.code.toLowerCase().startsWith(needle));
  const byName = inCountry.filter(
    (c) =>
      !c.code.toLowerCase().startsWith(needle) &&
      (fold(c.name).includes(needle) || fold(c.city).includes(needle)),
  );
  return [...byCode, ...byName].slice(0, limit);
}

export const STANDARD_CODE_COUNTS = { unLocode: UN_LOCODES.length, iata: IATA_CODES.length };
