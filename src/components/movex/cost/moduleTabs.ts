// Look of the tabs at the top of a Cost screen (Fixed Cost, Variable Cost): one framed bar, every tab
// in bold; the picked one filled in primary, the others plain and readable (not faded).
import { cn } from "@/lib/utils";

export const moduleTablistClass =
  "mb-4 inline-flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-hu-sm";

export const moduleTabClass = (active: boolean) =>
  cn(
    "rounded-lg px-4 py-2 text-sm font-bold transition-colors",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-foreground/75 hover:bg-muted hover:text-foreground",
  );
