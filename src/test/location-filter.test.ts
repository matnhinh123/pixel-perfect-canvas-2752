import { describe, expect, it } from "vitest";
import type { LocationMasterRecord } from "@/mock-data/locations";
import {
  DATE_RANGE_ERROR,
  EMPTY_LOCATION_FILTER,
  filterFromSearch,
  filterHasErrors,
  matchLocation,
  parseLocationSearch,
  provincesFor,
  rangeError,
  subTypesFor,
  tenantYmd,
  toLocationSearch,
  withCountries,
  withTypes,
  withoutField,
  type LocationFilter,
} from "@/services/locationFilter";

const loc = (p: Partial<LocationMasterRecord>): LocationMasterRecord => ({
  id: p.code ?? "L",
  code: "L",
  name: "Loc",
  address: "",
  province: "TP. Hồ Chí Minh",
  country: "Vietnam",
  locationType: "Warehouse",
  locationSubType: "",
  lat: 10.8,
  lng: 106.7,
  status: "Active",
  createdAt: "2026-09-01T02:00:00.000Z",
  createdBy: "",
  updatedAt: "2026-09-10T02:00:00.000Z",
  updatedBy: "",
  ...p,
});

const rows = [
  loc({ code: "A" }),
  loc({
    code: "B",
    province: "Đồng Nai",
    locationType: "Port",
    locationSubType: "ICD",
    unLocode: "VNDNA",
  }),
  loc({
    code: "C",
    country: "Cambodia",
    province: "Phnom Penh",
    lat: NaN,
    lng: NaN,
    status: "Inactive",
  }),
];
const f = (p: Partial<LocationFilter>): LocationFilter => ({ ...EMPTY_LOCATION_FILTER, ...p });
const codes = (filter: LocationFilter) =>
  rows.filter((r) => matchLocation(r, filter)).map((r) => r.code);

describe("Location filters", () => {
  it("BR1: combines every condition with AND", () => {
    expect(codes(f({}))).toEqual(["A", "B", "C"]);
    expect(codes(f({ types: ["Warehouse"] }))).toEqual(["A", "C"]);
    expect(codes(f({ types: ["Warehouse"], status: "Active" }))).toEqual(["A"]);
    expect(codes(f({ countries: ["Vietnam"], provinces: ["Đồng Nai"] }))).toEqual(["B"]);
    expect(codes(f({ provinces: ["Đồng Nai", "Phnom Penh"] }))).toEqual(["B", "C"]);
    expect(codes(f({ origin: "Standard" }))).toEqual(["B"]);
    expect(codes(f({ subTypes: ["ICD"] }))).toEqual(["B"]);
    expect(codes(f({ hasCoordinates: "No" }))).toEqual(["C"]);
    expect(codes(f({ countries: ["Vietnam", "Cambodia"] }))).toEqual(["A", "B", "C"]);
  });

  it("BR2: Province/City options follow Country; changing Country clears a province that no longer fits", () => {
    expect(provincesFor(rows, ["Cambodia"])).toEqual(["Phnom Penh"]);
    expect(provincesFor(rows, [])).toHaveLength(3);
    const picked = f({ countries: ["Vietnam", "Cambodia"], provinces: ["Đồng Nai", "Phnom Penh"] });
    expect(withCountries(picked, ["Cambodia"], rows).provinces).toEqual(["Phnom Penh"]);
    expect(withCountries(picked, [], rows).provinces).toEqual(["Đồng Nai", "Phnom Penh"]);
  });

  it("Sub Type options follow Location Type", () => {
    expect(subTypesFor(["Warehouse"])).toContain("Cold Storage");
    expect(subTypesFor(["Warehouse"])).not.toContain("ICD");
    expect(subTypesFor(["Port", "Farm"])).toEqual(expect.arrayContaining(["ICD", "Crop Farm"]));
    expect(subTypesFor(["Port"])).toContain("ICD");
    expect(withTypes(f({ types: ["Port"], subTypes: ["ICD"] }), ["Warehouse"]).subTypes).toEqual(
      [],
    );
  });

  it("filters Created / Updated At by tenant day (Asia/Ho_Chi_Minh)", () => {
    // 2026-08-31 18:00 UTC is already 1 Sep in Vietnam.
    expect(tenantYmd("2026-08-31T18:00:00.000Z")).toBe("2026-09-01");
    expect(codes(f({ createdFrom: "2026-09-01", createdTo: "2026-09-01" }))).toHaveLength(3);
    expect(codes(f({ updatedFrom: "2026-09-11" }))).toEqual([]);
  });

  it("E1: From after To is an error and blocks Apply", () => {
    expect(rangeError("2026-09-10", "2026-09-01")).toBe(DATE_RANGE_ERROR);
    expect(rangeError("2026-09-01", "2026-09-01")).toBeNull();
    expect(filterHasErrors(f({ updatedFrom: "2026-09-10", updatedTo: "2026-09-01" }))).toBe(true);
  });

  it("removing a chip clears only that condition", () => {
    const all = f({
      status: "Active",
      countries: ["Vietnam"],
      provinces: ["Đồng Nai"],
      types: ["Port"],
      subTypes: ["ICD"],
    });
    expect(withoutField(all, "status", rows)).toEqual({ ...all, status: "" });
    expect(withoutField(all, "types", rows)).toEqual({ ...all, types: [], subTypes: ["ICD"] });
    expect(withoutField(all, "province", rows)).toEqual({ ...all, provinces: [] });
  });

  it("BR4: filter, sort and paging round-trip through the URL query (defaults left out)", () => {
    const filter = f({
      status: "Active",
      countries: ["Vietnam", "Laos"],
      provinces: ["TP. Hồ Chí Minh", "Đồng Nai"],
      createdFrom: "2026-09-01",
    });
    const list = { q: "kho", sort: { key: "name", dir: "desc" as const }, page: 3, pageSize: 50 };
    const query = toLocationSearch(filter, list);
    expect(query).toEqual({
      q: "kho",
      sort: "name.desc",
      page: 3,
      size: 50,
      status: "Active",
      country: "Vietnam,Laos",
      province: "TP. Hồ Chí Minh,Đồng Nai",
      cFrom: "2026-09-01",
    });
    expect(filterFromSearch(parseLocationSearch({ ...query }))).toEqual(filter);
    expect(
      toLocationSearch(EMPTY_LOCATION_FILTER, { q: "", sort: null, page: 1, pageSize: 20 }),
    ).toEqual({});
    expect(parseLocationSearch({ status: "bad", size: 10, cFrom: "01/09/2026" })).toEqual({});
  });
});
