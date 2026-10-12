import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationFilterBar } from "@/components/movex/location/LocationFilterBar";
import { EMPTY_LOCATION_FILTER, type LocationFilter } from "@/services/locationFilter";

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

  it("E1: From after To shows the error and disables Apply", () => {
    const onChange = vi.fn();
    render(
      <LocationFilterBar rows={[]} value={EMPTY_LOCATION_FILTER} onChange={onChange} t={en} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
    fireEvent.change(screen.getByLabelText("Created At from"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Created At to"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("From date must be before To date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Created At to"), { target: { value: "2026-09-30" } });
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledWith<[LocationFilter]>({
      ...EMPTY_LOCATION_FILTER,
      createdFrom: "2026-09-10",
      createdTo: "2026-09-30",
    });
  });
});
