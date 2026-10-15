import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationFilterBar } from "@/components/movex/location/LocationFilterBar";
import { EMPTY_LOCATION_FILTER } from "@/services/locationFilter";

const en = (_vi: string, english: string) => english;

describe("Location filter bar", () => {
  it("quick Status filter: closed box names the filter, options are plain values", () => {
    const onChange = vi.fn();
    render(
      <LocationFilterBar rows={[]} value={EMPTY_LOCATION_FILTER} onChange={onChange} t={en} />,
    );
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(status.selectedOptions[0]!.textContent).toBe("Status: All");
    expect([...status.options].filter((o) => !o.hidden).map((o) => o.textContent)).toEqual([
      "All",
      "Active",
      "Inactive",
    ]);
    fireEvent.change(status, { target: { value: "Inactive" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LOCATION_FILTER, status: "Inactive" });
  });
});
