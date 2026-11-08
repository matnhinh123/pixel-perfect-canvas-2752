// Fuel Cost page (create / view / edit): the price of one Fuel Type, and the vehicle types running on it
// (no brands: a brand burns as its type), with the Fuel Rate each burns: the vehicles' average (Vehicle ›
// Fuel Rate), or rates set here: K1 running empty, K2 running loaded. A new Fuel Cost lists every vehicle
// type running on the fuel. A COGS burns its vehicle type's Estimate (K1 + K2) ÷ 2 × the route's
// distance at this price.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/movex/general/MoneyInput";
import { MultiSelect } from "@/components/movex/businessPartner/MultiSelect";
import {
  Field,
  gridInBoxClass,
  InlineFields,
  NativeSelect,
  Panel,
  StatusBadge,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { OldVersionBanner, VersionSelect } from "@/components/movex/cost/VersionField";
import { FuelPriceHistory } from "@/components/movex/cost/FuelPriceHistory";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import { fuelCostRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { fuelUnitOf } from "@/services/vehicleMasterService";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { CC } from "@/mock-data/commonCodes";
import { FUEL_TYPES } from "@/mock-data/vehicleMaster";
import {
  fuelCodeOf,
  sanitizeSetupCode,
  fuelCostNameOf,
  fuelCostService,
  type FuelCostDraft,
} from "@/services/cost/variableSetup";
import {
  defaultFuelVehicles,
  estimateOf,
  fuelUsers,
  fuelVehiclesOf,
  HEADER_ROW,
  headerTypeOn,
  isHeaderKey,
  ratesOf,
} from "@/services/cost/fuelRates";
import { atVersion, versionOf } from "@/services/cost/versions";
import { formatNumber } from "@/lib/format";
import { useDisplayCurrency } from "@/lib/displayCurrency";
import { CurrencySelect, CurrencyTag, EditLink } from "@/components/movex/general/Amount";
import { cn } from "@/lib/utils";
import type { FuelCostRecord, FuelVehicleRate } from "@/types";

/** Widths (px) of the vehicle types table: Vehicle Type, Number, Min - Max, K1, K2, Estimate, km / unit, unit / km, Previous / Updated Price, Previous / Updated Fuel Cost / km, Change. */
const VT_WIDTHS = [195, 70, 90, 90, 90, 85, 70, 70, 100, 100, 105, 105, 75];

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
/** "16.3" or "14 – 22". */
const range = (min: number, max: number) =>
  max ? (min === max ? String(min) : `${min} – ${max}`) : "—";

/**
 * A Fuel Rate (per 100 km), filled with the vehicles' average until another rate is typed; decimals
 * with "." or ",". Cleared, or typed back to the average: the vehicles' average again (`null`).
 */
function RateInput({
  value,
  average,
  onChange,
  invalid,
  title,
}: {
  value: number | null;
  average: number;
  onChange: (v: number | null) => void;
  invalid?: boolean;
  title?: string | undefined;
}) {
  const filled = value ?? (average || null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  return (
    <Input
      inputMode="decimal"
      value={focused ? text : filled === null ? "" : String(filled)}
      title={title}
      aria-invalid={invalid || undefined}
      onFocus={() => {
        setText(filled === null ? "" : String(filled));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, "");
        setText(t);
        if (!t) return onChange(null);
        const n = Number(t.replace(",", "."));
        onChange(!Number.isFinite(n) ? 0 : n === average ? null : n);
      }}
      className="h-8 w-full max-w-24 text-right tabular-nums"
    />
  );
}

export function FuelCostForm({
  source,
  live,
  readOnly,
}: {
  /** What is shown: the Fuel Cost, or an earlier version of it. */
  source: FuelCostRecord | null;
  /** The Fuel Cost as it is now (differs from `source` on an earlier version). */
  live?: FuelCostRecord;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const isNew = !source;
  /** The currency picked (next to History); amounts are typed in VND, so an editable form stays in VND. */
  const dc = useDisplayCurrency();
  const usd = dc.usd && readOnly;
  /** Unit of the amounts: VND, or USD. */
  const cur = usd ? "USD" : "VND";
  const money = (n: number) => (usd ? dc.money(n) : formatNumber(Math.round(n)));
  const types = useVehicleTypes();
  const all = useCollection(fuelCostRepository);
  const current = live ?? source;
  const shownVersion = source ? versionOf(source) : 1;
  /** An earlier version is shown (read-only). */
  const oldVersion = !!source && !!current && shownVersion !== versionOf(current);
  const oldEntry = oldVersion
    ? current?.history?.find((h) => h.version === shownVersion)
    : undefined;
  const pickVersion = (v: number) =>
    current &&
    void navigate({
      to: "/fuel-cost/$id",
      params: { id: current.id },
      search: {
        mode: "view",
        ...(v === versionOf(current) ? {} : { version: v }),
      },
    });

  /** Fuel Types of Common Code (Vehicle › Fuel Type); the ones with a price already are not offered. */
  const codeFuelTypes = useCodeOptions(CC.FUEL_TYPE, FUEL_TYPES);
  const priced = new Set(
    all.filter((r) => !r.deleted && r.id !== source?.id).map((r) => r.fuelType),
  );
  const fuelTypes = withCurrent(
    codeFuelTypes.filter((f) => !priced.has(f)),
    source?.fuelType,
  );
  const initial = useMemo<FuelCostDraft>(() => {
    const fuelType = source?.fuelType ?? fuelTypes[0] ?? "";
    return {
      code: source?.code ?? (fuelType ? fuelCodeOf(fuelType) : ""),
      name: source ? fuelCostNameOf(source) : fuelType ? `${fuelType} Fuel Cost` : "",
      fuelType,
      fuelPrice: source?.fuelPrice ?? 0,
      // New: every vehicle type running on the fuel; older records without a list: the same.
      vehicles: source ? fuelVehiclesOf(source, types) : defaultFuelVehicles(types, fuelType),
      remark: source?.remark ?? "",
      status: source?.status === "Inactive" ? "Inactive" : "Active",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adding, setAdding] = useState("");
  /** The tab under General Information: the vehicle types, or the Price History of every version. */
  const [tab, setTab] = useState<"vehicles" | "history">("vehicles");
  /** Viewing a saved Fuel Cost: the vehicle types and the Price History come as two tabs. */
  const tabbed = readOnly && !!current;
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const clearErr = (keys: string[]) =>
    setErrors((e) => {
      const n = { ...e };
      for (const k of keys) delete n[k];
      return n;
    });
  const patch = (p: Partial<FuelCostDraft>) => {
    setD((x) => ({ ...x, ...p }));
    clearErr(Object.keys(p));
  };
  const unit = fuelUnitOf(d.fuelType);
  const byKey = new Map(types.map((t) => [t.key, t]));
  const users = fuelUsers(types, d.fuelType);
  const listed = new Set(d.vehicles.map((v) => v.vehicleType));
  /** Vehicle types running on the fuel that are not listed: they can be added. */
  /** The headers' figures (the same heads pull every container). */
  const headerType = headerTypeOn(types, d.fuelType);
  /** What a row's figures are read from: its vehicle type, or every header for "HEADER". */
  const statsOf = (key: string) => (key === HEADER_ROW ? headerType : byKey.get(key));
  /** The headers' average: what "HEADER" (and a container left empty) burns when nothing is typed. */
  const headerAvg = headerType?.fuelRates[d.fuelType]?.avg ?? 0;
  const isContainerRow = (key: string) => isHeaderKey(key) && key !== HEADER_ROW;
  const addable = [
    ...users.filter((t) => !isHeaderKey(t.key)).map((t) => t.key),
    ...(headerType && !listed.has(HEADER_ROW) ? [HEADER_ROW] : []),
    ...users.filter((t) => isContainerRow(t.key)).map((t) => t.key),
  ].filter((k) => !listed.has(k));
  const rows = d.vehicles;
  /**
   * Filter of the vehicle types table: the vehicle types ticked in its checkbox list (the rows of the
   * table); none ticked = every one. A type no longer listed drops out of it.
   */
  const [vtPicked, setVtPicked] = useState<string[]>([]);
  const vtOptions = rows.map((v) => v.vehicleType);
  const picked = vtPicked.filter((k) => vtOptions.includes(k));
  const shown = picked.length ? rows.filter((v) => picked.includes(v.vehicleType)) : rows;
  const perKm = (rate: number, price = d.fuelPrice) => Math.round((rate / 100) * price);
  /** K1 / K2 / Estimate of a row of a vehicle list (the draft's, or the Previous one's): same rules for both. */
  const rowRateOf = (list: readonly FuelVehicleRate[], key: string) => {
    const v = list.find((x) => x.vehicleType === key);
    if (!v) return undefined;
    const own = statsOf(key)?.fuelRates[d.fuelType];
    const hRow = list.find((x) => x.vehicleType === HEADER_ROW);
    const hRates = ratesOf(hRow ?? { vehicleType: HEADER_ROW, rate: null }, {
      k1: headerAvg,
      k2: headerAvg,
    });
    const { k1, k2 } = ratesOf(
      v,
      isContainerRow(key) ? hRates : { k1: own?.avg ?? 0, k2: own?.avg ?? 0 },
    );
    return { k1, k2, rate: estimateOf(k1, k2) };
  };
  /**
   * Previous: what the Fuel Cost held before — editing: as saved; viewing: the version before the one shown
   * (v1: itself). Updated: the draft, as the price or rates are typed.
   */
  const old = !source
    ? null
    : !readOnly
      ? source
      : current && versionOf(source) > 1
        ? atVersion(current, versionOf(source) - 1)
        : source;
  const oldVehicles = old ? fuelVehiclesOf(old, types) : [];
  /** Change from Previous to Updated, in % (1 decimal); undefined without a Previous figure. */
  const pctOf = (from: number, to: number) =>
    from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : undefined;

  /** A new Fuel Cost on another fuel starts again from every vehicle type running on it. */
  /** The name follows the Fuel Type while it is the default "<Fuel Type> Fuel Cost". */
  const pickFuel = (fuelType: string) => {
    patch({
      fuelType,
      // The code follows the Fuel Type while it is the default "FU-<Fuel Type>" (or empty).
      ...(d.code === fuelCodeOf(d.fuelType) || !d.code.trim()
        ? { code: fuelCodeOf(fuelType) }
        : {}),
      ...(d.name === `${d.fuelType} Fuel Cost` || !d.name.trim()
        ? { name: `${fuelType} Fuel Cost` }
        : {}),
      ...(source ? {} : { vehicles: defaultFuelVehicles(types, fuelType) }),
    });
    setAdding("");
  };
  /** Sets K1 (`rate`) or K2 (`rateLoaded`) of a row; null = left empty. */
  const setRate = (key: string, field: "rate" | "rateLoaded", value: number | null) => {
    setD((x) => ({
      ...x,
      vehicles: x.vehicles.map((v) => (v.vehicleType === key ? { ...v, [field]: value } : v)),
    }));
    clearErr([`vehicles.${key}`]);
  };
  /** Removes a header + container: it burns the HEADER rate again. */
  const remove = (key: string) =>
    setD((x) => ({ ...x, vehicles: x.vehicles.filter((v) => v.vehicleType !== key) }));
  /** Adds a vehicle type (or a header + container), at the average. */
  const add = (key: string) => {
    if (!key) return;
    setD((x) =>
      x.vehicles.some((v) => v.vehicleType === key)
        ? x
        : {
            ...x,
            vehicles: [...x.vehicles, { vehicleType: key, rate: null, rateLoaded: null }],
          },
    );
    setAdding("");
  };

  const toList = () => void navigate({ to: "/variable-cost", search: { tab: "fuel" } });
  const back = () =>
    source
      ? void navigate({ to: "/fuel-cost/$id", params: { id: source.id }, search: { mode: "view" } })
      : toList();
  const save = () => {
    setFormError(null);
    try {
      const rec = fuelCostService.save(d, source?.id);
      guard.allowNext();
      toast.success(`${rec.code} ${isNew ? "added" : "saved"}`);
      void navigate({ to: "/fuel-cost/$id", params: { id: rec.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const text = (v: string) => <div className="flex h-10 items-center text-sm">{v || "—"}</div>;
  const cell = "px-3 py-2";
  const head = (h: string, right = false) => (
    <th key={h} className={cn(thClass, cell, "leading-tight", right && "text-right")}>
      {h}
    </th>
  );

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Variable Cost", to: "/variable-cost" },
          { label: "Fuel Cost" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Add Fuel Cost"
            : readOnly
              ? `${source.code} · ${fuelCostNameOf(source)}`
              : `Edit: ${source.code}`
        }
        subtitle={
          source
            ? `${money(source.fuelPrice)} ${cur} / ${fuelUnitOf(source.fuelType).capacity}`
            : undefined
        }
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? toList() : back())}
        onCancel={back}
        onSave={save}
        extra={
          <>
            {!readOnly && (
              <NativeSelect
                value={d.status}
                onChange={(v) => patch({ status: v as FuelCostDraft["status"] })}
                options={["Active", "Inactive"]}
                className="h-11"
              />
            )}
            {source && readOnly && <CurrencySelect />}
            {source && (
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                History
              </Button>
            )}
            {source && readOnly && !oldVersion && (
              <EditLink usd={usd}>
                <Link to="/fuel-cost/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </EditLink>
            )}
          </>
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

      <div className="space-y-4">
        <Panel title="General Information" accent>
          <InlineFields labelWidth="8.5rem">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-3">
              <Field
                label="Fuel Cost Code"
                required={!readOnly}
                error={errors["code"]}
                hint={readOnly ? undefined : `${d.code.length}/20`}
                info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters). A new one starts as FU-<Fuel Type>; a COGS shows it with the name."
              >
                {readOnly ? (
                  text(d.code)
                ) : (
                  <Input
                    value={d.code}
                    maxLength={20}
                    placeholder="Enter Fuel Cost Code"
                    aria-invalid={!!errors["code"] || undefined}
                    onChange={(e) => patch({ code: sanitizeSetupCode(e.target.value) })}
                    className="h-10"
                  />
                )}
              </Field>
              <Field label="Fuel Cost Name" required={!readOnly} error={errors["name"]}>
                {readOnly ? (
                  text(d.name)
                ) : (
                  <Input
                    value={d.name}
                    maxLength={100}
                    placeholder="Enter Fuel Cost Name"
                    aria-invalid={!!errors["name"] || undefined}
                    onChange={(e) => patch({ name: e.target.value })}
                    className="h-10"
                  />
                )}
              </Field>
              <Field
                label="Version"
                info="1 when created; each save that changes the Fuel Cost adds 1. Pick an earlier version to see it as it was (read-only)."
                hint={
                  current && !readOnly
                    ? `Saving a change makes it v${versionOf(current) + 1}.`
                    : undefined
                }
              >
                {current ? (
                  <VersionSelect record={current} value={shownVersion} onPick={pickVersion} />
                ) : (
                  text("v1")
                )}
              </Field>
              <Field
                label="Fuel Type"
                required={!readOnly}
                error={errors["fuelType"]}
                info="Common Code › Fuel Type (the list Vehicle › Fuel Type picks from); one Fuel Cost per Fuel Type."
              >
                {readOnly ? (
                  text(d.fuelType)
                ) : (
                  <NativeSelect
                    value={d.fuelType}
                    onChange={pickFuel}
                    options={withCurrent(fuelTypes, d.fuelType)}
                    placeholder={
                      fuelTypes.length ? "Select Fuel Type" : "Every Fuel Type has a price"
                    }
                    invalid={!!errors["fuelType"]}
                    className="h-10 w-full"
                  />
                )}
              </Field>
              <Field
                label={`Price / ${unit.capacity}`}
                required={!readOnly}
                error={errors["fuelPrice"]}
              >
                {readOnly ? (
                  text(`${money(d.fuelPrice)} ${cur}`)
                ) : (
                  <MoneyInput
                    value={d.fuelPrice}
                    emptyZero
                    suffix={cur}
                    onChange={(v) => patch({ fuelPrice: Number.isFinite(v) ? v : 0 })}
                    invalid={!!errors["fuelPrice"]}
                  />
                )}
              </Field>
            </div>
          </InlineFields>
        </Panel>

        {/* Vehicle types / Price History in one card, one at a time, tabs as on COGS › Cost Detail.
            Editing: the vehicle types only, under their title. */}
        <section className="overflow-hidden rounded-[14px] bg-card shadow-hu-sm">
          {tabbed && current ? (
            <div role="tablist" className="flex gap-1 border-b px-4">
              {(
                [
                  ["vehicles", `Vehicle types on ${d.fuelType}`],
                  ["history", "Price History"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                    tab === k
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 border-b bg-primary/5 px-5 py-3.5">
              <h2 className="text-lg font-semibold text-primary">
                Vehicle types on {d.fuelType || "…"}{" "}
                <span className="font-normal text-muted-foreground">({rows.length})</span>
              </h2>
            </div>
          )}
          <div className="p-5">
            {tab === "vehicles" && (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  K1: running empty · K2: running loaded · Estimate = (K1 + K2) ÷ 2, the rate a COGS
                  burns. Each one left empty: the vehicles' average (Master Data › Vehicle). HEADER:
                  every header; add a header + container for rates of its own. Fuel Rates in{" "}
                  {unit.capacity} / 100 km · amounts in {cur} · Previous: as saved (viewing: the
                  version before) · Updated: as typed.
                </p>
                {/* One bar: the filter on the left (tick the vehicle types to show), Add on the right. */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  {rows.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Vehicle Type
                      </span>
                      <MultiSelect
                        value={picked}
                        onChange={setVtPicked}
                        options={vtOptions}
                        placeholder="All vehicle types"
                        selectAllLabel="Select all"
                        className="w-80"
                      />
                      {picked.length > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {shown.length} of {rows.length}
                          </span>
                          <Button
                            variant="ghost"
                            className="h-9 px-2 text-xs"
                            onClick={() => setVtPicked([])}
                          >
                            Clear
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span />
                  )}
                  {!readOnly && addable.length > 0 && (
                    <div className="flex items-center gap-2">
                      <NativeSelect
                        value={adding}
                        onChange={setAdding}
                        options={addable}
                        placeholder="Add a vehicle type / header + container"
                        className="h-9 w-72"
                      />
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={!adding}
                        onClick={() => add(adding)}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  )}
                </div>
                <div className="w-fit max-w-full overflow-auto rounded-lg border">
                  {/* Compact columns: the table is as wide as they are, not the whole panel. */}
                  <table
                    className={cn("text-sm", gridInBoxClass)}
                    style={{
                      tableLayout: "fixed",
                      width: VT_WIDTHS.reduce((a, b) => a + b, 0),
                    }}
                  >
                    <colgroup>
                      {VT_WIDTHS.map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-muted text-left">
                        {head("Vehicle Type")}
                        {head("Vehicles", true)}
                        {head("Fuel Rate Min – Max", true)}
                        {head("K1 · Empty", true)}
                        {head("K2 · Loaded", true)}
                        {head("Estimate (K1 + K2) ÷ 2", true)}
                        {head(`km / ${unit.capacity}`, true)}
                        {head(`${unit.capacity} / km`, true)}
                        {head(`Previous Price / ${unit.capacity}`, true)}
                        {head(`Updated Price / ${unit.capacity}`, true)}
                        {head("Previous Fuel Cost / km", true)}
                        {head("Updated Fuel Cost / km", true)}
                        {head("Ratio (%)", true)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={14}
                            className="px-3 py-6 text-center text-xs text-muted-foreground"
                          >
                            {users.length
                              ? `No vehicle type listed — add one running on ${d.fuelType}.`
                              : `No active vehicle runs on ${d.fuelType || "this fuel"} yet — set Fuel Type / Fuel Rate on the vehicles in Master Data › Vehicle.`}
                          </td>
                        </tr>
                      )}
                      {rows.length > 0 && shown.length === 0 && (
                        <tr>
                          <td
                            colSpan={14}
                            className="px-3 py-6 text-center text-xs text-muted-foreground"
                          >
                            No vehicle type matches the filter.
                          </td>
                        </tr>
                      )}
                      {shown.map((v) => {
                        const vt = statsOf(v.vehicleType);
                        const own = vt?.fuelRates[d.fuelType];
                        const container = isContainerRow(v.vehicleType);
                        /** Left empty: a container burns "HEADER"; any other row its vehicles' average. */
                        const { k1, k2, rate } = rowRateOf(d.vehicles, v.vehicleType)!;
                        /** Previous / Updated Fuel Cost per km, and the Ratio (%) between them. */
                        const oldRate = old
                          ? rowRateOf(oldVehicles, v.vehicleType)?.rate
                          : undefined;
                        const oldKm =
                          old && oldRate && old.fuelPrice
                            ? perKm(oldRate, old.fuelPrice)
                            : undefined;
                        const newKm = d.fuelPrice && rate > 0 ? perKm(rate) : undefined;
                        const pct =
                          oldKm !== undefined && newKm !== undefined
                            ? pctOf(oldKm, newKm)
                            : undefined;
                        const err = errors[`vehicles.${v.vehicleType}`];
                        /** K1 or K2 input: shows what it burns while left empty. */
                        const rateCell = (
                          field: "rate" | "rateLoaded",
                          value: number | null,
                          shown: number,
                        ) => (
                          <td className={cn(cell, !readOnly && "py-1.5")}>
                            <div
                              className="flex justify-end"
                              title={
                                value !== null
                                  ? "Set here. Clear it to go back to the vehicles' average (HEADER's for a container)."
                                  : container
                                    ? "The HEADER rate. Type another rate for this container."
                                    : "The vehicles' average (Master Data › Vehicle). Type another rate to set it here."
                              }
                            >
                              {readOnly ? (
                                <span className="tabular-nums">{shown || "—"}</span>
                              ) : (
                                <RateInput
                                  value={value}
                                  average={shown}
                                  onChange={(r) => setRate(v.vehicleType, field, r)}
                                  invalid={!!err}
                                  title={err}
                                />
                              )}
                            </div>
                          </td>
                        );
                        return (
                          <tr key={v.vehicleType} className="border-t">
                            <td className={cn(cell, "whitespace-nowrap")}>
                              {/* Every row on one level: a header + container sits beside the others. */}
                              <span className="font-medium">{v.vehicleType}</span>
                              {v.vehicleType === HEADER_ROW && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  every container
                                </span>
                              )}
                              {!vt && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  · no active vehicle
                                </span>
                              )}
                              {/* A header + container can be removed (it burns HEADER again): in its own cell, no extra column. */}
                              {!readOnly && container && (
                                <button
                                  type="button"
                                  title="Remove this header + container (it burns the HEADER rate)"
                                  aria-label={`Remove ${v.vehicleType}`}
                                  onClick={() => remove(v.vehicleType)}
                                  className="ml-1.5 inline-flex rounded p-0.5 align-middle text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                            <td
                              className={cn(cell, "text-right tabular-nums text-muted-foreground")}
                            >
                              {own?.vehicles ?? 0}
                            </td>
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {own ? range(own.min, own.max) : "—"}
                            </td>
                            {rateCell("rate", v.rate, k1)}
                            {rateCell("rateLoaded", v.rateLoaded ?? null, k2)}
                            <td className={cn(cell, "text-right font-medium tabular-nums")}>
                              {rate || "—"}
                              {err && (
                                <div className="mt-0.5 text-right text-[11px] font-normal text-destructive">
                                  {err}
                                </div>
                              )}
                            </td>
                            <td className={cn(cell, "text-right tabular-nums")}>
                              {rate > 0 ? round(100 / rate, 2) : "—"}
                            </td>
                            <td className={cn(cell, "text-right tabular-nums")}>
                              {rate > 0 ? round(rate / 100, 3) : "—"}
                            </td>
                            {/* Price per unit: Previous, then Updated. */}
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {old?.fuelPrice ? (
                                <>
                                  {money(old.fuelPrice)}
                                  <CurrencyTag cur={cur} />
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right font-medium tabular-nums",
                              )}
                            >
                              {d.fuelPrice ? (
                                <>
                                  {money(d.fuelPrice)}
                                  <CurrencyTag cur={cur} />
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            {/* Previous Fuel Cost / km in red: the figure being replaced. */}
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right tabular-nums text-destructive",
                              )}
                            >
                              {oldKm !== undefined ? (
                                <>
                                  {money(oldKm)}
                                  <CurrencyTag cur={cur} />
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right font-medium tabular-nums text-primary",
                              )}
                            >
                              {newKm !== undefined ? (
                                <>
                                  {money(newKm)}
                                  <CurrencyTag cur={cur} />
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            {/* Up: costs more (red); down: costs less (green). */}
                            <td
                              className={cn(
                                cell,
                                "whitespace-nowrap text-right font-semibold tabular-nums",
                                pct === undefined || pct === 0
                                  ? "text-muted-foreground"
                                  : pct > 0
                                    ? "text-destructive"
                                    : "text-success",
                              )}
                            >
                              {pct === undefined ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Every version at a glance (view only: a row opens that version). */}
            {tab === "history" && tabbed && current && (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Every version of {current.code}, newest first: its price, the Ratio (%) to the
                  version before, and the Fuel Cost per km of each vehicle type. Click a row to open
                  that version.
                </p>
                <FuelPriceHistory
                  record={current}
                  shownVersion={shownVersion}
                  onPick={pickVersion}
                  vehiclesOf={(r) => fuelVehiclesOf(r, types)}
                  rateOf={rowRateOf}
                  money={money}
                  cur={cur}
                  unit={unit.capacity}
                />
              </>
            )}
          </div>
        </section>

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
          entityType="Fuel Cost"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
