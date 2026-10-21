import { withCurrent } from "@/services/commonCodeService";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, NativeSelect, Panel, thClass } from "@/components/movex/common";
import { Input } from "@/components/ui/input";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  fixedCostRepository,
  fixedCostSummaryRepository,
  vehicleMasterRepository,
} from "@/repositories";
import { coversChoice, vehicleTypeChoices } from "@/services/fixedCostVehicle";
import { BusinessRuleError } from "@/services/crudService";
import { calcFixedCost, fixedCostSummaryService, summaryOf } from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import { downloadFile, toCsv } from "@/services/importExportService";
import { cn } from "@/lib/utils";

const num = "px-3 py-2 text-right tabular-nums";

/** SFC.03 — fixed costs picked per vehicle type, with the Total Fixed Cost fed to Pricing List. */
export function FixedCostSummaryTab() {
  const vehiclesAll = useCollection(vehicleMasterRepository);
  const vehicleTypes = useMemo(() => vehicleTypeChoices(vehiclesAll), [vehiclesAll]);
  const fixedAll = useCollection(fixedCostRepository);
  const summaries = useCollection(fixedCostSummaryRepository);
  const costsAll = useCollection(costItemRepository);
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const fixed = useMemo(() => fixedAll.filter((f) => !f.deleted), [fixedAll]);

  const [vehicleType, setVehicleType] = useState(
    () => vehicleTypes.find((v) => summaryOf(v)) ?? vehicleTypes[0] ?? "",
  );
  const saved = summaries.find((s) => s.vehicleType === vehicleType && !s.deleted);
  const [editing, setEditing] = useState(false);
  const [assign, setAssign] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  // Fare Code / Fare Name: typed or picked; an exact match selects the Fare Code, the other follows.
  const [fareText, setFareText] = useState({ code: "", name: "" });
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeFare = (field: "code" | "name", v: string) => {
    const m = costs.find((c) => same(c[field], v));
    setAssign(m?.id ?? "");
    setFareText(m ? { code: m.code, name: m.name } : { code: "", name: "", [field]: v });
    setErrors((e) => {
      const n = { ...e };
      delete n["assignCost"];
      return n;
    });
  };
  const fareMiss = (text: string) =>
    editing && text.trim() && !assign ? "Not found in Fare Code Management." : undefined;
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Shown values: draft while editing, saved otherwise.
  const shownAssign = editing ? assign : (saved?.assignCostId ?? "");
  const shownLines = editing ? lines : (saved?.fixedCostIds ?? []);

  const pickVehicle = (v: string) => {
    setVehicleType(v);
    setEditing(false);
    setErrors({});
  };
  const startEdit = () => {
    setAssign(saved?.assignCostId ?? "");
    setFareText(costLabel(saved?.assignCostId ?? ""));
    setLines(saved?.fixedCostIds ?? []);
    setErrors({});
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setErrors({});
  };
  const save = () => {
    try {
      fixedCostSummaryService.save(vehicleType, assign, lines);
      toast.success(`Fixed Cost Summary of ${vehicleType} saved`);
      setEditing(false);
      setErrors({});
    } catch (e) {
      if (e instanceof BusinessRuleError) setErrors(e.fieldErrors);
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  // Only Active fixed costs assigned to this vehicle type, and not already used on another line.
  const optionsFor = (index: number) =>
    fixed.filter(
      (f) =>
        f.status === "Active" &&
        f.vehicleTypes.some((l) => coversChoice(l, vehicleType)) &&
        !lines.some((l, i) => i !== index && l === f.id),
    );

  const rows = shownLines.map((id) => {
    const f = fixed.find((x) => x.id === id);
    return { id, f, c: f ? calcFixedCost(f) : null };
  });
  const total = rows.reduce((s, r) => s + (r.c?.day ?? 0), 0);
  const costLabel = (id: string) => {
    const c = costs.find((x) => x.id === id) ?? costsAll.find((x) => x.id === id);
    return c ? { code: c.code, name: c.name } : { code: "", name: "" };
  };

  const exportCsv = () =>
    downloadFile(
      `fixed-cost-summary-${vehicleType}.csv`,
      toCsv(
        [
          "Vehicle Type",
          "Fare Code",
          "Fare Name",
          "Fixed Cost Code",
          "Fixed Cost Name",
          "Allocation Value",
          "Year",
          "Month",
          "Day",
        ],
        [
          ...rows.map((r) => [
            vehicleType,
            costLabel(shownAssign).code,
            costLabel(shownAssign).name,
            r.f?.code ?? "",
            r.f?.name ?? "",
            ...[r.c?.allocation, r.c?.year, r.c?.month, r.c?.day].map((n) =>
              n == null ? "" : Math.round(n),
            ),
          ]),
          ["", "", "", "", "Total Fixed Cost", "", "", "", Math.round(total)],
        ],
      ),
    );

  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
          <Field label="Vehicle Type" required error={errors["vehicleType"]}>
            <NativeSelect
              className="h-10 w-full"
              value={vehicleType}
              onChange={pickVehicle}
              options={withCurrent(vehicleTypes, vehicleType)}
            />
          </Field>
          <Field
            label="Fare Code"
            required
            error={errors["assignCost"] ?? fareMiss(fareText.code)}
            info="The Fare Code (Fare Code Management) the Total Fixed Cost of this vehicle type is booked to. Type or pick a code or a name: the other one follows."
          >
            {editing ? (
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
            ) : (
              <Input value={costLabel(shownAssign).code || "—"} disabled />
            )}
          </Field>
          <Field label="Fare Name" required error={fareMiss(fareText.name)}>
            {editing ? (
              <SuggestInput
                value={fareText.name}
                onChange={(v) => typeFare("name", v)}
                suggestions={costs.map((c) => c.name)}
                hint={(name) => costs.find((c) => c.name === name)?.code ?? ""}
                placeholder="Enter Fare Name"
                invalid={!!errors["assignCost"] || !!fareMiss(fareText.name)}
                emptyText="No matching Fare Name"
              />
            ) : (
              <Input value={costLabel(shownAssign).name || "—"} disabled />
            )}
          </Field>
        </div>
      </Panel>

      <Panel
        title="Fixed Cost Lines"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLines((l) => [...l, ""])}>
                  <Plus className="h-4 w-4" />
                  Add Line
                </Button>
                <Button variant="outline" size="sm" onClick={cancel}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm" onClick={save}>
                  <Save className="h-4 w-4" />
                  Save Summary
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        }
      >
        {errors["lines"] && (
          <p className="mb-3 text-sm font-medium text-destructive">{errors["lines"]}</p>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-left">
                {["Fixed Cost Code", "Fixed Cost Name"].map((h) => (
                  <th key={h} className={cn(thClass, "min-w-48 px-3 py-2.5")}>
                    {h}
                  </th>
                ))}
                {["Allocation Value", "Year", "Month", "Day"].map((h) => (
                  <th key={h} className={cn(thClass, "px-3 py-2.5 text-right")}>
                    {h}
                  </th>
                ))}
                {editing && <th className={cn(thClass, "w-12")} />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={editing ? 7 : 6}>
                    <EmptyState
                      title={`No fixed cost for ${vehicleType}`}
                      description={
                        editing
                          ? "Use Add Line to pick the fixed costs assigned to this vehicle type."
                          : "Press Edit, then Add Line to build this summary."
                      }
                    />
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const opts = editing ? optionsFor(i) : [];
                const ids = ["", ...opts.map((f) => f.id)];
                const pick = (v: string) => setLines((l) => l.map((x, j) => (j === i ? v : x)));
                return (
                  <tr key={`${i}-${r.id}`} className="border-t">
                    <td className="px-3 py-2">
                      {editing ? (
                        <NativeSelect
                          className="w-full"
                          value={r.id}
                          onChange={pick}
                          options={r.id && !ids.includes(r.id) ? [...ids, r.id] : ids}
                          labels={{
                            "": "Select code",
                            ...Object.fromEntries(fixed.map((f) => [f.id, f.code])),
                          }}
                        />
                      ) : (
                        <span className="font-semibold text-primary">{r.f?.code ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <NativeSelect
                          className="w-full"
                          value={r.id}
                          onChange={pick}
                          options={r.id && !ids.includes(r.id) ? [...ids, r.id] : ids}
                          labels={{
                            "": "Select name",
                            ...Object.fromEntries(fixed.map((f) => [f.id, f.name])),
                          }}
                        />
                      ) : (
                        (r.f?.name ?? "—")
                      )}
                    </td>
                    <td className={num}>{fmtMoney(r.c?.allocation)}</td>
                    <td className={num}>{fmtMoney(r.c?.year)}</td>
                    <td className={num}>{fmtMoney(r.c?.month)}</td>
                    <td className={cn(num, "font-semibold")}>{fmtMoney(r.c?.day)}</td>
                    {editing && (
                      <td className="px-2 text-center">
                        <button
                          type="button"
                          aria-label="Remove line"
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setLines((l) => l.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold">
                <td colSpan={5} className="px-3 py-3 text-right">
                  Total Fixed Cost (Day)
                </td>
                <td className={cn(num, "py-3 text-base text-primary")}>{fmtMoney(total)} ₫</td>
                {editing && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
