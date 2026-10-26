// Salary Range page (create / view / edit): code, name, the vehicle types it applies to (each vehicle
// type is in one Salary Range only), how the tiers are read (rounding, Highland surcharge) and the
// distance tiers — Trip Salary, extra distance rate, Road Support Fee.
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, NativeSelect, Panel, StatusBadge, thClass } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  DEFAULT_RULE,
  reeferFromPct,
  ruleOf,
  tripSalaryOf,
  validateTiers,
  type CalcRule,
} from "@/services/cost/salaryRange";
import {
  salaryRangeService,
  sanitizeSetupCode,
  type SalaryRangeDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalaryRangeRecord, SalaryTier } from "@/types";

/** Look of a rule setting the user can change (Round up, Highland, Reefer %): a light blue field. */
const EDITABLE = "border-primary/40 bg-primary/5 focus-visible:bg-background";
const money = (n: number) => (Number.isFinite(n) ? formatNumber(Math.round(n)) : "—");

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
      vehicleTypes: source ? [...source.vehicleTypes] : [""],
      tiers: source ? source.tiers.map((t) => ({ ...t })) : [],
      reeferPct: source?.reeferPct ?? 15,
      rule: { ...ruleOf(source?.rule ?? DEFAULT_RULE) },
      remark: source?.remark ?? "",
      status: source?.status === "Inactive" ? "Inactive" : "Active",
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
    setD((x) => ({ ...x, ...p }));
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
  const ruleNum = (v: number) => (Number.isFinite(v) ? String(v) : "");
  const toNum = (v: string) => (v === "" ? NaN : Number(v.replace(/[^\d]/g, "")));
  // Example under this rule: 60 km on the tiers.
  const ruleOk = d.rule.roundStep >= 0 && (!d.rule.regionOn || d.rule.regionAmount >= 0);
  const example =
    check.ok && ruleOk ? tripSalaryOf(d.tiers, 60, undefined, undefined, { rule: d.rule }) : null;
  const others = all.filter((r) => !r.deleted && r.id !== source?.id);
  /** Each vehicle type is in one Salary Range: the other one a vehicle type is in already. */
  const takenBy = (key: string) =>
    !readOnly && key ? others.find((r) => r.vehicleTypes.includes(key)) : undefined;
  /** Vehicle type rows: "" = a row still to pick. */
  const setVehicle = (i: number, key: string) =>
    patch({ vehicleTypes: d.vehicleTypes.map((k, j) => (j === i ? key : k)) });
  const rowError = (key: string, i: number) => {
    if (!key || !key.split(" · ")[1]) return undefined;
    if (d.vehicleTypes.indexOf(key) !== i) return `${key} is listed twice.`;
    const t = takenBy(key);
    return t ? `${key} already has a Salary Range: ${t.code}.` : undefined;
  };

  // CNTR lạnh follows the Extra Distance Rate + %, unless changed by hand on a tier.
  const pctRate = (t: SalaryTier, pct = d.reeferPct) =>
    Number.isFinite(t.extraRate) && pct >= 0 ? reeferFromPct(t.extraRate, pct) : NaN;
  /** The tier's CNTR lạnh no longer follows the %. */
  const offPct = (t: SalaryTier) =>
    Number.isFinite(t.reeferRate) && Number.isFinite(pctRate(t)) && t.reeferRate !== pctRate(t);
  const offCount = d.tiers.filter(offPct).length;
  const setTier = (i: number, k: keyof SalaryTier, v: string) =>
    patch({
      tiers: d.tiers.map((t, j) => {
        if (j !== i) return t;
        const next = { ...t, [k]: v === "" ? NaN : Number(v) };
        // A new Extra Distance Rate moves CNTR lạnh along when it followed the %.
        if (k === "extraRate" && !offPct(t)) next.reeferRate = pctRate(next);
        return next;
      }),
    });
  /** A new %: the tiers that followed the old one follow the new one. */
  const setReeferPct = (v: string) => {
    const pct = v === "" ? NaN : Number(v);
    patch({
      reeferPct: pct,
      tiers: d.tiers.map((t) =>
        offPct(t) || !(pct >= 0) ? t : { ...t, reeferRate: pctRate(t, pct) },
      ),
    });
  };
  /** Every tier back to the %. */
  const applyPctToAll = () =>
    patch({ tiers: d.tiers.map((t) => ({ ...t, reeferRate: pctRate(t) })) });
  const addTier = () => {
    const last = d.tiers[d.tiers.length - 1];
    const start = last ? last.to + 1 : 0;
    patch({
      tiers: [
        ...d.tiers,
        {
          from: start,
          to: start + 99,
          tripSalary: last?.tripSalary ?? 0,
          extraRate: last?.extraRate ?? 0,
          reeferRate: reeferFromPct(last?.extraRate ?? 0, d.reeferPct >= 0 ? d.reeferPct : 0),
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
        subtitle={source ? source.vehicleTypes.join(" · ") : undefined}
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
                  options={["Active", "Inactive"]}
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

      <div className="space-y-4">
        <Panel title="General Information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <Field
              label="Salary Range Code"
              required
              error={errors["code"]}
              className="sm:col-span-4"
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
            <Field
              label="Salary Range Name"
              required
              error={errors["name"]}
              className="sm:col-span-8"
            >
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
              label="Vehicle Types"
              required
              error={errors["vehicleTypes"]}
              className="sm:col-span-12"
              info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer), then Brand. A Salary Range can apply to several vehicle types; each vehicle type is in one Salary Range only."
            >
              {readOnly ? (
                <div className="flex flex-wrap gap-1.5 py-1.5">
                  {d.vehicleTypes.map((k) => (
                    <span key={k} className="rounded-md bg-muted px-2 py-0.5 text-sm">
                      {k}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {d.vehicleTypes.map((k, i) => {
                    const err = rowError(k, i);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <VehicleTypePicker
                          value={k}
                          onChange={(key) => setVehicle(i, key)}
                          types={types}
                          invalid={!!err}
                        />
                        <button
                          type="button"
                          aria-label={`Remove vehicle type ${i + 1}`}
                          title="Remove"
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            patch({ vehicleTypes: d.vehicleTypes.filter((_, j) => j !== i) })
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                        {err && <span className="w-full text-xs text-destructive">{err}</span>}
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ vehicleTypes: [...d.vehicleTypes, ""] })}
                  >
                    <Plus className="h-4 w-4" />
                    Add Vehicle Type
                  </Button>
                </div>
              )}
            </Field>
          </div>
        </Panel>

        <Panel
          title="Tiers"
          actions={
            !readOnly ? (
              <Button variant="outline" size="sm" className="h-9" onClick={addTier}>
                <Plus className="h-4 w-4" />
                Add Tier
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">
                {d.tiers.length} tiers · 0 – {formatNumber(d.tiers[d.tiers.length - 1]?.to ?? 0)} km
              </span>
            )
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-card px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <span>Round up Trip Salary to</span>
              {readOnly ? (
                <b className="tabular-nums">
                  {d.rule.roundStep ? `${money(d.rule.roundStep)} đ` : "no rounding"}
                </b>
              ) : (
                <>
                  <Input
                    inputMode="numeric"
                    value={ruleNum(d.rule.roundStep)}
                    onChange={(e) => setRule({ roundStep: toNum(e.target.value) })}
                    className={cn(EDITABLE, "h-8 w-28 text-right tabular-nums")}
                    aria-label="Round up to (đ)"
                    aria-invalid={!!errors["roundStep"] || undefined}
                  />
                  <span className="text-muted-foreground">đ</span>
                </>
              )}
              <Tip text="Trip salary = tier salary + extra rate × (standard km − tier start), then rounded up to a multiple of this amount. 0 = no rounding." />
            </span>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <span className="flex items-center gap-2">
              {readOnly ? (
                <span className="text-muted-foreground">
                  Highland routes (Tây Nguyên):{" "}
                  <b className="text-foreground">
                    {d.rule.regionOn
                      ? `Road Support Fee + ${money(d.rule.regionAmount)} đ`
                      : "no surcharge"}
                  </b>
                </span>
              ) : (
                <>
                  <Checkbox
                    checked={d.rule.regionOn}
                    onCheckedChange={(v) => setRule({ regionOn: v === true })}
                    aria-label="Highland surcharge"
                  />
                  <span className="text-muted-foreground">
                    Highland routes (Tây Nguyên): Road Support Fee +
                  </span>
                  <Input
                    inputMode="numeric"
                    disabled={!d.rule.regionOn}
                    value={ruleNum(d.rule.regionAmount)}
                    onChange={(e) => setRule({ regionAmount: toNum(e.target.value) })}
                    className={cn(EDITABLE, "h-8 w-28 text-right tabular-nums")}
                    aria-label="Highland surcharge (đ)"
                    aria-invalid={!!errors["regionAmount"] || undefined}
                  />
                  <span className="text-muted-foreground">đ</span>
                </>
              )}
              <Tip text="Added to the Road Support Fee when the route's Terrain is Highland (Route Management). Plain routes are not charged." />
            </span>
            {example && (
              <span className="text-xs text-muted-foreground tabular-nums sm:ml-auto">
                e.g. 60 km: {money(example.raw)} → {money(example.base)}
                {d.rule.regionOn &&
                  ` · Highland ${money(example.roadStd)} → ${money(example.roadStd + d.rule.regionAmount)}`}
              </span>
            )}
            {(errors["roundStep"] || errors["regionAmount"]) && (
              <span className="w-full text-xs text-destructive">
                {errors["roundStep"] ?? errors["regionAmount"]}
              </span>
            )}
          </div>
          {!readOnly && (
            <>
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
            </>
          )}
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thClass, "w-20")}>Tier</TableHead>
                  <TableHead className={cn(thClass, "w-56")}>Distance (km)</TableHead>
                  <TableHead className={cn(thClass, readOnly && "text-right")}>
                    Trip Salary
                  </TableHead>
                  <TableHead className={cn(thClass, readOnly && "text-right")}>
                    Extra Distance Rate (đ/km)
                  </TableHead>
                  <TableHead className={cn(thClass, "align-top", readOnly && "text-right")}>
                    <div
                      className="flex items-center gap-1.5 whitespace-nowrap"
                      style={readOnly ? { justifyContent: "flex-end" } : undefined}
                    >
                      Reefer Extra Rate
                      <span className="font-normal normal-case text-muted-foreground">+</span>
                      {readOnly ? (
                        <b className="normal-case text-foreground">{d.reeferPct}</b>
                      ) : (
                        <Input
                          inputMode="decimal"
                          value={Number.isFinite(d.reeferPct) ? String(d.reeferPct) : ""}
                          onChange={(e) => setReeferPct(e.target.value.replace(/[^\d.]/g, ""))}
                          className={cn(EDITABLE, "h-7 w-14 text-right")}
                          aria-label="Reefer Extra Rate %"
                          aria-invalid={!!errors["reeferPct"] || undefined}
                        />
                      )}
                      <span className="font-normal normal-case text-muted-foreground">%</span>
                    </div>
                    {offCount > 0 && (
                      <div
                        className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] font-normal normal-case text-warning"
                        style={readOnly ? { justifyContent: "flex-end" } : undefined}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {offCount} not +{d.reeferPct}%
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={applyPctToAll}
                            className="ml-1 text-primary hover:underline"
                          >
                            Reset all
                          </button>
                        )}
                      </div>
                    )}
                  </TableHead>
                  <TableHead className={cn(thClass, readOnly && "text-right")}>
                    Road Support Fee
                  </TableHead>
                  {!readOnly && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.tiers.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No tier yet — add one with “Add Tier”.
                    </TableCell>
                  </TableRow>
                )}
                {d.tiers.map((t, i) =>
                  readOnly ? (
                    <TableRow key={i}>
                      <TableCell className="py-2 text-sm">Tier {i + 1}</TableCell>
                      <TableCell className="py-2 tabular-nums">
                        {formatNumber(t.from)} – {formatNumber(t.to)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {money(t.tripSalary)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {money(t.extraRate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2 text-right tabular-nums",
                          offPct(t) && "bg-warning/10 text-warning",
                        )}
                        title={
                          offPct(t)
                            ? `Changed by hand · +${d.reeferPct}% would be ${money(pctRate(t))}`
                            : undefined
                        }
                      >
                        {money(t.reeferRate ?? NaN)}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        {money(t.roadSupportFee)}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={i}>
                      <TableCell className="py-1.5 text-sm">Tier {i + 1}</TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-1">
                          <NumInput
                            value={t.from}
                            onChange={(v) => setTier(i, "from", v)}
                            className="w-20"
                          />
                          <span className="text-muted-foreground">–</span>
                          <NumInput
                            value={t.to}
                            onChange={(v) => setTier(i, "to", v)}
                            className="w-20"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <NumInput
                          value={t.tripSalary}
                          onChange={(v) => setTier(i, "tripSalary", v)}
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <NumInput
                          value={t.extraRate}
                          onChange={(v) => setTier(i, "extraRate", v)}
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-1">
                          <NumInput
                            value={t.reeferRate ?? NaN}
                            onChange={(v) => setTier(i, "reeferRate", v)}
                            className={
                              offPct(t) ? "border-warning bg-warning/10 text-warning" : undefined
                            }
                          />
                          {offPct(t) && (
                            <button
                              type="button"
                              title={`Back to +${d.reeferPct}% (${money(pctRate(t))})`}
                              aria-label={`Reset tier ${i + 1} Reefer Extra Rate`}
                              className="rounded p-1 text-warning hover:bg-warning/10"
                              onClick={() => setTier(i, "reeferRate", String(pctRate(t)))}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <NumInput
                          value={t.roadSupportFee}
                          onChange={(v) => setTier(i, "roadSupportFee", v)}
                        />
                      </TableCell>
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
                    </TableRow>
                  ),
                )}
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

function Tip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function NumInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: string) => void;
  className?: string | undefined;
}) {
  return (
    <Input
      inputMode="numeric"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      className={cn("h-8 tabular-nums", className)}
    />
  );
}
