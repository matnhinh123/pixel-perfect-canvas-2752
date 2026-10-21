import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { History, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { CollapsiblePanel, ReadOnlyScope, S2, S3, S4 } from "@/components/movex/general/FormParts";

/** Five of the 12 columns (the two Fixed Cost Names). */
const S5 = "sm:col-span-6 lg:col-span-5";

import { useCollection } from "@/hooks/use-store";
import { costItemRepository, fixedCostRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  applyCostType,
  calcFixedCost,
  draftOfFixedCost,
  fixedCostService,
  newFixedCostDraft,
  rateOf,
  type FixedCostDraft,
} from "@/services/fixedCostService";
import { fmtMoney } from "@/services/fixedCostMath";
import { EMPTY_SCHEDULE, loanSchedule, type LoanSchedule } from "@/services/loanMath";
import { COST_CURRENCIES } from "@/mock-data/costMaster";
import { StatusSelect } from "@/components/movex/cost/CostForms";
import {
  ALLOCATION_UNITS,
  FIXED_COST_TYPES,
  REPAYMENT_METHODS,
  type FixedCostRecord,
  type FixedCostType,
  type LoanTerms,
  type RepaymentMethod,
} from "@/types";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/fixed-cost/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Create Fixed Cost — MoveX" : "Fixed Cost Detail — MoveX" },
    ],
  }),
  component: FixedCostPage,
});

function FixedCostPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(fixedCostRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Fixed Cost not found"
          action={
            <Button asChild size="sm">
              <Link to="/fixed-cost">Back to list</Link>
            </Button>
          }
        />
      </Panel>
    );
  return (
    <FixedCostForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

const NUM = "tabular-nums";

function FixedCostForm({
  source,
  readOnly,
}: {
  source: FixedCostRecord | null;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const units = useCodeOptions(CC.ALLOCATION_UNIT, ALLOCATION_UNITS);
  const isNew = !source;
  const detailsAll = useCollection(costItemRepository);
  const details = useMemo(
    () =>
      detailsAll.filter(
        (c) => !c.deleted && (c.status === "Active" || c.id === source?.costDetailId),
      ),
    [detailsAll, source],
  );

  const initial = useMemo<FixedCostDraft>(
    () => (source ? draftOfFixedCost(source) : newFixedCostDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<FixedCostDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };

  // Fare Code / Fare Name: typed or picked; an exact match selects the Fare Code and fills the other.
  const current = details.find((c) => c.id === d.costDetailId);
  const [codeText, setCodeText] = useState(current?.code ?? "");
  const [nameText, setNameText] = useState(current?.name ?? "");
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const typeCode = (v: string) => {
    setCodeText(v);
    const m = details.find((c) => same(c.code, v));
    patch({ costDetailId: m?.id ?? "" });
    if (m) setNameText(m.name);
    else if (current && same(nameText, current.name)) setNameText("");
  };
  const typeName = (v: string) => {
    setNameText(v);
    const m = details.find((c) => same(c.name, v));
    patch({ costDetailId: m?.id ?? "" });
    if (m) setCodeText(m.code);
    else if (current && same(codeText, current.code)) setCodeText("");
  };
  /** Typed text that matches no Fare Code. */
  const fareMiss = (text: string) =>
    text.trim() && !d.costDetailId ? "Not found in Fare Code Management." : undefined;
  // Cost Type: Allocation (value ÷ base ÷ days), Loan Interest (total interest ÷ term ÷ days) or
  // Other (an amount per day).
  const loan = useMemo(() => (d.loan ? loanSchedule(d.loan) : EMPTY_SCHEDULE), [d.loan]);
  const clearPriceErrors = () =>
    setErrors((e) => {
      const n = { ...e };
      for (const k of [
        "loanAmount",
        "loanRate",
        "loanTerm",
        "costValue",
        "allocationBase",
        "allocationDays",
      ])
        delete n[k];
      return n;
    });
  /** Applies a Cost Type / loan change and the fields that follow it. */
  const reprice = (p: Partial<FixedCostDraft>) => {
    const next = applyCostType({ ...d, ...p });
    patch({
      costType: next.costType,
      loan: next.loan,
      costValue: next.costValue,
      allocationBase: next.allocationBase,
      allocationUnit: next.allocationUnit,
    });
    clearPriceErrors();
  };
  const setCostType = (t: FixedCostType) =>
    t === d.costType
      ? undefined
      : reprice({
          costType: t,
          // Start the value fresh: a loan's interest or a daily amount means something else.
          costValue: 0,
          allocationBase: 1,
          allocationUnit: t === "Other" ? "Day" : "Year",
          allocationDays: t === "Loan Interest" ? 30 : d.allocationDays || 26,
          loan:
            t === "Loan Interest"
              ? (d.loan ?? { amount: 0, ratePct: 0, termMonths: 60, method: "Interest Only" })
              : null,
        });
  const setLoan = (p: Partial<LoanTerms>) => d.loan && reprice({ loan: { ...d.loan, ...p } });
  const calc = calcFixedCost({ ...d, exchangeRate: rateOf(d.currency) });

  /** Number input kept as text-friendly: empty string → 0 so validation flags it. */
  const numInput = (
    k: "allocationBase" | "allocationDays",
    extra: { disabled?: boolean } = {},
  ) => ({
    type: "number" as const,
    inputMode: "decimal" as const,
    min: 0,
    step: "any",
    value: d[k] === 0 ? "" : d[k],
    onChange: (e: { target: { value: string } }) => patch({ [k]: Number(e.target.value) || 0 }),
    "aria-invalid": !!errors[k] || undefined,
    ...extra,
  });
  const daysField = (disabled: boolean, loan = false) => (
    <Field
      label="Allocation Days"
      error={errors["allocationDays"]}
      className={S2}
      info={
        loan
          ? "Days per month for Month → Day: 30 counts interest on a 360-day year."
          : "Days per month for Month → Day (e.g. 26 working days)."
      }
    >
      <div className="flex items-center gap-2">
        <Input className={cn("w-16", NUM)} {...numInput("allocationDays", { disabled })} />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
    </Field>
  );
  const select = (
    k: "currency" | "allocationUnit",
    options: readonly string[],
    placeholder: string,
    labels: Record<string, string> = {},
  ): Parameters<typeof NativeSelect>[0] => ({
    value: d[k],
    onChange: (v) => patch({ [k]: v }),
    options: k === "currency" || k === "allocationUnit" ? options : ["", ...options],
    labels: { "": readOnly ? "—" : placeholder, ...labels },
    className: "h-10 w-full",
    invalid: !!errors[k],
  });

  const back = () =>
    source
      ? void navigate({
          to: "/fixed-cost/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/fixed-cost" });

  const save = () => {
    setFormError(null);
    try {
      const saved = fixedCostService.save(d, source?.id);
      guard.allowNext();
      toast.success(isNew ? `Fixed Cost ${saved.code} added` : `Fixed Cost ${saved.code} saved`);
      void navigate({ to: "/fixed-cost" });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const unitNote =
    "Cost Value ÷ Allocation Base, then Year → Month (÷ 12) → Day (÷ Allocation Days). Units larger than the one picked show “—”.";

  const unitLabel = d.allocationUnit;
  const rate = rateOf(d.currency);
  const preview = [
    `Allocation Value = ${fmtMoney(d.costValue, 2)} ${d.currency}${rate !== 1 ? ` × ${fmtMoney(rate)}` : ""} ÷ ${d.allocationBase || 0} = ${fmtMoney(calc.allocation, 2)} ₫ / ${unitLabel}`,
    ...(unitLabel === "Year" ? [`Month = Year ÷ 12 = ${fmtMoney(calc.month, 2)} ₫`] : []),
    ...(unitLabel !== "Day"
      ? [`Day = Month ÷ ${d.allocationDays || 0} days = ${fmtMoney(calc.day, 2)} ₫`]
      : []),
  ];

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Cost" },
          { label: "Fixed Cost", to: "/fixed-cost" },
          ...(source ? [{ label: source.code }] : []),
          { label: isNew ? "Add New" : readOnly ? "Detail" : "Edit" },
        ]}
        title={
          isNew
            ? "Create Fixed Cost"
            : readOnly
              ? `Fixed Cost Detail #${source.code}`
              : `Edit Fixed Cost #${source.code}`
        }
        subtitle={source?.name}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/fixed-cost" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          <>
            {!readOnly && (
              <StatusSelect
                value={d.status === "Active" ? "Active" : "Inactive"}
                onChange={(status) => patch({ status })}
              />
            )}
            {source && (
              <>
                <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4" />
                  History
                </Button>
                {readOnly && source.status === "Active" && (
                  <Button asChild size="lg">
                    <Link to="/fixed-cost/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <CollapsiblePanel title="Fixed Cost Detail">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              label="Fixed Cost Code"
              required
              error={errors["code"]}
              className={S3}
              info="Unique, upper-case. 2–30 characters: letters, digits, - or _."
            >
              <Input
                placeholder="Enter code"
                maxLength={30}
                value={d.code}
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Fixed Cost Name (EN)" required error={errors["name"]} className={S5}>
              <Input
                placeholder="Enter Fixed Cost Name (EN)"
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Fixed Cost Name (Local)" className={S4}>
              <Input
                placeholder="Enter Fixed Cost Name (Local)"
                value={d.localName}
                onChange={(e) => patch({ localName: e.target.value })}
              />
            </Field>
            <Field
              label="Fare Code"
              required
              error={errors["costDetailId"] ?? fareMiss(codeText)}
              className={S3}
              info="Type or pick a Fare Code or a Fare Name (Fare Code Management): the other one follows."
            >
              <SuggestInput
                value={codeText}
                onChange={typeCode}
                suggestions={details.map((c) => c.code)}
                hint={(code) => details.find((c) => c.code === code)?.name ?? ""}
                placeholder="Enter Fare Code"
                invalid={!!errors["costDetailId"] || !!fareMiss(codeText)}
                upper
                emptyText="No matching Fare Code"
              />
            </Field>
            <Field label="Fare Name" required error={fareMiss(nameText)} className={S5}>
              <SuggestInput
                value={nameText}
                onChange={typeName}
                suggestions={details.map((c) => c.name)}
                hint={(name) => details.find((c) => c.name === name)?.code ?? ""}
                placeholder="Enter Fare Name"
                invalid={!!errors["costDetailId"] || !!fareMiss(nameText)}
                emptyText="No matching Fare Name"
              />
            </Field>
            <Field
              label="Cost Type"
              required
              className={cn(S3, "lg:col-start-1")}
              info="Allocation: a value spread over a period (depreciation, insurance…). Loan Interest: the interest of a loan taken to buy the asset. Other: an amount per day, entered as is."
            >
              <NativeSelect
                value={d.costType}
                onChange={(v) => setCostType(v as FixedCostType)}
                options={FIXED_COST_TYPES}
                className="h-10 w-full"
              />
            </Field>
            {d.costType !== "Loan Interest" && (
              <Field
                label={d.costType === "Other" ? "Value / Day" : "Cost Value"}
                required
                error={errors["costValue"]}
                className={S4}
                hint={
                  d.currency !== "VND"
                    ? `1 ${d.currency} = ${fmtMoney(rate)} ₫ (exchange rate)`
                    : undefined
                }
              >
                <div className="flex gap-1.5">
                  <MoneyInput
                    value={d.costValue}
                    decimals={d.currency === "VND" ? 0 : 2}
                    onChange={(costValue) => patch({ costValue })}
                    invalid={!!errors["costValue"]}
                  />
                  <NativeSelect
                    {...select("currency", COST_CURRENCIES, "")}
                    className="h-10 w-[84px] shrink-0 pl-2.5 pr-7"
                  />
                </div>
              </Field>
            )}
            {d.costType === "Allocation" && (
              <>
                <Field
                  label="Allocation Base"
                  required
                  error={errors["allocationBase"] ?? errors["allocationUnit"]}
                  className={S3}
                  info={unitNote}
                >
                  <div className="flex gap-2">
                    <Input
                      placeholder="8"
                      className={cn("w-16", NUM)}
                      {...numInput("allocationBase")}
                    />
                    <NativeSelect
                      {...select("allocationUnit", withCurrent(units, d.allocationUnit), "Unit")}
                      className="h-10 flex-1"
                    />
                  </div>
                </Field>
                {daysField(d.allocationUnit === "Day")}
              </>
            )}
            {d.costType === "Loan Interest" && d.loan && (
              <>
                <Field label="Loan Amount" required error={errors["loanAmount"]} className={S4}>
                  <div className="flex gap-1.5">
                    <MoneyInput
                      value={d.loan.amount}
                      decimals={d.currency === "VND" ? 0 : 2}
                      onChange={(amount) => setLoan({ amount })}
                      invalid={!!errors["loanAmount"]}
                    />
                    <NativeSelect
                      {...select("currency", COST_CURRENCIES, "")}
                      className="h-10 w-[84px] shrink-0 pl-2.5 pr-7"
                    />
                  </div>
                </Field>
                <Field label="Interest Rate" required error={errors["loanRate"]} className={S3}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="6.8"
                      value={d.loan.ratePct || ""}
                      aria-invalid={!!errors["loanRate"] || undefined}
                      onChange={(e) => setLoan({ ratePct: Number(e.target.value) || 0 })}
                      className={cn("min-w-0 flex-1", NUM)}
                    />
                    <span className="whitespace-nowrap text-sm text-muted-foreground">%/year</span>
                  </div>
                </Field>
                <Field label="Loan Term" required error={errors["loanTerm"]} className={S2}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      placeholder="60"
                      value={d.loan.termMonths || ""}
                      aria-invalid={!!errors["loanTerm"] || undefined}
                      onChange={(e) => setLoan({ termMonths: Number(e.target.value) || 0 })}
                      className={cn("min-w-0 flex-1", NUM)}
                    />
                    <span className="text-sm text-muted-foreground">months</span>
                  </div>
                </Field>
                <Field
                  label="Repayment Method"
                  className={S3}
                  info="Annuity: the same payment every month. Equal Principal: the same principal every month plus interest on the balance, so payments go down. Interest Only: interest on the full amount every month, the principal at the end."
                >
                  <NativeSelect
                    value={d.loan.method}
                    onChange={(v) => setLoan({ method: v as RepaymentMethod })}
                    options={REPAYMENT_METHODS}
                    className="h-10 w-full"
                  />
                </Field>
                {daysField(false, true)}
                <LoanSummary schedule={loan} currency={d.currency} />
              </>
            )}
            <div className="sm:col-span-6 lg:col-span-12">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {(
                  [
                    ["Allocation Value", calc.allocation],
                    ["Year", calc.year],
                    ["Month", calc.month],
                    ["Day", calc.day],
                  ] as const
                ).map(([label, v]) => (
                  <div
                    key={label}
                    className={cn(
                      "rounded-lg border px-3.5 py-2.5",
                      label === "Day" && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className={cn("mt-0.5 text-lg font-semibold", NUM)}>
                      {fmtMoney(v, 0)}
                      {v != null && <span className="ml-1 text-xs font-normal">₫</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-6 lg:col-span-12">
              <div className="mb-1.5 text-sm font-semibold">Formula Preview</div>
              <div className="space-y-1 rounded-lg border bg-muted/40 px-4 py-3 font-mono text-[13px] leading-relaxed">
                {preview.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </div>
          </div>
        </CollapsiblePanel>
      </ReadOnlyScope>

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Fixed Cost"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}

/** "1200000,5" → "1.200.000,5" while typing (vi-VN grouping), and its number. */
const groupMoney = (s: string, decimals: number) => {
  const [int = "", ...rest] = s.replace(/[^\d,]/g, "").split(",");
  const comma = decimals > 0 && s.includes(",");
  const dec = rest.join("").slice(0, decimals);
  const n = Number(int || "0");
  return {
    text: (int ? n.toLocaleString("vi-VN") : comma ? "0" : "") + (comma ? `,${dec}` : ""),
    value: Number(`${n}.${dec || "0"}`),
  };
};
const moneyText = (v: number, decimals: number) =>
  v ? v.toLocaleString("vi-VN", { maximumFractionDigits: decimals }) : "";

/** Amount input with a dot every 3 digits (decimals after a comma for foreign currencies). */
function MoneyInput({
  value,
  onChange,
  decimals,
  invalid,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  decimals: number;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => moneyText(value, decimals));
  useEffect(() => {
    if (groupMoney(text, decimals).value !== value) setText(moneyText(value, decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  return (
    <Input
      inputMode="decimal"
      placeholder="0"
      value={text}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onChange={(e) => {
        const g = groupMoney(e.target.value, decimals);
        setText(g.text);
        onChange(g.value);
      }}
      className={cn("min-w-0 flex-1", NUM)}
    />
  );
}

/** Repayment of the loan: payment per month, totals and the month-by-month schedule. */
function LoanSummary({ schedule: s, currency }: { schedule: LoanSchedule; currency: string }) {
  const [open, setOpen] = useState(false);
  const cur = currency === "VND" ? "₫" : currency;
  const m = (v: number) => `${fmtMoney(v, 0)} ${cur}`;
  const monthly =
    Math.round(s.firstPayment) === Math.round(s.lastPayment)
      ? m(s.firstPayment)
      : `${m(s.firstPayment)} → ${m(s.lastPayment)}`;
  const cards: [string, string, boolean][] = [
    ["Monthly Payment", monthly, false],
    ["Total Payment", m(s.totalPayment), false],
    ["Total Interest (= Cost Value)", m(s.totalInterest), true],
  ];
  return (
    <div className="sm:col-span-6 lg:col-span-12">
      {/* Same 4-column grid as the Allocation Value / Year / Month / Day cards below. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, v, main], i) => (
          <div
            key={label}
            className={cn(
              "rounded-lg border px-3.5 py-2.5",
              i === 0 && "sm:col-span-2",
              main && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("mt-0.5 text-base font-semibold", NUM)}>
              {s.rows.length ? v : "—"}
            </div>
          </div>
        ))}
      </div>
      {s.rows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((x) => !x)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {open ? "Hide repayment schedule" : `Show repayment schedule (${s.rows.length} months)`}
          </button>
          {open && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    {["Month", "Payment", "Principal", "Interest", "Balance"].map((h) => (
                      <th
                        key={h}
                        className={cn(
                          "px-3 py-2 font-medium",
                          h === "Month" ? "text-left" : "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.month} className="border-t">
                      <td className="px-3 py-1.5">{r.month}</td>
                      {[r.payment, r.principal, r.interest, r.balance].map((v, i) => (
                        <td key={i} className={cn("px-3 py-1.5 text-right", NUM)}>
                          {fmtMoney(v, 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
