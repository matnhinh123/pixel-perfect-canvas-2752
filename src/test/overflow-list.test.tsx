import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OverflowList } from "@/components/movex/cost/OverflowList";

// jsdom has no layout: every item is 100px wide and the row is 300px wide.
const desc = {
  offset: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  client: Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth"),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => 300 });
});
afterAll(() => {
  if (desc.offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", desc.offset);
  if (desc.client) Object.defineProperty(Element.prototype, "clientWidth", desc.client);
});

const items = ["All", "A", "B", "C", "D"].map((k) => ({ key: k, label: k, count: 1 }));
const renderList = (selectedKey: string) =>
  render(
    <OverflowList
      ariaLabel="Groups"
      items={items}
      selectedKey={selectedKey}
      onSelect={() => {}}
      moreLabel={(n) => `More (${n})`}
      moreClassName={() => ""}
      renderItem={(i) => <button type="button">{i.label}</button>}
    />,
  );
const visible = () =>
  screen
    .getAllByRole("button")
    .filter((b) => !b.closest("[aria-hidden]"))
    .map((b) => b.textContent);

describe("OverflowList (Cost Group tabs / chips)", () => {
  it("keeps one row: what does not fit goes under More", () => {
    renderList("All");
    expect(visible()).toEqual(["All", "A", "More (3)"]);
  });

  it("keeps the selected item visible even when it would overflow", () => {
    renderList("D");
    expect(visible()).toEqual(["All", "D", "More (3)"]);
  });
});
