// Variable Cost › Reference Trip Salary: pick a vehicle type (Truck → Truck Type, or Header → the
// container it pulls), a terrain and a distance. Line 1: the trip and its Salary Range; line 2: what it is
// paid — Trip Salary, Road Support Fee, Other Terrain surcharge and their Total Fee, each worked out in
// its tooltip.
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink } from "lucide-react";
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
import { curNow, moneyNow, useDisplayCurrency } from "@/lib/displayCurrency";
import { cn } from "@/lib/utils";

/** An amount kept in VND, in the currency picked (the tab re-renders when it changes). */
const money = (n: number) => moneyNow(n);
/** No container column picked: the tier's own Trip Salary and Extra Distance Rate. */
const OTHER = "";
/** A worked-out value shown like the other fields, not editable. */
const resultClass = "bg-muted/40 tabular-nums";

export function ReferenceTripTab() {
  useDisplayCurrency(); // re-render when the currency picked changes
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
  /** Other terrain surcharge of this trip (0 on Plain, or when the Salary Range has none). */
  const otherTerrain = rule?.regionOn && terrain === "Other" ? rule.regionAmount : 0;
  const total = s ? s.base + s.roadStd + otherTerrain : NaN;

  /** Why the Trip Salary is this amount: its tier and the steps. */
  const tripTip = s ? (
    <ol className="space-y-0.5 text-xs leading-5">
      <li>
        1. {formatNumber(km)} km falls in Tier {s.tier} ({s.tierRange}).
      </li>
      <li>
        2. Extra km = {formatNumber(km)} − {formatNumber(s.fromKm)}
        {s.tier > 1 ? ` (largest km of Tier ${s.tier - 1})` : ""} = {formatNumber(s.intoKm)} km.
      </li>
      <li>
        3. Base Trip Salary {money(s.tierSalary)}
        {s.pct > 0 ? ` + ${s.pct}% (${col?.container ?? ""}) = ${money(s.salary)}` : ""}.
      </li>
      <li>
        4. Price ({curNow()})/km {money(s.extraRate)} × {formatNumber(s.intoKm)} km ={" "}
        {money(s.extraRate * s.intoKm)}.
      </li>
      <li>
        5. {money(s.salary)} + {money(s.extraRate * s.intoKm)} = {money(s.raw)}
        {rule && rule.roundStep > 0
          ? `, rounded up to a multiple of ${money(rule.roundStep)} = ${money(s.base)}.`
          : "."}
      </li>
    </ol>
  ) : (
    "From the tiers of the Salary Range, by the distance."
  );
  const roadTip = s
    ? `${formatNumber(km)} km falls in Tier ${s.tier} (${s.tierRange}): its Road Support Fee, paid on top of the Trip Salary.`
    : "The Road Support Fee of the tier the distance falls in.";
  const terrainTip =
    range && rule?.regionOn
      ? terrain === "Other"
        ? `The Terrain is Other: ${range.code} adds ${money(rule.regionAmount)}.`
        : `${range.code} adds ${money(rule.regionAmount)} only when the Terrain is Other; this trip is Plain.`
      : range
        ? `${range.code} has no Other terrain surcharge.`
        : "Added by the Salary Range when the Terrain is Other.";
  const totalTip = s
    ? `Trip Salary ${money(s.base)} + Road Support Fee ${money(s.roadStd)} + Other Terrain ${money(otherTerrain)} = ${money(total)} ${curNow()}`
    : "Trip Salary + Road Support Fee + Other Terrain.";
  /** Why there is no amount: no Salary Range, or the distance is past its last tier. */
  const problem = !picked
    ? undefined
    : !range
      ? `No active Salary Range for ${vehicle}.`
      : !s
        ? Number.isFinite(km)
          ? `${formatNumber(km)} km is past the last tier of ${range.code} (${formatNumber(range.tiers[range.tiers.length - 1]?.to ?? 0)} km).`
          : "Enter a distance."
        : undefined;
  const openLink = "rounded p-1.5 text-primary hover:bg-accent";

  return (
    <div>
      <PageHeader crumbs={[{ label: "Variable Cost" }]} title="Variable Cost" />
      <VariableCostTabs active="reference" />

      <Panel title="Reference Trip Salary" accent>
        <InlineFields labelWidth="auto">
          {/* Line 1: the trip and its Salary Range. */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
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
                hideCount
                className="w-56 flex-nowrap"
              />
            </Field>
            {isHeader && (
              <Field
                label="Container"
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
                    [OTHER]: "Other (no column)",
                    ...Object.fromEntries(
                      (ctype?.options ?? []).map((o) => {
                        const c = range?.containers.find((x) => x.container === o.name);
                        return [o.name, `${ctypeLabel(o.name)}${c ? ` · +${c.pct}%` : ""}`];
                      }),
                    ),
                  }}
                  className="h-10 w-52"
                />
              </Field>
            )}
            <Field
              label="Terrain"
              info="Route Management › Terrain. Other: the Salary Range's Other terrain surcharge is added."
            >
              <NativeSelect
                value={terrain}
                onChange={(v) => setTerrain(v as Terrain)}
                options={terrains}
                className="h-10 w-24"
              />
            </Field>
            <Field label="Distance (km)" required>
              <Input
                inputMode="numeric"
                value={kmText}
                onChange={(e) => setKmText(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                className="w-20 text-right tabular-nums"
                aria-label="Distance (km)"
              />
            </Field>
            <Field
              label="Salary Range"
              info={
                range
                  ? `${range.code} · ${range.name}: the active Salary Range of the vehicle type (Variable Cost › Salary Range).`
                  : "The active Salary Range of the vehicle type (Variable Cost › Salary Range)."
              }
            >
              <div className="flex items-center gap-1">
                <Input
                  readOnly
                  tabIndex={-1}
                  value={range?.code ?? ""}
                  placeholder="—"
                  title={range ? `${range.code} · ${range.name}` : undefined}
                  className={cn(resultClass, "w-28")}
                  aria-label="Salary Range"
                />
                {range ? (
                  <Link
                    to="/salary-range/$id"
                    params={{ id: range.id }}
                    search={{ mode: "view" }}
                    title={`Open ${range.code}`}
                    aria-label={`Open ${range.code}`}
                    className={openLink}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : picked ? (
                  <Link
                    to="/variable-cost"
                    search={{ tab: "salary" }}
                    title="Open Salary Range"
                    aria-label="Open Salary Range"
                    className={openLink}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </Field>
          </div>

          {/* Line 2: what the trip is paid. */}
          <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
            <Amount label="Trip Salary" value={s?.base} tip={tripTip} />
            <Amount label="Road Support Fee" value={s?.roadStd} tip={roadTip} />
            <Amount label="Other Terrain" value={s ? otherTerrain : undefined} tip={terrainTip} />
            <Amount label="Total Fee" value={s ? total : undefined} tip={totalTip} strong />
          </div>
          {problem && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {problem}
            </p>
          )}
        </InlineFields>
      </Panel>
    </div>
  );
}

/** A worked-out amount, read-only like a field; how it is worked out is in the (i) tooltip. */
function Amount({
  label,
  value,
  tip,
  strong,
}: {
  label: string;
  value: number | undefined;
  tip: ReactNode;
  strong?: boolean;
}) {
  return (
    <Field label={label} info={tip}>
      <div className="relative">
        <Input
          readOnly
          tabIndex={-1}
          value={value === undefined ? "" : money(value)}
          placeholder="—"
          className={cn(
            resultClass,
            // Room on the right for the currency (VND / USD) so it never sits on the figure.
            "w-40 pr-12 text-right",
            strong && "w-44 border-primary/40 font-semibold text-primary",
          )}
          aria-label={label}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {curNow()}
        </span>
      </div>
    </Field>
  );
}
