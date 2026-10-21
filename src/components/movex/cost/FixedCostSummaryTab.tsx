// Fixed Cost Summary = Fare Code mapping: each row is a Fare Code and the fixed costs booked to it.
// Add / Edit opens the mapping: pick the Fare Code, then the fixed costs from the Fixed Cost list.
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Field, Panel, Tag, thClass } from "@/components/movex/common";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { FixedCostVehicleRows } from "@/components/movex/cost/FixedCostVehicleRows";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  fixedCostSummaryService,
  periodsOf,
  sumPeriods,
  type FixedCostSummaryDraft,
} from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import { cn } from "@/lib/utils";
import type { FixedCostRecord, FixedCostSummaryRecord } from "@/types";

const num = "px-3 py-2 text-right tabular-nums";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dayOf = (f: FixedCostRecord) => periodsOf(f).day;
const monthOf = (f: FixedCostRecord) => periodsOf(f).month;

export function FixedCostSummaryTab() {
  const confirm = useConfirm();
  const summariesAll = useCollection(fixedCostSummaryRepository);
  const fixedAll = useCollection(fixedCostRepository);
  const costsAll = useCollection(costItemRepository);
  const [q, setQ] = useState("");
  /** Open mapping: null = closed, "new" = add. */
  const [open, setOpen] = useState<FixedCostSummaryRecord | "new" | null>(null);

  const rows = useMemo(
    () =>
      summariesAll
        .filter((s) => !s.deleted)
        .map((s) => {
          const fare = costsAll.find((c) => c.id === s.assignCostId);
          const items = s.fixedCostIds
            .map((id) => fixedAll.find((f) => f.id === id && !f.deleted))
            .filter((f): f is FixedCostRecord => !!f);
          return {
            s,
            fare,
            items,
            vehicles: s.vehicleType ? [s.vehicleType] : [],
            total: sumPeriods(items),
          };
        })
        .sort((a, b) => (a.fare?.code ?? "").localeCompare(b.fare?.code ?? "")),
    [summariesAll, fixedAll, costsAll],
  );
  const shown = rows.filter((r) => {
    const n = fold(q.trim());
    return (
      !n ||
      fold(
        [r.fare?.code, r.fare?.name, ...r.items.map((f) => `${f.code} ${f.name}`)].join(" "),
      ).includes(n)
    );
  });

  const remove = async (s: FixedCostSummaryRecord, label: string) => {
    const ok = await confirm({
      title: "Delete this mapping?",
      description: `The fixed costs stay; they are no longer mapped to ${label}.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok !== "confirm") return;
    fixedCostSummaryService.remove(s.id);
    toast.success(`Mapping of ${label} deleted`);
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Fare Code Mapping"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search fare code, fixed cost..."
                className="h-9 w-64 pl-8"
              />
            </div>
            <Button size="sm" onClick={() => setOpen("new")}>
              <Plus className="h-4 w-4" />
              Add Mapping
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        {shown.length === 0 ? (
          <EmptyState
            title={rows.length ? "No matching mapping" : "No Fare Code mapped yet"}
            description={
              rows.length ? undefined : "Add a mapping to book fixed costs to a Fare Code."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left">
                  {["Fare Code", "Fare Name", "Fixed Costs", "Vehicle Type"].map((h) => (
                    <th key={h} className={cn(thClass, "px-3 py-2.5")}>
                      {h}
                    </th>
                  ))}
                  {["Total / Year", "Total / Month", "Total / Day"].map((h) => (
                    <th key={h} className={cn(thClass, "whitespace-nowrap px-3 py-2.5 text-right")}>
                      {h}
                    </th>
                  ))}
                  <th className={cn(thClass, "w-20")} />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ s, fare, items, vehicles, total }) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-t hover:bg-accent/40"
                    onClick={() => setOpen(s)}
                  >
                    <td className="px-3 py-2 font-semibold text-primary">{fare?.code ?? "—"}</td>
                    <td className="px-3 py-2">{fare?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {items.map((f) => (
                          <span key={f.id} title={f.name}>
                            <Tag>{f.code}</Tag>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {vehicles.length
                          ? vehicles.map((v) => (
                              <span
                                key={v}
                                className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                              >
                                {v}
                              </span>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className={num}>{fmtMoney(total.year)}</td>
                    <td className={num}>{fmtMoney(total.month)}</td>
                    <td className={cn(num, "font-semibold")}>{fmtMoney(total.day)}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-label="Edit mapping"
                          title="Edit"
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => setOpen(s)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete mapping"
                          title="Delete"
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void remove(s, fare?.code ?? "this Fare Code")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <MappingDialog
          key={open === "new" ? "new" : open.id}
          source={open === "new" ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Add / edit one mapping: the Fare Code, then the fixed costs picked from the Fixed Cost list. */
function MappingDialog({
  source,
  onClose,
}: {
  source: FixedCostSummaryRecord | null;
  onClose: () => void;
}) {
  const fixedAll = useCollection(fixedCostRepository);
  const costsAll = useCollection(costItemRepository);
  const summariesAll = useCollection(fixedCostSummaryRepository);
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const fixed = useMemo(
    () =>
      fixedAll
        .filter((f) => !f.deleted && (f.status === "Active" || source?.fixedCostIds.includes(f.id)))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [fixedAll, source],
  );
  const current = costsAll.find((c) => c.id === source?.assignCostId);
  const [d, setD] = useState<FixedCostSummaryDraft>({
    assignCostId: source?.assignCostId ?? "",
    fixedCostIds: [...(source?.fixedCostIds ?? [])],
    vehicleType: source?.vehicleType ?? "",
  });
  const [fareText, setFareText] = useState({
    code: current?.code ?? "",
    name: current?.name ?? "",
  });
  const [q, setQ] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeFare = (field: "code" | "name", v: string) => {
    const m = costs.find((c) => same(c[field], v));
    setD((x) => ({ ...x, assignCostId: m?.id ?? "" }));
    setFareText(m ? { code: m.code, name: m.name } : { code: "", name: "", [field]: v });
    setErrors((e) => ({ ...e, assignCost: "" }));
  };
  const fareMiss = (text: string) =>
    text.trim() && !d.assignCostId ? "Not found in Fare Code Management." : undefined;
  /** Fare Codes of the other mappings using this fixed cost ("Mapped To"; shown, not a limit). */
  const otherOf = (fid: string) =>
    [
      ...new Set(
        summariesAll
          .filter((x) => !x.deleted && x.id !== source?.id && x.fixedCostIds.includes(fid))
          .map((x) => costsAll.find((c) => c.id === x.assignCostId)?.code ?? "?"),
      ),
    ].join(", ");
  const toggle = (fid: string) => {
    setD((x) => ({
      ...x,
      fixedCostIds: x.fixedCostIds.includes(fid)
        ? x.fixedCostIds.filter((i) => i !== fid)
        : [...x.fixedCostIds, fid],
    }));
    setErrors((e) => ({ ...e, lines: "" }));
  };
  const list = fixed.filter((f) => {
    const n = fold(q.trim());
    return !n || fold(`${f.code} ${f.name} ${f.localName ?? ""} ${otherOf(f.id)}`).includes(n);
  });
  const picked = fixed.filter((f) => d.fixedCostIds.includes(f.id));
  const total = sumPeriods(picked);

  const save = () => {
    try {
      const rec = fixedCostSummaryService.save(d, source?.id);
      toast.success(
        `${costsAll.find((c) => c.id === rec.assignCostId)?.code ?? "Mapping"} ${source ? "saved" : "added"}`,
      );
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92vh] max-w-5xl flex-col gap-4 overflow-y-auto"
        // No auto-focus: it would open the Fare Code suggestions over the form.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {source ? `Fare Code Mapping · ${current?.code ?? ""}` : "Add Mapping"}
          </DialogTitle>
          <DialogDescription>
            Pick the Fare Code, the vehicle type it applies to, then the fixed costs booked to it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <Field
            label="Fare Code"
            required
            error={errors["assignCost"] || fareMiss(fareText.code)}
            className="sm:col-span-3"
          >
            <SuggestInput
              value={fareText.code}
              onChange={(v) => typeFare("code", v)}
              suggestions={costs.map((c) => c.code)}
              hint={(code) => costs.find((c) => c.code === code)?.name ?? ""}
              placeholder="Enter Fare Code"
              invalid={!!errors["assignCost"] || !!fareMiss(fareText.code)}
              upper
              emptyText="No matching Fare Code"
            />
          </Field>
          <Field
            label="Fare Name"
            required
            error={fareMiss(fareText.name)}
            className="sm:col-span-9"
          >
            <SuggestInput
              value={fareText.name}
              onChange={(v) => typeFare("name", v)}
              suggestions={costs.map((c) => c.name)}
              hint={(name) => costs.find((c) => c.name === name)?.code ?? ""}
              placeholder="Enter Fare Name"
              invalid={!!errors["assignCost"] || !!fareMiss(fareText.name)}
              emptyText="No matching Fare Name"
            />
          </Field>
        </div>

        <div>
          <FixedCostVehicleRows
            single
            value={d.vehicleType ? [d.vehicleType] : []}
            onChange={(v) => {
              setD((x) => ({ ...x, vehicleType: v[0] ?? "" }));
              setErrors((e) => ({ ...e, vehicleType: "" }));
            }}
            readOnly={false}
            error={errors["vehicleType"] || undefined}
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">
                Fixed Costs <span className="text-destructive">*</span>
              </div>
              <p className="text-xs text-muted-foreground">
                From the Fixed Cost list — pick as many as needed.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search fixed cost..."
                className="h-9 w-56 pl-8"
              />
            </div>
          </div>
          {errors["lines"] && (
            <p className="mb-2 text-xs font-medium text-destructive">{errors["lines"]}</p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted text-left">
                  <th className={cn(thClass, "w-10 px-3 py-2")} />
                  {["Fixed Cost Code", "Fixed Cost Name", "Cost Type", "Also Mapped To"].map(
                    (h) => (
                      <th key={h} className={cn(thClass, "px-3 py-2")}>
                        {h}
                      </th>
                    ),
                  )}
                  <th className={cn(thClass, "px-3 py-2 text-right")}>Per Month</th>
                  <th className={cn(thClass, "px-3 py-2 text-right")}>Per Day</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No matching Fixed Cost
                    </td>
                  </tr>
                )}
                {list.map((f) => {
                  const on = d.fixedCostIds.includes(f.id);
                  return (
                    <tr
                      key={f.id}
                      className={cn(
                        "cursor-pointer border-t hover:bg-accent/40",
                        on && "bg-primary/5",
                      )}
                      onClick={() => toggle(f.id)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={on}
                          onCheckedChange={() => toggle(f.id)}
                          aria-label={`Map ${f.code}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-primary">{f.code}</td>
                      <td className="px-3 py-2">{f.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.costType ?? "Allocation"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {otherOf(f.id) || "—"}
                      </td>
                      <td className={num}>{fmtMoney(monthOf(f))}</td>
                      <td className={num}>{fmtMoney(dayOf(f))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {picked.length} fixed cost{picked.length === 1 ? "" : "s"} picked
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              {(
                [
                  ["Year", total.year],
                  ["Month", total.month],
                  ["Day", total.day],
                ] as const
              ).map(([k, v]) => (
                <span key={k} className={cn(k === "Day" && "font-semibold")}>
                  <span className="text-muted-foreground">Total / {k}: </span>
                  <span className={cn("tabular-nums", k === "Day" && "text-primary")}>
                    {fmtMoney(v)} ₫
                  </span>
                </span>
              ))}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
