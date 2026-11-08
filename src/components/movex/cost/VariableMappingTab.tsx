// Variable Cost › Variable Cost Mapping: one row per variable cost (Trip Salary, Fuel Cost, Toll Fee) and
// the Fare Code it is booked to, for every vehicle type. Type the Fare Code or its name: the other one is
// filled in. Save writes one mapping per variable cost (the older per-vehicle ones of it are folded in).
import { useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Tag, thClass, gridInBoxClass } from "@/components/movex/common";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { useCollection } from "@/hooks/use-store";
import { costItemRepository, variableCostMappingRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { variableCostMappingCrud, variableCostMappingService } from "@/services/cost/variableSetup";
import { cn } from "@/lib/utils";
import { VARIABLE_COMPONENTS, type VariableComponent } from "@/types";

/** Where each variable cost is read from. */
const READ_FROM: Record<VariableComponent, string> = {
  "Trip Salary": "Salary Range",
  "Fuel Cost": "Fuel Cost",
  "Toll Fee": "Route › Toll Stations",
};

type Row = { code: string; name: string };

export function VariableMappingTab() {
  const all = useCollection(variableCostMappingRepository);
  const costsAll = useCollection(costItemRepository);
  const types = useVehicleTypes();
  const costs = useMemo(
    () => costsAll.filter((c) => !c.deleted && c.status === "Active"),
    [costsAll],
  );
  const live = all.filter((m) => !m.deleted);
  /** The mappings of a variable cost (one after a save; older data may hold one per vehicle type). */
  const mappingsOf = (c: VariableComponent) => live.filter((m) => m.component === c);

  /** What the table shows as saved: the Fare Code of each variable cost. */
  const saved = useMemo(
    () =>
      Object.fromEntries(
        VARIABLE_COMPONENTS.map((c) => {
          const m = live.find((x) => x.component === c);
          const fare = m && costsAll.find((x) => x.id === m.assignCostId);
          return [c, { code: fare?.code ?? "", name: fare?.name ?? "" }];
        }),
      ) as Record<VariableComponent, Row>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, costsAll],
  );
  const [d, setD] = useState<Record<VariableComponent, Row>>(saved);
  const [errors, setErrors] = useState<Partial<Record<VariableComponent, string>>>({});
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);

  /** Code typed: the name follows when it is a Fare Code; name typed: the code follows. */
  const type = (c: VariableComponent, field: keyof Row, v: string) => {
    const hit =
      field === "code"
        ? costs.find((x) => x.code === v.trim().toUpperCase())
        : costs.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    setD((x) => ({
      ...x,
      [c]:
        field === "code"
          ? { code: v, name: hit ? hit.name : "" }
          : { code: hit ? hit.code : "", name: v },
    }));
    setErrors((e) => ({ ...e, [c]: undefined }));
  };

  const save = () => {
    // Check every row first: a known, active Fare Code, not used by two variable costs.
    const e: Partial<Record<VariableComponent, string>> = {};
    const ids: Partial<Record<VariableComponent, string>> = {};
    for (const c of VARIABLE_COMPONENTS) {
      const code = d[c].code.trim().toUpperCase();
      if (!code) continue;
      const fare = costs.find((x) => x.code === code);
      if (!fare) e[c] = `Fare Code ${code} is not an active Fare Code.`;
      else if (Object.values(ids).includes(fare.id))
        e[c] = `${code} is already the Fare Code of another variable cost.`;
      else ids[c] = fare.id;
    }
    if (Object.keys(e).length) {
      setErrors(e);
      toast.error("Please check the highlighted rows.");
      return;
    }
    const allTypes = types.map((t) => t.key);
    try {
      for (const c of VARIABLE_COMPONENTS) {
        const [keep, ...others] = mappingsOf(c);
        const fareId = ids[c];
        const unchanged =
          keep &&
          !others.length &&
          keep.assignCostId === fareId &&
          allTypes.every((t) => keep.vehicleTypes.includes(t));
        if (unchanged) continue;
        // One mapping per variable cost, for every vehicle type; no Fare Code: no mapping.
        variableCostMappingCrud.removeMany([
          ...others.map((m) => m.id),
          ...(!fareId && keep ? [keep.id] : []),
        ]);
        if (fareId)
          variableCostMappingService.save(
            { assignCostId: fareId, vehicleTypes: allTypes, component: c },
            keep?.id,
          );
      }
      setErrors({});
      toast.success("Variable Cost Mapping saved");
    } catch (err) {
      toast.error(
        err instanceof BusinessRuleError
          ? Object.values(err.fieldErrors)[0] || err.message
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
    }
  };

  const cell = "px-3 py-2";
  const head = (h: string) => (
    <th key={h} className={cn(thClass, cell, "text-left")}>
      {h}
    </th>
  );

  return (
    <div>
      <PageHeader crumbs={[{ label: "Variable Cost" }]} title="Variable Cost" />
      <VariableCostTabs active="mapping" />

      <Panel
        accent
        title="Variable Cost Mapping"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => (setD(saved), setErrors({}))}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button disabled={!dirty} onClick={save}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          The Fare Code each variable cost is booked to in a COGS, for every vehicle type. Type the
          Fare Code or the Fare Name: the other one is filled in. Left empty: the variable cost has
          no Fare Code.
        </p>
        <div className="w-fit max-w-full overflow-auto rounded-lg border">
          <table className={cn("text-sm", gridInBoxClass)} style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 170 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 360 }} />
            </colgroup>
            <thead>
              <tr className="bg-muted">
                {head("Variable Cost")}
                {head("Read from")}
                {head("Fare Code")}
                {head("Fare Name")}
              </tr>
            </thead>
            <tbody>
              {VARIABLE_COMPONENTS.map((c) => (
                <tr key={c} className="border-t align-top">
                  <td className={cn(cell, "pt-3.5")}>
                    <Tag>{c}</Tag>
                  </td>
                  <td className={cn(cell, "pt-3.5 text-muted-foreground")}>{READ_FROM[c]}</td>
                  <td className={cell}>
                    <SuggestInput
                      value={d[c].code}
                      onChange={(v) => type(c, "code", v)}
                      suggestions={costs.map((x) => x.code)}
                      hint={(code) => costs.find((x) => x.code === code)?.name ?? ""}
                      placeholder="Enter Fare Code"
                      invalid={!!errors[c]}
                      upper
                      emptyText="No matching Fare Code"
                    />
                  </td>
                  <td className={cell}>
                    <SuggestInput
                      value={d[c].name}
                      onChange={(v) => type(c, "name", v)}
                      suggestions={costs.map((x) => x.name)}
                      hint={(name) => costs.find((x) => x.name === name)?.code ?? ""}
                      placeholder="Enter Fare Name"
                      invalid={!!errors[c]}
                      emptyText="No matching Fare Name"
                    />
                    {errors[c] && (
                      <div className="mt-1 text-[11px] text-destructive">{errors[c]}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
