// Salary Range page (create / view / edit): code, name, its vehicle type (Truck + Truck Type, or Header;
// one Salary Range per vehicle type, a Draft may leave it empty), how the tiers are read (rounding,
// Other terrain surcharge) and the distance tiers — Trip Salary, extra distance rate, Road Support Fee, and for
// a Header a column per container (its own % on the Extra Distance Rate).
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/movex/general/MoneyInput";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  thClass,
  InlineFields,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository, salaryRangeRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  DEFAULT_RULE,
  autoTripSalaries,
  rateFromPct,
  ruleOf,
  tripSalaryOf,
  validateTiers,
  type CalcRule,
  type ContainerColumn,
} from "@/services/cost/salaryRange";
import { parseVehicleKey } from "@/services/cost/cogsVehicle";
import { CC } from "@/mock-data/commonCodes";
import {
  salaryRangeService,
  sanitizeSetupCode,
  type SalaryRangeDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalaryRangeRecord, SalaryTier } from "@/types";

/** Look of a rule setting the user can change (Round up, Other terrain, container %): a light blue field. */
const EDITABLE = "border-primary/40 bg-primary/5 focus-visible:bg-background";
const money = (n: number) => (Number.isFinite(n) ? formatNumber(Math.round(n)) : "—");
const rateIn = (t: SalaryTier, c: string) => t.containerRates?.[c] ?? NaN;
/** A new column's %: reefer containers (ISO type R) +15 %, the others +0 %. */
const defaultPct = (iso: string) => (iso[2] === "R" ? 15 : 0);

export function SalaryRangeForm({
  source,
  readOnly,
}: {
  source: SalaryRangeRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  const types = useVehicleTypes();
  const all = useCollection(salaryRangeRepository);
  const initial = useMemo<SalaryRangeDraft>(
    () => ({
      code: source?.code ?? "",
      name: source?.name ?? "",
      vehicleType: source?.vehicleType ?? "",
      tiers: source
        ? source.tiers.map((t) => ({
            ...t,
            ...(t.containerRates ? { containerRates: { ...t.containerRates } } : {}),
          }))
        : [],
      containers: (source?.containers ?? []).map((c) => ({ ...c })),
      rule: { ...ruleOf(source?.rule ?? DEFAULT_RULE) },
      remark: source?.remark ?? "",
      status: source?.status ?? "Active",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const patch = (p: Partial<SalaryRangeDraft>) => {
    // Every change of the tiers works the Auto Trip Salaries out again.
    const q = p.tiers ? { ...p, tiers: autoTripSalaries(p.tiers) } : p;
    setD((x) => ({ ...x, ...q }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const check = validateTiers(d.tiers);
  const setRule = (p: Partial<CalcRule>) => {
    setD((x) => ({ ...x, rule: { ...x.rule, ...p } }));
    setErrors((e) => ({ ...e, roundStep: "", regionAmount: "" }));
  };
  const ruleOk = d.rule.roundStep >= 0 && (!d.rule.regionOn || d.rule.regionAmount >= 0);

  /** A Header range: its tiers have a column per container (the trucks' do not). */
  const isHeader = parseVehicleKey(d.vehicleType)?.kind === "HEADER";
  const cols = isHeader ? d.containers : [];
  // Container Types of Common Code: ISO group code, its English name and length.
  const codes = useCollection(commonCodeRepository);
  const ctype = codes.find((r) => r.id === CC.CONTAINER_TYPE && !r.deleted);
  const ctypeLabel = (iso: string) => {
    const o = ctype?.options.find((x) => x.name === iso);
    return o ? `${iso} · ${o.values?.["en"] ?? ""} (${o.attribute})` : iso;
  };
  const choices = (ctype?.options ?? []).filter((o) => o.active).map((o) => o.name);
  const freeChoices = choices.filter((c) => !d.containers.some((x) => x.container === c));

  // Try a distance: what the tiers pay for it, step by step (each container column).
  const [tryKm, setTryKm] = useState("260");
  const km = Number(tryKm);
  const canTry = check.ok && ruleOk && tryKm !== "" && km >= 0;
  const tryOf = (container?: ContainerColumn) =>
    canTry
      ? tripSalaryOf(d.tiers, km, undefined, undefined, {
          rule: d.rule,
          container: container && { ...container, pct: container.pct >= 0 ? container.pct : 0 },
        })
      : null;
  const tryBase = tryOf();
  const tryCols = cols.map((c) => ({ c, s: tryOf(c) }));

  /** One Salary Range per vehicle type: the other one this vehicle type has already. */
  const takenBy =
    !readOnly && d.vehicleType && d.status !== "Draft"
      ? all.find(
          (r) =>
            !r.deleted &&
            r.id !== source?.id &&
            r.status !== "Draft" &&
            r.vehicleType === d.vehicleType,
        )
      : undefined;

  // A container column follows the Extra Distance Rate + its %, unless changed by hand on a tier.
  const pctRate = (t: SalaryTier, pct: number) =>
    Number.isFinite(t.extraRate) && pct >= 0 ? rateFromPct(t.extraRate, pct) : NaN;
  /** The tier's rate in this column no longer follows the column's %. */
  const offPct = (t: SalaryTier, c: ContainerColumn) =>
    Number.isFinite(rateIn(t, c.container)) &&
    Number.isFinite(pctRate(t, c.pct)) &&
    rateIn(t, c.container) !== pctRate(t, c.pct);
  const withRate = (t: SalaryTier, container: string, v: number): SalaryTier => ({
    ...t,
    containerRates: { ...t.containerRates, [container]: v },
  });
  const setTier = (i: number, k: keyof SalaryTier, v: string) =>
    patch({
      tiers: d.tiers.map((t, j) => {
        if (j !== i) return t;
        let next: SalaryTier = { ...t, [k]: v === "" ? NaN : Number(v) };
        // A new Extra Distance Rate moves the columns along that followed their %.
        if (k === "extraRate")
          for (const c of cols)
            if (!offPct(t, c)) next = withRate(next, c.container, pctRate(next, c.pct));
        return next;
      }),
    });
  const setCell = (i: number, container: string, v: string) =>
    patch({
      tiers: d.tiers.map((t, j) =>
        j === i ? withRate(t, container, v === "" ? NaN : Number(v)) : t,
      ),
    });
  const setCols = (containers: ContainerColumn[], tiers = d.tiers) => patch({ containers, tiers });
  /** A new %: the tiers that followed the old one follow the new one. */
  const setColPct = (ci: number, v: string) => {
    const c = d.containers[ci]!;
    const pct = v === "" ? NaN : Number(v);
    setCols(
      d.containers.map((x, j) => (j === ci ? { ...x, pct } : x)),
      d.tiers.map((t) =>
        offPct(t, c) || !(pct >= 0) ? t : withRate(t, c.container, pctRate(t, pct)),
      ),
    );
  };
  /** Every tier of the column back to its %. */
  const resetCol = (c: ContainerColumn) =>
    patch({ tiers: d.tiers.map((t) => withRate(t, c.container, pctRate(t, c.pct))) });
  const addCol = () => {
    const container = freeChoices[0];
    if (!container) return;
    const pct = defaultPct(container);
    setCols(
      [...d.containers, { container, pct }],
      d.tiers.map((t) => withRate(t, container, pctRate(t, pct))),
    );
  };
  /** Another container for a column: its rates go with it. */
  const renameCol = (ci: number, container: string) => {
    const old = d.containers[ci]!.container;
    setCols(
      d.containers.map((x, j) => (j === ci ? { ...x, container } : x)),
      d.tiers.map((t) => {
        if (!t.containerRates || !(old in t.containerRates)) return t;
        const { [old]: v, ...rest } = t.containerRates;
        return { ...t, containerRates: { ...rest, [container]: v! } };
      }),
    );
  };
  const removeCol = (ci: number) => {
    const old = d.containers[ci]!.container;
    setCols(
      d.containers.filter((_, j) => j !== ci),
      d.tiers.map((t) => {
        if (!t.containerRates) return t;
        const { [old]: _gone, ...rest } = t.containerRates;
        return { ...t, containerRates: rest };
      }),
    );
  };

  // Auto Trip Salary, per tier or for the whole table (the first tier is always typed).
  const autoable = d.tiers.slice(1);
  const allAuto = autoable.length > 0 && autoable.every((t) => t.auto);
  const someAuto = autoable.some((t) => t.auto);
  const setAuto = (i: number, on: boolean) =>
    patch({ tiers: d.tiers.map((t, j) => (j === i ? { ...t, auto: on } : t)) });
  const setAutoAll = (on: boolean) =>
    patch({ tiers: d.tiers.map((t, j) => (j === 0 ? t : { ...t, auto: on })) });
  /** "= 400.000 + 2.900 × 50 km": how an Auto Trip Salary is worked out. */
  const autoBasis = (i: number) => {
    const p = d.tiers[i - 1];
    if (!p) return "";
    const width = p.to - (i >= 2 ? d.tiers[i - 2]!.to : p.from);
    return `= ${money(p.tripSalary)} + ${money(p.extraRate)} × ${formatNumber(width)} km (Tier ${i})`;
  };
  const addTier = () => {
    const last = d.tiers[d.tiers.length - 1];
    const start = last ? last.to + 1 : 0;
    const extraRate = last?.extraRate ?? 0;
    const containerRates = Object.fromEntries(
      d.containers.map((c) => [c.container, rateFromPct(extraRate, c.pct >= 0 ? c.pct : 0)]),
    );
    patch({
      tiers: [
        ...d.tiers,
        {
          from: start,
          to: start + 99,
          tripSalary: last?.tripSalary ?? 0,
          ...(allAuto ? { auto: true } : {}),
          extraRate,
          ...(d.containers.length ? { containerRates } : {}),
          roadSupportFee: last?.roadSupportFee ?? 0,
        },
      ],
    });
  };
  const back = () =>
    source
      ? void navigate({
          to: "/salary-range/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/variable-cost", search: { tab: "salary" } });
  const save = () => {
    setFormError(null);
    try {
      const rec = salaryRangeService.save(d, source?.id);
      guard.allowNext();
      toast.success(`${rec.code} ${isNew ? "added" : "saved"}`);
      void navigate({ to: "/salary-range/$id", params: { id: rec.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const text = (v: ReactNode) => <div className="flex h-9 items-center text-sm">{v || "—"}</div>;
  const colCount = 6 + cols.length + (readOnly ? 0 : 1);

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Variable Cost", to: "/variable-cost" },
          { label: "Salary Range" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Add Salary Range"
            : readOnly
              ? `${source.code} · ${source.name}`
              : `Edit: ${source.code}`
        }
        subtitle={source ? source.vehicleType || "No vehicle type yet" : undefined}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() =>
          readOnly || isNew
            ? void navigate({ to: "/variable-cost", search: { tab: "salary" } })
            : back()
        }
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              {!readOnly && (
                <NativeSelect
                  value={d.status}
                  onChange={(v) => patch({ status: v as SalaryRangeDraft["status"] })}
                  options={["Draft", "Active", "Inactive"]}
                  className="h-11"
                />
              )}
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
              {readOnly && (
                <Button asChild size="lg">
                  <Link to="/salary-range/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />
      {source?.status === "Draft" && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-info-soft px-3 py-2 text-sm text-primary">
          <Info className="h-4 w-4 shrink-0" />
          Draft: not used by Variable Cost Mapping or COGS. Pick its Vehicle Type and set it Active
          to use it.
        </div>
      )}

      <div className="space-y-4">
        <Panel title="General Information">
          <InlineFields labelWidth="10rem">
            <div className="grid grid-cols-1 justify-start gap-x-12 gap-y-3 sm:grid-cols-[26rem_28rem]">
              <Field
                label="Salary Range Code"
                required
                error={errors["code"]}
                hint={readOnly ? undefined : `${d.code.length}/20`}
                info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters)."
              >
                {readOnly ? (
                  text(<b>{d.code}</b>)
                ) : (
                  <Input
                    value={d.code}
                    maxLength={20}
                    placeholder="Enter Code"
                    onChange={(e) => patch({ code: sanitizeSetupCode(e.target.value) })}
                    aria-invalid={!!errors["code"] || undefined}
                  />
                )}
              </Field>
              <Field label="Salary Range Name" required error={errors["name"]}>
                {readOnly ? (
                  text(d.name)
                ) : (
                  <Input
                    value={d.name}
                    maxLength={200}
                    placeholder="Enter Name"
                    onChange={(e) => patch({ name: e.target.value })}
                    aria-invalid={!!errors["name"] || undefined}
                  />
                )}
              </Field>
              <Field
                label="Vehicle Type"
                required={d.status !== "Draft"}
                error={errors["vehicleType"]}
                info="From Master Data › Vehicle: Truck → Truck Type, or Header (every container; add a column per container in the Tiers). One Salary Range per vehicle type; a Draft can leave it empty."
              >
                {readOnly ? (
                  text(
                    d.vehicleType || <span className="text-muted-foreground">Not picked yet</span>,
                  )
                ) : (
                  <div className="space-y-1">
                    <VehicleTypePicker
                      salary
                      value={d.vehicleType}
                      onChange={(key) => patch({ vehicleType: key })}
                      types={types}
                      invalid={!!errors["vehicleType"] || !!takenBy}
                    />
                    {takenBy && (
                      <p className="text-xs text-destructive">
                        {d.vehicleType} already has a Salary Range: {takenBy.code}.
                      </p>
                    )}
                  </div>
                )}
              </Field>
              <Field
                label="Round Up To (đ)"
                error={errors["roundStep"]}
                info="The Trip Salary is rounded up to a multiple of this amount. 0 = no rounding."
              >
                {readOnly ? (
                  text(d.rule.roundStep ? money(d.rule.roundStep) : "No rounding")
                ) : (
                  <MoneyInput
                    value={d.rule.roundStep}
                    onChange={(roundStep) => setRule({ roundStep })}
                    className={EDITABLE}
                    aria-label="Round up to (đ)"
                    aria-invalid={!!errors["roundStep"] || undefined}
                  />
                )}
              </Field>
              <Field
                label="Other Terrain (đ)"
                error={errors["regionAmount"]}
                info="Added to the Road Support Fee when the route's Terrain is Other (Route Management). Plain routes are not charged. Untick: no surcharge."
              >
                {readOnly ? (
                  text(d.rule.regionOn ? `+ ${money(d.rule.regionAmount)}` : "No surcharge")
                ) : (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={d.rule.regionOn}
                      onCheckedChange={(v) => setRule({ regionOn: v === true })}
                      aria-label="Other terrain surcharge"
                    />
                    <MoneyInput
                      disabled={!d.rule.regionOn}
                      value={d.rule.regionAmount}
                      onChange={(regionAmount) => setRule({ regionAmount })}
                      className={cn(EDITABLE, "min-w-0 flex-1")}
                      aria-label="Other terrain surcharge (đ)"
                      aria-invalid={!!errors["regionAmount"] || undefined}
                    />
                  </div>
                )}
              </Field>
            </div>
          </InlineFields>
        </Panel>

        <Panel
          title="Tiers"
          actions={
            !readOnly ? (
              <div className="flex items-center gap-2">
                {isHeader && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={addCol}
                    disabled={freeChoices.length === 0}
                    title={
                      freeChoices.length
                        ? "A column with its own Extra Distance Rate for one container"
                        : "Every container has a column"
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Container
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-9" onClick={addTier}>
                  <Plus className="h-4 w-4" />
                  Add Tier
                </Button>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                {d.tiers.length} tiers · 0 – {formatNumber(d.tiers[d.tiers.length - 1]?.to ?? 0)} km
              </span>
            )
          }
        >
          <div className="mb-3 overflow-hidden rounded-md border">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-primary/5 px-3 py-2 text-sm">
              <label className="flex items-center gap-2">
                <span className="font-medium">Try a distance</span>
                <Input
                  inputMode="numeric"
                  value={tryKm}
                  onChange={(e) => setTryKm(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  className={cn(EDITABLE, "h-8 w-20 text-right tabular-nums")}
                  aria-label="Distance to try (km)"
                />
                <span className="text-muted-foreground">km</span>
              </label>
              {tryBase && (
                <span className="text-xs text-muted-foreground">
                  ① Falls in{" "}
                  <b className="text-foreground">
                    Tier {tryBase.tier} ({tryBase.tierRange})
                  </b>{" "}
                  · ② Extra km counted from {formatNumber(tryBase.fromKm)} km
                  {tryBase.tier > 1 ? ` (the largest km of Tier ${tryBase.tier - 1})` : ""}:{" "}
                  {formatNumber(km)} − {formatNumber(tryBase.fromKm)} ={" "}
                  <b className="text-foreground">{formatNumber(tryBase.intoKm)} km</b>
                </span>
              )}
            </div>
            {canTry && !tryBase && (
              <div className="border-t px-3 py-1.5 text-xs text-warning">
                {formatNumber(km)} km is past the last tier.
              </div>
            )}
            {!canTry && (
              <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                Fix the tiers and the rule above to try a distance.
              </div>
            )}
            {tryBase && (
              <>
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Vehicle Type</th>
                      <th className="px-3 py-1.5 text-right font-medium">③ Tier Salary</th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        ④ Extra Distance Rate × extra km
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">③ + ④</th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        ⑤ Trip Salary
                        {d.rule.roundStep > 0 && ` (rounded up to ${money(d.rule.roundStep)})`}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        key: "",
                        label: !isHeader
                          ? d.vehicleType || "This vehicle type"
                          : cols.length
                            ? "HEADER · other containers"
                            : "HEADER · every container",
                        s: tryBase,
                      },
                      ...tryCols.map(({ c, s }) => ({
                        key: c.container,
                        label: `HEADER · ${ctypeLabel(c.container)}`,
                        s,
                      })),
                    ].map(
                      ({ key, label, s }) =>
                        s && (
                          <tr key={key} className="border-t">
                            <td className="px-3 py-1.5">{label}</td>
                            <td className="px-3 py-1.5 text-right">
                              {money(s.tierSalary)}
                              {s.pct > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  + {s.pct}% = {money(s.salary)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className="text-muted-foreground">
                                {money(s.extraRate)} × {formatNumber(s.intoKm)} ={" "}
                              </span>
                              {money(s.extraRate * s.intoKm)}
                            </td>
                            <td className="px-3 py-1.5 text-right">{money(s.raw)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-primary">
                              {money(s.base)}
                            </td>
                          </tr>
                        ),
                    )}
                  </tbody>
                </table>
                <div className="border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                  Road Support Fee of Tier {tryBase.tier}:{" "}
                  <b className="text-foreground tabular-nums">{money(tryBase.roadStd)}</b>, paid on
                  top of the Trip Salary.
                </div>
              </>
            )}
          </div>
          {isHeader && (
            <p className="mb-2 text-xs text-muted-foreground">
              {cols.length
                ? "Columns are Container Types (Common Code, ISO). A container without a column is paid the Trip Salary and Extra Distance Rate as they are."
                : "Every container is paid the Trip Salary and Extra Distance Rate as they are. Add a column (Add Container) for a Container Type paid more, e.g. 42RT reefer."}
            </p>
          )}
          {!readOnly && (
            <div
              className={cn(
                "mb-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
                check.ok
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {check.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <b>{check.ok ? "Valid." : "Invalid."}</b> {errors["tiers"] ?? check.message}
            </div>
          )}
          {errors["containers"] && (
            <p className="mb-2 text-xs text-destructive">{errors["containers"]}</p>
          )}
          <div className="overflow-auto rounded-lg border">
            <Table className="w-auto [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thClass, "w-20")}>Tier</TableHead>
                  <TableHead className={thClass}>Distance (km)</TableHead>
                  <TableHead className={cn(thClass, "w-28")}>
                    <label
                      className="flex cursor-pointer items-center gap-1 whitespace-nowrap"
                      title="Work every Trip Salary out from the tier before: its Trip Salary + its Extra Distance Rate × its width (km)."
                    >
                      <Switch
                        checked={allAuto}
                        disabled={readOnly || autoable.length === 0}
                        onCheckedChange={(v) => setAutoAll(v)}
                        aria-label="Auto Trip Salary for every tier"
                        className="-ml-1.5 scale-75"
                      />
                      <span className={cn(someAuto && !allAuto && "text-warning")}>
                        {someAuto && !allAuto ? "Auto (some)" : "Auto all"}
                      </span>
                    </label>
                  </TableHead>
                  <TableHead className={thClass}>Trip Salary</TableHead>
                  <TableHead className={thClass}>Extra Distance Rate (đ/km)</TableHead>
                  {cols.map((c, ci) => {
                    const off = d.tiers.filter((t) => offPct(t, c)).length;
                    return (
                      <TableHead key={ci} className={cn(thClass, "align-top")}>
                        <div className="space-y-1 whitespace-nowrap normal-case">
                          <div className="flex h-7 items-center gap-1.5 font-normal">
                            {readOnly ? (
                              <span className="text-xs font-semibold text-foreground">
                                {ctypeLabel(c.container)}
                              </span>
                            ) : (
                              <NativeSelect
                                value={c.container}
                                onChange={(v) => renameCol(ci, v)}
                                options={[c.container, ...freeChoices]}
                                labels={Object.fromEntries(
                                  [c.container, ...freeChoices].map((x) => [x, ctypeLabel(x)]),
                                )}
                                className="h-7 w-auto text-xs font-semibold"
                              />
                            )}
                            <span className="text-muted-foreground">+</span>
                            {readOnly ? (
                              <b className="text-foreground">{c.pct}</b>
                            ) : (
                              <Input
                                inputMode="decimal"
                                value={Number.isFinite(c.pct) ? String(c.pct) : ""}
                                onChange={(e) =>
                                  setColPct(ci, e.target.value.replace(/[^\d.]/g, ""))
                                }
                                className={cn(EDITABLE, "h-7 w-14 text-right")}
                                aria-label={`${c.container} %`}
                              />
                            )}
                            <span className="text-muted-foreground">%</span>
                            {!readOnly && (
                              <button
                                type="button"
                                aria-label={`Remove the ${c.container} column`}
                                title="Remove column"
                                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeCol(ci)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {off > 0 && (
                            <div className="flex flex-wrap items-center gap-1 text-[11px] font-normal text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              {off} not +{c.pct}%
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => resetCol(c)}
                                  className="ml-1 text-primary hover:underline"
                                >
                                  Reset all
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                  <TableHead className={thClass}>Road Support Fee</TableHead>
                  {!readOnly && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.tiers.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={colCount}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No tier yet — add one with “Add Tier”.
                    </TableCell>
                  </TableRow>
                )}
                {d.tiers.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap py-1.5 text-sm">Tier {i + 1}</TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1">
                        <NumInput
                          value={t.from}
                          onChange={(v) => setTier(i, "from", v)}
                          plain={readOnly}
                          className="w-16 min-w-0"
                        />
                        <span className="text-muted-foreground">–</span>
                        <NumInput
                          value={t.to}
                          onChange={(v) => setTier(i, "to", v)}
                          plain={readOnly}
                          className="w-16 min-w-0"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {i > 0 ? (
                        <Switch
                          checked={!!t.auto}
                          disabled={readOnly}
                          onCheckedChange={(v) => setAuto(i, v)}
                          aria-label={`Auto Trip Salary, tier ${i + 1}`}
                          title={t.auto ? "Auto: worked out from the tier before" : "Typed by hand"}
                          className="-ml-1.5 scale-75"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <NumInput
                        value={t.tripSalary}
                        onChange={(v) => setTier(i, "tripSalary", v)}
                        readOnly={!!t.auto && i > 0}
                        plain={readOnly}
                        title={t.auto && i > 0 ? autoBasis(i) : undefined}
                        className={
                          t.auto && i > 0 && !readOnly
                            ? "bg-muted text-muted-foreground"
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <NumInput
                        value={t.extraRate}
                        onChange={(v) => setTier(i, "extraRate", v)}
                        plain={readOnly}
                      />
                    </TableCell>
                    {cols.map((c) => (
                      <TableCell key={c.container} className="py-1.5">
                        {/* As wide as the column header (container + %). */}
                        <div className="flex w-full items-center gap-1">
                          <NumInput
                            value={rateIn(t, c.container)}
                            onChange={(v) => setCell(i, c.container, v)}
                            plain={readOnly}
                            title={
                              offPct(t, c)
                                ? `Changed by hand · +${c.pct}% would be ${money(pctRate(t, c.pct))}`
                                : undefined
                            }
                            className={cn(
                              "w-auto min-w-0 flex-1",
                              offPct(t, c) && "border-warning bg-warning/10 text-warning",
                            )}
                          />
                          {offPct(t, c) && !readOnly && (
                            <button
                              type="button"
                              title={`Back to +${c.pct}% (${money(pctRate(t, c.pct))})`}
                              aria-label={`Reset tier ${i + 1} ${c.container}`}
                              className="rounded p-1 text-warning hover:bg-warning/10"
                              onClick={() => setCell(i, c.container, String(pctRate(t, c.pct)))}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="py-1.5">
                      <NumInput
                        value={t.roadSupportFee}
                        onChange={(v) => setTier(i, "roadSupportFee", v)}
                        plain={readOnly}
                      />
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="py-1.5">
                        <button
                          type="button"
                          aria-label={`Remove tier ${i + 1}`}
                          className="text-destructive hover:opacity-70"
                          onClick={() => patch({ tiers: d.tiers.filter((_, j) => j !== i) })}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel title="Remark">
          {readOnly ? (
            <p className="text-sm">
              {d.remark || <span className="text-muted-foreground">—</span>}
            </p>
          ) : (
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="Enter Remark"
              value={d.remark}
              onChange={(e) => patch({ remark: e.target.value })}
            />
          )}
        </Panel>
      </div>

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Salary Range"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  className,
  readOnly,
  title,
  plain,
}: {
  value: number;
  onChange: (v: string) => void;
  className?: string | undefined;
  readOnly?: boolean;
  title?: string | undefined;
  /** View: the same box, read-only, without its border. */
  plain?: boolean;
}) {
  return (
    <MoneyInput
      value={value}
      onChange={(n) => onChange(Number.isFinite(n) ? String(n) : "")}
      placeholder=""
      readOnly={readOnly || plain}
      title={title}
      tabIndex={readOnly || plain ? -1 : undefined}
      className={cn(
        "h-8 w-[6.5rem] px-2.5 text-left",
        className,
        plain && "cursor-default border-transparent bg-transparent shadow-none",
      )}
    />
  );
}
