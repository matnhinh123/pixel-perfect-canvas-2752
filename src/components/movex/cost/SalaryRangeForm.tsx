// Salary Range page (create / view / edit): code, name, its vehicle type (Truck + Truck Type, or Header;
// one Salary Range per vehicle type, a Draft may leave it empty), how the tiers are read (rounding,
// Other terrain surcharge) and the distance tiers — Base Trip Salary, extra distance rate, Road Support Fee, and for
// a Header a column per container (its own % on the Extra Distance Rate).
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  gridInBoxClass,
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
import { OldVersionBanner, VersionSelect } from "@/components/movex/cost/VersionField";
import { versionOf } from "@/services/cost/versions";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { FareCodeInput, FareNameInput } from "@/components/movex/cost/FareCodeInput";
import { useFarePair } from "@/components/movex/cost/useFarePair";
import { fareCodeOf } from "@/services/cost/fareCode";
import { useCollection } from "@/hooks/use-store";
import { commonCodeRepository, salaryRangeRepository } from "@/repositories";
import { readJson, writeJson } from "@/repositories/storage";
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
import {
  parseVehicleKey,
  salaryVehicleChoices,
  salaryVehiclesOf,
  type CogsVehicleType,
} from "@/services/cost/cogsVehicle";
import { CC } from "@/mock-data/commonCodes";
import {
  salaryRangeService,
  sanitizeSetupCode,
  type SalaryRangeDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import { useDisplayCurrency } from "@/lib/displayCurrency";
import {
  CurrencySelect,
  CurrencyTag,
  EditLink,
  AmountInput,
} from "@/components/movex/general/Amount";
import { cn } from "@/lib/utils";
import type { SalaryRangeRecord, SalaryTier } from "@/types";

/** Look of a rule setting the user can change (Round up, Other terrain, container %): a light blue field. */
const EDITABLE = "border-primary/40 bg-primary/5 focus-visible:bg-background";
/** Tiers grid: default column widths (px); a container column is wider (its select and %). */
const TIER_WIDTHS: Record<string, number> = {
  tier: 76,
  from: 96,
  to: 96,
  auto: 170,
  base: 190,
  price: 130,
  road: 190,
  del: 44,
};
const CONTAINER_WIDTH = 250;
const TIER_WIDTHS_KEY = "salary-range.tier-widths";
const rateIn = (t: SalaryTier, c: string) => t.containerRates?.[c] ?? NaN;
/** A new column's %: reefer containers (ISO type R) +15 %, the others +0 %. */
const defaultPct = (iso: string) => (iso[2] === "R" ? 15 : 0);

export function SalaryRangeForm({
  source,
  live,
  readOnly,
}: {
  /** What is shown: the Salary Range, or an earlier version of it. */
  source: SalaryRangeRecord | null;
  /** The Salary Range as it is now (differs from `source` on an earlier version). */
  live?: SalaryRangeRecord;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  /** The currency picked (next to History); amounts are typed in VND, so an editable form stays in VND. */
  const dc = useDisplayCurrency();
  const usd = dc.usd && readOnly;
  /** VND per unit of the currency shown. */
  const rate = usd ? dc.rate : 1;
  /** Unit of the amounts: VND, or USD. */
  const cur = usd ? "USD" : "VND";
  const money = (n: number) =>
    !Number.isFinite(n)
      ? "—"
      : usd
        ? formatNumber(Math.round((n / rate) * 100) / 100)
        : formatNumber(Math.round(n));
  /** An amount with its currency after it. */
  const amt = (n: number) => (
    <>
      {money(n)}
      <CurrencyTag cur={cur} />
    </>
  );
  const current = live ?? source;
  const shownVersion = source ? versionOf(source) : 1;
  /** An earlier version is shown (read-only). */
  const oldVersion = !!source && !!current && shownVersion !== versionOf(current);
  const oldEntry = oldVersion
    ? current?.history?.find((h) => h.version === shownVersion)
    : undefined;
  /** Shows a version: the current one, or an earlier one read-only. */
  const pickVersion = (v: number) =>
    current &&
    void navigate({
      to: "/salary-range/$id",
      params: { id: current.id },
      search: {
        mode: "view",
        ...(v === versionOf(current) ? {} : { version: v }),
      },
    });
  const types = useVehicleTypes();
  const all = useCollection(salaryRangeRepository);
  const initial = useMemo<SalaryRangeDraft>(
    () => ({
      code: source?.code ?? "",
      name: source?.name ?? "",
      vehicleTypes: source ? [...salaryVehiclesOf(source)] : [],
      tiers: source
        ? source.tiers.map((t) => ({
            ...t,
            ...(t.containerRates ? { containerRates: { ...t.containerRates } } : {}),
          }))
        : [],
      containers: (source?.containers ?? []).map((c) => ({ ...c })),
      rule: { ...ruleOf(source?.rule ?? DEFAULT_RULE) },
      fareCode: fareCodeOf(source?.fareCostId),
      remark: source?.remark ?? "",
      status: source?.status ?? "Active",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [d, setD] = useState(initial);
  // Fare Code + Fare Name boxes: type either, the other follows.
  const fare = useFarePair(d.fareCode, (fareCode) => setD((x) => ({ ...x, fareCode })));
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
  const isHeader = d.vehicleTypes.some((k) => parseVehicleKey(k)?.kind === "HEADER");
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

  // Tiers grid: column widths the user dragged (kept in this browser), else the defaults.
  const [colW, setColW] = useState<Record<string, number>>(() =>
    readJson<Record<string, number>>(TIER_WIDTHS_KEY, {}),
  );
  const widthOf = (k: string) =>
    colW[k] ?? (k.startsWith("c:") ? CONTAINER_WIDTH : (TIER_WIDTHS[k] ?? 120));
  const saveWidths = (next: Record<string, number>) => {
    setColW(next);
    writeJson(TIER_WIDTHS_KEY, next);
  };
  /** Drag a header's right edge to widen or narrow its column. */
  const startResize = (k: string, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = widthOf(k);
    let last = colW;
    const move = (ev: MouseEvent) => {
      last = { ...colW, [k]: Math.max(48, Math.round(w0 + ev.clientX - x0)) };
      setColW(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      writeJson(TIER_WIDTHS_KEY, last);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  /** Double-click a header edge: the column back to its default width. */
  const resetWidth = (k: string) => {
    const next = { ...colW };
    delete next[k];
    saveWidths(next);
  };
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

  /** A vehicle type is paid by one Salary Range: the other one each picked vehicle type has already. */
  const takenOf = (k: string) =>
    all.find(
      (r) =>
        !r.deleted &&
        r.id !== source?.id &&
        r.status !== "Draft" &&
        salaryVehiclesOf(r).includes(k),
    );
  const taken =
    !readOnly && d.status !== "Draft"
      ? d.vehicleTypes.map((k) => ({ k, r: takenOf(k) })).filter((x) => x.r)
      : [];

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
  /** Columns of the Tiers grid, in order. */
  const tierKeys = [
    "tier",
    "from",
    "to",
    "auto",
    "base",
    "price",
    ...cols.map((c) => `c:${c.container}`),
    "road",
    ...(readOnly ? [] : ["del"]),
  ];
  const colCount = tierKeys.length;
  /** A header cell of the Tiers grid, with a handle on its right edge to resize the column. */
  const head = (k: string, label: ReactNode, right = false) => (
    <th
      key={k}
      className={cn(
        thClass,
        "relative overflow-hidden px-2.5 py-2 text-left align-top",
        right && "text-right",
      )}
    >
      <div className={cn("truncate", right && "text-right")}>{label}</div>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize the column; double-click for the default width"
        title="Drag to resize · double-click: default width"
        onMouseDown={(e) => startResize(k, e)}
        onDoubleClick={() => resetWidth(k)}
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
      />
    </th>
  );

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
        subtitle={source ? salaryVehiclesOf(source).join(", ") || "No vehicle type yet" : undefined}
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
              <CurrencySelect />
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
              {readOnly && !oldVersion && (
                <EditLink usd={false}>
                  <Link to="/salary-range/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </EditLink>
              )}
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />
      {oldVersion && current && (
        <OldVersionBanner
          version={shownVersion}
          current={versionOf(current)}
          savedAt={oldEntry?.savedAt}
          savedBy={oldEntry?.savedBy}
          onBack={() => pickVersion(versionOf(current))}
        />
      )}
      {source?.status === "Draft" && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-info-soft px-3 py-2 text-sm text-primary">
          <Info className="h-4 w-4 shrink-0" />
          Draft: not used by COGS. Pick its Vehicle Type and set it Active to use it.
        </div>
      )}

      <div className="space-y-4">
        <Panel title="General Information" accent>
          <InlineFields labelWidth="9.75rem">
            {/* Code · Name · Version / Vehicle Type (wide) · Round Up To / Other Terrain · Fare Code · Fare Name. */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-3">
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
                label="Version"
                info="1 when created; each save that changes the Salary Range adds 1. Pick an earlier version to see it as it was: read-only, an earlier version is never edited."
                hint={
                  !readOnly && !isNew && dirty
                    ? `Saving makes it v${versionOf(current!) + 1}.`
                    : undefined
                }
              >
                {current ? (
                  <VersionSelect record={current} value={shownVersion} onPick={pickVersion} />
                ) : (
                  text("v1")
                )}
              </Field>
              <div className="lg:col-span-2">
                <Field
                  label="Vehicle Type"
                  required={d.status !== "Draft"}
                  error={errors["vehicleType"]}
                  info="From Master Data › Vehicle: one or more Truck Types, or Header alone (every container; a column per container in the Tiers). A vehicle type is paid by one Salary Range only; a Draft can leave it empty."
                >
                  <SalaryVehicles
                    value={d.vehicleTypes}
                    onChange={(vehicleTypes) => patch({ vehicleTypes })}
                    types={types}
                    readOnly={readOnly}
                    invalid={!!errors["vehicleType"] || taken.length > 0}
                    takenOf={takenOf}
                  />
                  {taken.map(({ k, r }) => (
                    <p key={k} className="mt-1 text-xs text-destructive">
                      {k} already has a Salary Range: {r!.code}.
                    </p>
                  ))}
                </Field>
              </div>
              <Field
                label="Round Up To"
                error={errors["roundStep"]}
                info="The Trip Salary is rounded up to a multiple of this amount. 0 = no rounding."
              >
                {readOnly ? (
                  text(d.rule.roundStep ? `${money(d.rule.roundStep)} ${cur}` : "No rounding")
                ) : (
                  <AmountInput
                    value={d.rule.roundStep}
                    onChange={(roundStep) => setRule({ roundStep })}
                    className={EDITABLE}
                    aria-label={`Round up to (${cur})`}
                    aria-invalid={!!errors["roundStep"] || undefined}
                  />
                )}
              </Field>
              <Field
                label="Other Terrain"
                error={errors["regionAmount"]}
                info="Added to the Road Support Fee when the route's Terrain is Other (Route Management). Plain routes are not charged. Untick: no surcharge."
              >
                {readOnly ? (
                  text(d.rule.regionOn ? `+ ${money(d.rule.regionAmount)} ${cur}` : "No surcharge")
                ) : (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={d.rule.regionOn}
                      onCheckedChange={(v) => setRule({ regionOn: v === true })}
                      aria-label="Other terrain surcharge"
                    />
                    <div className="min-w-0 flex-1">
                      <AmountInput
                        disabled={!d.rule.regionOn}
                        value={d.rule.regionAmount}
                        onChange={(regionAmount) => setRule({ regionAmount })}
                        className={EDITABLE}
                        aria-label={`Other terrain surcharge (${cur})`}
                        aria-invalid={!!errors["regionAmount"] || undefined}
                      />
                    </div>
                  </div>
                )}
              </Field>
              <Field
                label="Fare Code"
                error={errors["fareCode"]}
                info="Fare Code Management: the Fare Code the Trip Salary of a COGS is booked to. Type the code or the name: the other one is filled in. Empty: not mapped yet."
              >
                <FareCodeInput pair={fare} readOnly={readOnly} invalid={!!errors["fareCode"]} />
              </Field>
              <Field label="Fare Name">
                <FareNameInput pair={fare} readOnly={readOnly} invalid={!!errors["fareCode"]} />
              </Field>
            </div>
          </InlineFields>
        </Panel>

        <Panel
          accent
          title="Tiers"
          actions={
            <span className="text-sm text-muted-foreground">
              {d.tiers.length} tiers · 0 – {formatNumber(d.tiers[d.tiers.length - 1]?.to ?? 0)} km
            </span>
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
                      <th className="px-3 py-1.5 text-right font-medium">③ Base Trip Salary</th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        ④ Price ({cur})/km × extra km
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">③ + ④</th>
                      <th className="px-3 py-1.5 text-right font-medium">
                        ⑤ Trip Salary
                        {d.rule.roundStep > 0 &&
                          ` (rounded up to ${money(d.rule.roundStep)} ${cur})`}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        key: "",
                        label: !isHeader
                          ? d.vehicleTypes.join(", ") || "This vehicle type"
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
                              {amt(s.tierSalary)}
                              {s.pct > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  + {s.pct}% = {amt(s.salary)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className="text-muted-foreground">
                                {money(s.extraRate)} × {formatNumber(s.intoKm)} ={" "}
                              </span>
                              {amt(s.extraRate * s.intoKm)}
                            </td>
                            <td className="px-3 py-1.5 text-right">{amt(s.raw)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-primary">
                              {amt(s.base)}
                            </td>
                          </tr>
                        ),
                    )}
                  </tbody>
                </table>
                <div className="border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                  Road Support Fee of Tier {tryBase.tier}:{" "}
                  <b className="text-foreground tabular-nums">{amt(tryBase.roadStd)}</b>, paid on
                  top of the Trip Salary.
                </div>
              </>
            )}
          </div>
          {isHeader && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {cols.length
                  ? `Columns are Container Types (Common Code, ISO). A container without a column is paid the Base Trip Salary and Price (${cur})/km as they are.`
                  : `Every container is paid the Base Trip Salary and Price (${cur})/km as they are. Add a column (Add Container) for a Container Type paid more, e.g. 42RT reefer.`}
              </p>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={addCol}
                  disabled={freeChoices.length === 0}
                  title={
                    freeChoices.length
                      ? `A column with its own Price (${cur})/km for one container`
                      : "Every container has a column"
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Container
                </Button>
              )}
            </div>
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
          {/* The box hugs the grid (rounded on all four corners); wider than the panel: it scrolls. */}
          <div className="w-fit max-w-full overflow-auto rounded-lg border">
            <table
              className={cn("text-sm [&_td]:align-middle", gridInBoxClass)}
              style={{
                tableLayout: "fixed",
                width: tierKeys.reduce((n, k) => n + widthOf(k), 0),
              }}
            >
              <colgroup>
                {tierKeys.map((k) => (
                  <col key={k} style={{ width: widthOf(k) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {head("tier", "Tier")}
                  {head("from", "From (km)", true)}
                  {head("to", "To (km)", true)}
                  {head(
                    "auto",
                    <span className="flex items-center gap-1">
                      <Switch
                        checked={allAuto}
                        disabled={readOnly || autoable.length === 0}
                        onCheckedChange={(v) => setAutoAll(v)}
                        aria-label="Apply the formula to every tier"
                        className="-ml-1.5 scale-75"
                      />
                      <span className={cn("truncate", someAuto && !allAuto && "text-warning")}>
                        {someAuto && !allAuto ? "Apply formula (some)" : "Apply formula"}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info
                            className="h-3.5 w-3.5 shrink-0 cursor-help"
                            aria-label="How the formula works"
                          />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-xs normal-case leading-5">
                          <div className="font-semibold">Base Trip Salary of a tier =</div>
                          <div>
                            Base Trip Salary of the tier before + its Price ({cur})/km × its width
                            (km)
                          </div>
                          <div className="mt-1 opacity-80">
                            e.g. 400.000 + 2.900 × 50 km = 545.000
                          </div>
                          <div className="mt-1">
                            On: worked out for you (greyed). Off: typed by hand. Tier 1 is always
                            typed.
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </span>,
                  )}
                  {head("base", `Base Trip Salary (${cur})`, true)}
                  {head("price", `Price (${cur})/km`, true)}
                  {cols.map((c, ci) => {
                    const off = d.tiers.filter((t) => offPct(t, c)).length;
                    return head(
                      `c:${c.container}`,
                      <div className="space-y-1 normal-case">
                        <div className="flex items-center gap-1.5 font-normal">
                          {readOnly ? (
                            <span className="truncate text-xs font-semibold text-foreground">
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
                              className="h-7 min-w-0 flex-1 text-xs font-semibold"
                            />
                          )}
                          <span className="text-muted-foreground">+</span>
                          {readOnly ? (
                            <b className="text-foreground">{c.pct}</b>
                          ) : (
                            <Input
                              inputMode="decimal"
                              value={Number.isFinite(c.pct) ? String(c.pct) : ""}
                              onChange={(e) => setColPct(ci, e.target.value.replace(/[^\d.]/g, ""))}
                              className={cn(EDITABLE, "h-7 w-12 shrink-0 px-1.5 text-right")}
                              aria-label={`${c.container} %`}
                            />
                          )}
                          <span className="text-muted-foreground">%</span>
                          {!readOnly && (
                            <button
                              type="button"
                              aria-label={`Remove the ${c.container} column`}
                              title="Remove column"
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeCol(ci)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {off > 0 && (
                          <div className="flex items-center gap-1 text-[11px] font-normal text-warning">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {off} not +{c.pct}%
                            </span>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => resetCol(c)}
                                className="ml-1 shrink-0 text-primary hover:underline"
                              >
                                Reset all
                              </button>
                            )}
                          </div>
                        )}
                      </div>,
                    );
                  })}
                  {head("road", `Road Support Fee (${cur})`, true)}
                  {!readOnly && head("del", "")}
                </tr>
              </thead>
              <tbody>
                {d.tiers.length === 0 && (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="py-6 text-center text-xs text-muted-foreground"
                    >
                      No tier yet — add one with “Add Tier”.
                    </td>
                  </tr>
                )}
                {d.tiers.map((t, i) => {
                  const auto = !!t.auto && i > 0;
                  return (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="truncate px-2.5 text-muted-foreground">Tier {i + 1}</td>
                      <td className="p-0">
                        <NumInput
                          value={t.from}
                          onChange={(v) => setTier(i, "from", v)}
                          plain={readOnly}
                          aria-label={`Tier ${i + 1} from (km)`}
                        />
                      </td>
                      <td className="p-0">
                        <NumInput
                          value={t.to}
                          onChange={(v) => setTier(i, "to", v)}
                          plain={readOnly}
                          aria-label={`Tier ${i + 1} to (km)`}
                        />
                      </td>
                      <td className="px-2.5">
                        {i > 0 ? (
                          <Switch
                            checked={!!t.auto}
                            disabled={readOnly}
                            onCheckedChange={(v) => setAuto(i, v)}
                            aria-label={`Apply the formula, tier ${i + 1}`}
                            title={
                              t.auto
                                ? "Formula applied: worked out from the tier before"
                                : "Typed by hand"
                            }
                            className="-ml-1.5 scale-75"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn("p-0", auto && "bg-muted/60")}>
                        <NumInput
                          value={t.tripSalary}
                          rate={rate}
                          onChange={(v) => setTier(i, "tripSalary", v)}
                          readOnly={auto}
                          plain={readOnly}
                          title={auto ? autoBasis(i) : undefined}
                          className={auto ? "text-muted-foreground" : undefined}
                          aria-label={`Tier ${i + 1} Base Trip Salary`}
                        />
                      </td>
                      <td className="p-0">
                        <NumInput
                          value={t.extraRate}
                          rate={rate}
                          onChange={(v) => setTier(i, "extraRate", v)}
                          plain={readOnly}
                          aria-label={`Tier ${i + 1} Price (${cur})/km`}
                        />
                      </td>
                      {cols.map((c) => {
                        const off = offPct(t, c);
                        return (
                          <td
                            key={c.container}
                            className={cn("relative p-0", off && "bg-warning/10")}
                          >
                            <NumInput
                              value={rateIn(t, c.container)}
                              rate={rate}
                              onChange={(v) => setCell(i, c.container, v)}
                              plain={readOnly}
                              title={
                                off
                                  ? `Changed by hand · +${c.pct}% would be ${money(pctRate(t, c.pct))}`
                                  : undefined
                              }
                              className={cn(off && "pr-8 text-warning")}
                              aria-label={`Tier ${i + 1} ${c.container}`}
                            />
                            {off && !readOnly && (
                              <button
                                type="button"
                                title={`Back to +${c.pct}% (${money(pctRate(t, c.pct))})`}
                                aria-label={`Reset tier ${i + 1} ${c.container}`}
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-warning hover:bg-warning/15"
                                onClick={() => setCell(i, c.container, String(pctRate(t, c.pct)))}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-0">
                        <NumInput
                          value={t.roadSupportFee}
                          rate={rate}
                          onChange={(v) => setTier(i, "roadSupportFee", v)}
                          plain={readOnly}
                          aria-label={`Tier ${i + 1} Road Support Fee`}
                        />
                      </td>
                      {!readOnly && (
                        <td className="text-center">
                          <button
                            type="button"
                            aria-label={`Remove tier ${i + 1}`}
                            className="text-destructive hover:opacity-70"
                            onClick={() => patch({ tiers: d.tiers.filter((_, j) => j !== i) })}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Under the last tier: the new one shows right above it. */}
            {!readOnly && (
              <button
                type="button"
                onClick={addTier}
                className="flex items-center justify-center gap-1.5 border-t border-dashed py-2 text-sm font-medium text-primary hover:bg-primary/5"
                style={{ width: tierKeys.reduce((n, k) => n + widthOf(k), 0), minWidth: "100%" }}
              >
                <Plus className="h-4 w-4" />
                Add Tier
              </button>
            )}
          </div>
        </Panel>

        <Panel title="Remark" accent>
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
  rate = 1,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (v: string) => void;
  className?: string | undefined;
  readOnly?: boolean;
  title?: string | undefined;
  /** View: shown, not editable. */
  plain?: boolean;
  "aria-label"?: string;
  /** An amount shown in another currency: VND per unit of it (USD: 2 decimals). */
  rate?: number;
}) {
  return (
    <MoneyInput
      value={rate === 1 ? value : value / rate}
      decimals={rate === 1 ? 0 : 2}
      // Typed in USD: kept in VND at the rate.
      onChange={(n) =>
        onChange(Number.isFinite(n) ? String(rate === 1 ? n : Math.round(n * rate)) : "")
      }
      placeholder=""
      readOnly={readOnly || plain}
      title={title}
      tabIndex={readOnly || plain ? -1 : undefined}
      aria-label={ariaLabel}
      // A grid cell (Excel-like): fills its cell, no box; a blue frame while typing in it.
      className={cn(
        "h-9 w-full rounded-none border-0 bg-transparent px-2.5 text-right tabular-nums shadow-none hover:bg-primary/5 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary read-only:hover:bg-transparent",
        className,
        plain && "cursor-default",
      )}
    />
  );
}

/**
 * Vehicle types of a Salary Range: one or more Truck Types (chips; more can be added), or Header alone
 * (the headers' rates are a table of their own, a column per container: no Truck Type with it).
 */
function SalaryVehicles({
  value,
  onChange,
  types,
  readOnly,
  invalid,
  takenOf,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  types: readonly CogsVehicleType[];
  readOnly: boolean;
  invalid: boolean;
  takenOf: (key: string) => SalaryRangeRecord | undefined;
}) {
  const [picking, setPicking] = useState("");
  const header = value.includes("HEADER");
  const label = (k: string) => (k === "HEADER" ? "Header · every container" : k);
  /** Truck Types not picked yet; one paid by another Salary Range says which. */
  const moreTrucks = salaryVehicleChoices(types).filter(
    (k) => k.startsWith("TRUCK · ") && !value.includes(k),
  );
  const chips = value.map((k) => (
    <span
      key={k}
      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border bg-accent pl-3 pr-1 text-sm text-accent-foreground"
    >
      {label(k)}
      {!readOnly && (
        <button
          type="button"
          aria-label={`Remove ${k}`}
          onClick={() => onChange(value.filter((x) => x !== k))}
          className="rounded-full p-0.5 hover:bg-primary/15"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  ));
  if (readOnly)
    return (
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 text-sm">
        {chips.length ? chips : <span className="text-muted-foreground">Not picked yet</span>}
      </div>
    );
  // Nothing picked yet: Truck → Truck Type, or Header.
  if (!value.length)
    return (
      <VehicleTypePicker
        salary
        value={picking}
        onChange={(k) => {
          if (k === "HEADER" || parseVehicleKey(k)?.spec) {
            onChange([k]);
            setPicking("");
          } else setPicking(k);
        }}
        types={types}
        invalid={invalid}
      />
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
      {/* More Truck Types; a Header Salary Range takes no other vehicle type. */}
      {!header && moreTrucks.length > 0 && (
        <NativeSelect
          value=""
          onChange={(k) => k && onChange([...value, k])}
          options={moreTrucks}
          labels={Object.fromEntries(
            moreTrucks.map((k) => {
              const r = takenOf(k);
              return [k, r ? `${k} · in ${r.code}` : k];
            }),
          )}
          placeholder="+ Add Truck Type"
          className="h-8 w-44 text-sm"
        />
      )}
    </div>
  );
}
