import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { CostGroupDrawer } from "@/components/movex/cost/CostGroupDrawer";
import { costGroupRepository } from "@/repositories";
import type { CostGroupRecord } from "@/types";

const groups = () => costGroupRepository.all().filter((g) => !g.deleted);
// The app wraps every page in a TooltipProvider (field help icons need it).
const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

describe("Cost Group drawer (on the Cost page)", () => {
  it("adds a sub group under the selected group without leaving the page", () => {
    const parent = groups().find((g) => g.code === "TRANS")!;
    const onSaved = vi.fn<(g: CostGroupRecord) => void>();
    render(
      <CostGroupDrawer
        target={{ mode: "new", parentId: parent.id }}
        groups={groups()}
        onClose={() => {}}
        onSaved={onSaved}
        onEditGroup={() => {}}
      />,
    );
    expect(screen.getByText("Add Cost Group")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("e.g. OCEAN"), { target: { value: "toll x" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Ocean Freight Cost"), {
      target: { value: "Toll Extra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = onSaved.mock.calls[0]![0];
    expect(saved).toMatchObject({ code: "TOLLX", name: "Toll Extra", parentId: parent.id });
    expect(groups().some((g) => g.id === saved.id)).toBe(true);
    costGroupRepository.update(saved.id, (g) => ({ ...g, deleted: true }));
  });

  it("shows field errors and does not save a duplicate code", () => {
    const onSaved = vi.fn();
    render(
      <CostGroupDrawer
        target={{ mode: "new", parentId: null }}
        groups={groups()}
        onClose={() => {}}
        onSaved={onSaved}
        onEditGroup={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. OCEAN"), { target: { value: "TRANS" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/TRANS already exists/)).toBeInTheDocument();
    expect(screen.getByText(/Group Name is required/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps a group that has sub groups top-level (parent locked)", () => {
    const trans = groups().find((g) => g.code === "TRANS")!;
    render(
      <CostGroupDrawer
        target={{ mode: "edit", group: trans }}
        groups={groups()}
        onClose={() => {}}
        onSaved={() => {}}
        onEditGroup={() => {}}
      />,
    );
    for (const s of screen.getAllByRole("combobox")) expect(s).toBeDisabled();
  });

  it("opens the parent group, or a group under it, from the drawer", () => {
    const fuel = groups().find((g) => g.code === "FUEL")!;
    const trans = groups().find((g) => g.code === "TRANS")!;
    const onEditGroup = vi.fn();
    const { unmount } = render(
      <CostGroupDrawer
        target={{ mode: "edit", group: fuel }}
        groups={groups()}
        onClose={() => {}}
        onSaved={() => {}}
        onEditGroup={onEditGroup}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit parent group (TRANS)" }));
    expect(onEditGroup).toHaveBeenCalledWith(trans);
    unmount();

    render(
      <CostGroupDrawer
        target={{ mode: "edit", group: trans }}
        groups={groups()}
        onClose={() => {}}
        onSaved={() => {}}
        onEditGroup={onEditGroup}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fuel Cost" }));
    expect(onEditGroup).toHaveBeenLastCalledWith(fuel);
  });

  it("links Parent Cost Group Code and Name: picking one fills the other", () => {
    const ocean = groups().find((g) => g.code === "OCEAN")!;
    const port = groups().find((g) => g.code === "PORT")!;
    render(
      <CostGroupDrawer
        target={{ mode: "new", parentId: null }}
        groups={groups()}
        onClose={() => {}}
        onSaved={() => {}}
        onEditGroup={() => {}}
      />,
    );
    const [code, name] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(code!, { target: { value: ocean.id } });
    expect(name!.selectedOptions[0]!.textContent).toBe("Ocean Freight Cost");
    fireEvent.change(name!, { target: { value: port.id } });
    expect(code!.selectedOptions[0]!.textContent).toBe("PORT");
    fireEvent.change(code!, { target: { value: "" } });
    expect(name!.selectedOptions[0]!.textContent).toBe("— None —");
  });
});
