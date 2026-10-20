import { describe, expect, it } from "vitest";
import { applyConditions, type FieldMeta } from "@/services/filterService";

const fields: FieldMeta[] = [
  { key: "stops", label: "Number of stops", type: "number" },
  { key: "time", label: "Est. time", type: "duration" },
];
const rows = [
  { id: "a", stops: 0, time: 90 },
  { id: "b", stops: 2, time: 948 },
  { id: "c", stops: 5, time: null },
];
const get = (r: (typeof rows)[number], k: string) => r[k as "stops" | "time"];
const ids = (c: Parameters<typeof applyConditions>[1]) =>
  applyConditions(rows, c, fields, get).map((r) => r.id);

describe("filterService", () => {
  it("filters Number of stops as a number", () => {
    expect(
      ids([{ id: "1", field: "stops", operator: "between", value: "1", value2: "5" }]),
    ).toEqual(["b", "c"]);
    expect(ids([{ id: "1", field: "stops", operator: "eq", value: "0" }])).toEqual(["a"]);
  });

  it("reads durations like the route detail (15h 48m, 15:48, hours, minutes)", () => {
    const eq = (value: string) => ids([{ id: "1", field: "time", operator: "eq", value }]);
    expect(eq("15h 48m")).toEqual(["b"]);
    expect(eq("15:48")).toEqual(["b"]);
    expect(eq("1.5")).toEqual(["a"]);
    expect(eq("90m")).toEqual(["a"]);
    expect(ids([{ id: "1", field: "time", operator: "between", value: "2h", value2: "" }])).toEqual(
      ["b"],
    );
  });

  it("an unreadable duration matches nothing", () => {
    expect(ids([{ id: "1", field: "time", operator: "eq", value: "abc" }])).toEqual([]);
  });
});
