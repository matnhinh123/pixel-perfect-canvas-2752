import { describe, expect, it } from "vitest";
import { COST_UOM_CATALOG, seedCostGroups, seedCostItems } from "@/mock-data/costMaster";
import { costGroupTabs } from "@/services/costMasterService";

describe("Cost demo seed", () => {
  const groups = seedCostGroups();
  const items = seedCostItems();
  const groupIds = new Set(groups.map((g) => g.id));

  it("has unique codes and ids", () => {
    expect(new Set(groups.map((g) => g.code)).size).toBe(groups.length);
    expect(new Set(items.map((c) => c.code)).size).toBe(items.length);
    expect(new Set(items.map((c) => c.id)).size).toBe(items.length);
  });

  it("links every Cost and sub group to an existing group, two levels deep", () => {
    for (const c of items) expect(groupIds.has(c.groupId), c.code).toBe(true);
    for (const g of groups.filter((x) => x.parentId)) {
      const parent = groups.find((x) => x.id === g.parentId);
      expect(parent, g.code).toBeDefined();
      expect(parent!.parentId, g.code).toBeNull();
    }
  });

  it("uses UoMs from the catalog", () => {
    for (const c of items) expect(COST_UOM_CATALOG[c.uomCategory], c.code).toContain(c.uom);
  });

  it("is large enough to try the tab overflow", () => {
    expect(costGroupTabs(groups, items).length).toBeGreaterThanOrEqual(30);
  });

  it("gives a tab to groups holding Cost Codes or without sub groups; parents follow catalog order", () => {
    const tabs = costGroupTabs(groups, items).map((g) => g.code);
    // TRANS only gathers sub groups (no Cost Code of its own) → no tab; its groups follow in order.
    expect(tabs).not.toContain("TRANS");
    expect(tabs.slice(0, 3)).toEqual(["ROAD", "FUEL", "DRIVER"]);
    // PORT gathers sub groups but also holds LIFT_ON_OFF itself → keeps a tab.
    expect(tabs).toContain("PORT");
    // A top-level group without sub groups (e.g. DOC) is a tab.
    expect(tabs).toContain("DOC");
  });
});
