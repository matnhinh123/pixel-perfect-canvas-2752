// Fixed Cost Summary = Fare Code mapping: each row is a Fare Code and the fixed costs booked to it.
// Add / Edit opens the mapping: pick the Fare Code, then the fixed costs from the Fixed Cost list.
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, gridInBoxClass, StatusBadge, Tag, thClass } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { FixedCostTabs } from "@/components/movex/cost/FixedCostTabs";
import { vehicleTypeChoices } from "@/services/fixedCostVehicle";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { FixedCostVehicleRows } from "@/components/movex/cost/FixedCostVehicleRows";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fixedCostRepository,
  vehicleMasterRepository,
  fixedCostSummaryRepository,
} from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  fixedCostSummaryCrud,
  fixedCostSummaryService,
  periodsOf,
  sumPeriods,
  type FixedCostSummaryDraft,
} from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import { cn } from "@/lib/utils";
import type { FixedCostRecord, FixedCostSummaryRecord } from "@/types";

const num = "px-3 py-2 text-right tabular-nums";
const dayOf = (f: FixedCostRecord) => periodsOf(f).day;
const monthOf = (f: FixedCostRecord) => periodsOf(f).month;

export function FixedCostSummaryTab() {
  const summariesAll = useCollection(fixedCostSummaryRepository);
  const fixedAll = useCollection(fixedCostRepository);
  const costsAll = useCollection(costItemRepository);
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const vehicleTypes = useMemo(() => vehicleTypeChoices(vehiclesAll), [vehiclesAll]);
  /** Open mapping: null = closed, "new" = add. */
  const [open, setOpen] = useState<FixedCostSummaryRecord | "new" | null>(null);

  const fareOf = (s: FixedCostSummaryRecord) => costsAll.find((c) => c.id === s.assignCostId);
  const itemsOf = (s: FixedCostSummaryRecord) =>
    s.fixedCostIds
      .map((id) => fixedAll.find((f) => f.id === id && !f.deleted))
      .filter((f): f is FixedCostRecord => !!f);
  const totalOf = (s: FixedCostSummaryRecord) => sumPeriods(itemsOf(s));
  const rows = useMemo(
    () =>
      summariesAll
        .filter((s) => !s.deleted)
        .sort((a, b) => (fareOf(a)?.code ?? "").localeCompare(fareOf(b)?.code ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summariesAll, costsAll],
  );

  const columns = useMemo<ListColumn<FixedCostSummaryRecord>[]>(
    () => [
      {
        key: "fareCode",
        width: 120,
        label: "Fare Code",
        type: "text",
        pinned: true,
        value: (s) => fareOf(s)?.code ?? "",
        render: (s) => <span className="font-semibold text-primary">{fareOf(s)?.code ?? "—"}</span>,
      },
      {
        key: "fareName",
        width: 230,
        label: "Fare Name",
        type: "text",
        value: (s) => fareOf(s)?.name ?? "",
      },
      {
        key: "internalCosts",
        width: 230,
        label: "Internal Costs",
        type: "text",
        value: (s) =>
          itemsOf(s)
            .map((f) => f.code)
            .join(", "),
        render: (s) => (
          <div className="flex flex-wrap gap-1">
            {itemsOf(s).map((f) => (
              <span key={f.id} title={f.name}>
                <Tag>{f.code}</Tag>
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "vehicleType",
        width: 170,
        label: "Vehicle Type",
        type: "enum",
        options: vehicleTypes,
        value: (s) => s.vehicleType ?? "",
        render: (s) =>
          s.vehicleType ? (
            <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {s.vehicleType}
            </span>
          ) : (
            "—"
          ),
      },
      ...(["year", "month", "day"] as const).map((k): ListColumn<FixedCostSummaryRecord> => ({
        key: k,
        width: 140,
        label: `Total / ${k[0]!.toUpperCase()}${k.slice(1)}`,
        type: "number",
        value: (s) => totalOf(s)[k],
        render: (s) => (
          <span className={cn("tabular-nums", k === "day" && "font-semibold")}>
            {fmtMoney(totalOf(s)[k])}
          </span>
        ),
        className: "text-right",
      })),
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (s) => s.status,
        render: (s) => <StatusBadge status={s.status} />,
      },
      updatedAtColumn<FixedCostSummaryRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costsAll, fixedAll, vehicleTypes],
  );

  return (
    <>
      <EntityListPage<FixedCostSummaryRecord>
        lang="en"
        screen="fixed-cost-mapping"
        entityType="Fixed Cost Summary"
        entityLabel="Mapping"
        title="Fixed Cost"
        subtitle="Fare Code mapping: the internal costs booked to each Fare Code"
        above={<FixedCostTabs active="summary" />}
        rows={rows}
        columns={columns}
        searchPlaceholder="Search fare code, internal cost..."
        searchValues={(s) => [
          fareOf(s)?.code ?? "",
          fareOf(s)?.name ?? "",
          s.vehicleType ?? "",
          ...itemsOf(s).flatMap((f) => [f.code, f.name]),
        ]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: vehicleTypes.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleType", operator: "eq", value: v }],
            })),
          },
          statusFilter,
        ]}
        crud={fixedCostSummaryCrud}
        readOnlyReason="Import is not available for mappings yet"
        bordered
        addLabel="Add Mapping"
        onAdd={() => setOpen("new")}
        onView={(s) => setOpen(s)}
        onEdit={(s) => setOpen(s)}
      />
      {open && (
        <MappingDialog
          key={open === "new" ? "new" : open.id}
          source={open === "new" ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
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
  /** Picked fixed costs, in the order they were added. */
  const picked = d.fixedCostIds
    .map((id) => fixed.find((f) => f.id === id))
    .filter((f): f is FixedCostRecord => !!f);
  /** Fixed costs that can still be added. */
  const addable = fixed.filter((f) => f.status === "Active" && !d.fixedCostIds.includes(f.id));
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
            Pick the Fare Code, the vehicle type it applies to, then the internal costs booked to
            it.
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
                Internal Costs <span className="text-destructive">*</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Add them from the Internal Cost List — as many as needed.
              </p>
            </div>
            <div className="w-80">
              <SearchableSelect
                value=""
                onChange={(id) => id && toggle(id)}
                options={["", ...addable.map((f) => f.id)]}
                labels={{
                  "": addable.length ? "+ Add Internal Cost" : "All internal costs added",
                  ...Object.fromEntries(addable.map((f) => [f.id, `${f.code} · ${f.name}`])),
                }}
                disabled={!addable.length}
                searchPlaceholder="Search internal cost code or name…"
                emptyText="No matching Internal Cost"
              />
            </div>
          </div>
          {errors["lines"] && (
            <p className="mb-2 text-xs font-medium text-destructive">{errors["lines"]}</p>
          )}
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className={cn("w-full text-sm", gridInBoxClass)}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted text-left">
                  {["Internal Cost Code", "Internal Cost Name", "Fee Type", "Also Mapped To"].map(
                    (h) => (
                      <th key={h} className={cn(thClass, "px-3 py-2")}>
                        {h}
                      </th>
                    ),
                  )}
                  <th className={cn(thClass, "px-3 py-2 text-right")}>Per Month</th>
                  <th className={cn(thClass, "px-3 py-2 text-right")}>Per Day</th>
                  <th className={cn(thClass, "w-12")} />
                </tr>
              </thead>
              <tbody>
                {picked.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No internal cost yet — add one with “+ Add Internal Cost”.
                    </td>
                  </tr>
                )}
                {picked.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-2 font-semibold text-primary">{f.code}</td>
                    <td className="px-3 py-2">{f.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.costType}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {otherOf(f.id) || "—"}
                    </td>
                    <td className={num}>{fmtMoney(monthOf(f))}</td>
                    <td className={num}>{fmtMoney(dayOf(f))}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        aria-label={`Remove ${f.code}`}
                        title="Remove"
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => toggle(f.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {picked.length} internal cost{picked.length === 1 ? "" : "s"} picked
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
