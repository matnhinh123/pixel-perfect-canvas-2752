// Variable Cost › Reference Trip Salary: pick a vehicle type (Truck → Truck Type, or Header → the
// container it pulls) and a distance; the Salary Range of that vehicle type is found (its code shown) and
// the Trip Salary worked out step by step from its tiers.
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, PageHeader, Panel, InlineFields } from "@/components/movex/common";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository, salaryRangeRepository } from "@/repositories";
import { CC } from "@/mock-data/commonCodes";
import { setupsFor } from "@/services/cost/cogsBuild";
import { useCodeOptions } from "@/services/commonCodeService";
import type { Terrain } from "@/types";
import { parseVehicleKey } from "@/services/cost/cogsVehicle";
import { ruleOf, tripSalaryOf } from "@/services/cost/salaryRange";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const money = (n: number) => (Number.isFinite(n) ? formatNumber(Math.round(n)) : "—");
/** No container column picked: the tier's own Trip Salary and Extra Distance Rate. */
const OTHER = "";

export function ReferenceTripTab() {
  const types = useVehicleTypes();
  const ranges = useCollection(salaryRangeRepository);
  const codes = useCollection(commonCodeRepository);
  const [vehicle, setVehicle] = useState("");
  const [container, setContainer] = useState(OTHER);
  const [kmText, setKmText] = useState("260");
  const km = kmText === "" ? NaN : Number(kmText);
  /** Terrain of the trip: Other adds the Salary Range's Other terrain surcharge. */
  const [terrain, setTerrain] = useState<Terrain>("Plain");
  const terrains = useCodeOptions(CC.TERRAIN, ["Plain", "Other"]);

  const isHeader = parseVehicleKey(vehicle)?.kind === "HEADER";
  const picked = vehicle === "HEADER" || !!parseVehicleKey(vehicle)?.spec;
  // The Salary Range used: the active one of the vehicle type (Drafts never).
  const range = picked ? setupsFor(ranges, vehicle)[0] : undefined;
  const ctype = codes.find((r) => r.id === CC.CONTAINER_TYPE && !r.deleted);
  const ctypeLabel = (iso: string) => {
    const o = ctype?.options.find((x) => x.name === iso);
    return o ? `${iso} · ${o.values?.["en"] ?? ""} (${o.attribute})` : iso;
  };
  const col = isHeader ? range?.containers.find((c) => c.container === container) : undefined;
  const rule = range ? ruleOf(range.rule) : undefined;
  const s =
    range && Number.isFinite(km) && km >= 0
      ? tripSalaryOf(range.tiers, km, undefined, undefined, {
          rule: ruleOf(range.rule),
          container: col,
        })
      : null;

  return (
    <div>
      <PageHeader crumbs={[{ label: "Variable Cost" }]} title="Variable Cost" />
      <VariableCostTabs active="reference" />

      <div className="space-y-4">
        <Panel title="Reference Trip Salary">
          <InlineFields labelWidth="8rem">
            <div className="grid grid-cols-1 justify-start gap-x-12 gap-y-3 sm:grid-cols-[26rem_32rem]">
              <Field
                label="Vehicle Type"
                required
                info="From Master Data › Vehicle: Truck → Truck Type, or Header (then the container it pulls)."
              >
                <VehicleTypePicker
                  salary
                  value={vehicle}
                  onChange={(v) => {
                    setVehicle(v);
                    setContainer(OTHER);
                  }}
                  types={types}
                />
              </Field>
              {isHeader && (
                <Field
                  label="Container Type"
                  info="Common Code › Container Type. A container with a column in the Salary Range is paid that column's rates; any other one the tier's own."
                >
                  <NativeSelect
                    value={container}
                    onChange={setContainer}
                    options={[
                      OTHER,
                      ...(ctype?.options ?? []).filter((o) => o.active).map((o) => o.name),
                    ]}
                    labels={{
                      [OTHER]: "Other container (no column)",
                      ...Object.fromEntries(
                        (ctype?.options ?? []).map((o) => {
                          const c = range?.containers.find((x) => x.container === o.name);
                          return [
                            o.name,
                            `${ctypeLabel(o.name)}${c ? ` · column +${c.pct}%` : ""}`,
                          ];
                        }),
                      ),
                    }}
                    className="h-10 w-full"
                  />
                </Field>
              )}
              <Field
                label="Terrain"
                info="Route Management › Terrain. Other: the Salary Range's Other terrain surcharge is added to the Road Support Fee."
              >
                <NativeSelect
                  value={terrain}
                  onChange={(v) => setTerrain(v as Terrain)}
                  options={terrains}
                  className="h-10 w-full"
                />
              </Field>
              <Field label="Distance (km)" required>
                <Input
                  inputMode="numeric"
                  value={kmText}
                  onChange={(e) => setKmText(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  className="text-right tabular-nums"
                  aria-label="Distance (km)"
                />
              </Field>
            </div>
          </InlineFields>
          {/* Result, under the inputs. */}
          <div className="mt-4 border-t pt-4">
            {!picked ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Pick a vehicle type and a distance: its Salary Range and the Trip Salary are shown
                here.
              </p>
            ) : !range ? (
              <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" />
                No active Salary Range for {vehicle}.{" "}
                <Link
                  to="/variable-cost"
                  search={{ tab: "salary" }}
                  className="font-semibold text-primary hover:underline"
                >
                  Open Salary Range
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span>
                  <span className="text-muted-foreground">Salary Range Code </span>
                  <Link
                    to="/salary-range/$id"
                    params={{ id: range.id }}
                    search={{ mode: "view" }}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    {range.code}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </span>
                <span>
                  <span className="text-muted-foreground">Salary Range Name </span>
                  <span className="font-medium">{range.name}</span>
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {!s ? (
                    <span className="text-sm text-warning">
                      {Number.isFinite(km)
                        ? `${formatNumber(km)} km is past the last tier of ${range.code} (${formatNumber(range.tiers[range.tiers.length - 1]?.to ?? 0)} km).`
                        : "Enter a distance."}
                    </span>
                  ) : (
                    <>
                      <Cell
                        label="Trip Salary"
                        value={`${money(s.base)} ₫`}
                        strong
                        tip={
                          <ol className="space-y-1">
                            <li>
                              1. {formatNumber(km)} km falls in Tier {s.tier} ({s.tierRange}).
                            </li>
                            <li>
                              2. Extra km = {formatNumber(km)} − {formatNumber(s.fromKm)}
                              {s.tier > 1 ? ` (largest km of Tier ${s.tier - 1})` : ""} ={" "}
                              {formatNumber(s.intoKm)} km.
                            </li>
                            <li>
                              3. Tier Salary {money(s.tierSalary)}
                              {s.pct > 0
                                ? ` + ${s.pct}% (${col?.container ?? ""}) = ${money(s.salary)}`
                                : ""}
                              .
                            </li>
                            <li>
                              4. Extra Distance {money(s.extraRate)} × {formatNumber(s.intoKm)} km ={" "}
                              {money(s.extraRate * s.intoKm)}.
                            </li>
                            <li>
                              5. {money(s.salary)} + {money(s.extraRate * s.intoKm)} ={" "}
                              {money(s.raw)}
                              {rule && rule.roundStep > 0
                                ? `, rounded up to a multiple of ${money(rule.roundStep)} = ${money(s.base)}.`
                                : "."}
                            </li>
                          </ol>
                        }
                      />
                      <Cell
                        label="Road Support Fee"
                        value={`${money(s.roadStd)} ₫`}
                        tip={
                          <>
                            {formatNumber(km)} km falls in Tier {s.tier} ({s.tierRange}): its Road
                            Support Fee is {money(s.roadStd)}, paid on top of the Trip Salary.
                          </>
                        }
                      />
                      {rule?.regionOn && (
                        <Cell
                          label="Other Terrain"
                          value={`${money(terrain === "Other" ? rule.regionAmount : 0)} ₫`}
                          tip={
                            terrain === "Other" ? (
                              <>
                                The Terrain is Other: {range.code} adds {money(rule.regionAmount)}{" "}
                                to the Road Support Fee ({money(s.roadStd)} +{" "}
                                {money(rule.regionAmount)} = {money(s.roadStd + rule.regionAmount)}
                                ).
                              </>
                            ) : (
                              <>
                                {range.code} adds {money(rule.regionAmount)} on routes whose Terrain
                                is Other; this trip is Plain, so nothing is added.
                              </>
                            )
                          }
                        />
                      )}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tip,
  strong,
}: {
  label: string;
  value: string;
  tip: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1",
        strong && "border-primary/30 bg-primary/10",
      )}
    >
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 cursor-help" aria-label={`Why ${label} is this amount`} />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-xs leading-5">{tip}</TooltipContent>
        </Tooltip>
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-base font-bold tabular-nums",
          strong && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}
