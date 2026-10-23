// Variable Cost › Salary Range: the driver salary tiers of one vehicle type and how they are read
// (rounding, Highland surcharge), each under its own code (a COGS reads the one of its vehicle type).
import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Plus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, NativeSelect, StatusBadge, thClass } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { statusFilter, updatedAtColumn } from "@/components/movex/cost/listParts";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useCollection } from "@/hooks/use-store";
import { salaryRangeRepository } from "@/repositories";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { BusinessRuleError } from "@/services/crudService";
import {
  DEFAULT_RULE,
  ruleOf,
  scaleTiers,
  tripSalaryOf,
  validateTiers,
  type CalcRule,
} from "@/services/cost/salaryRange";
import {
  salaryRangeCrud,
  salaryRangeService,
  sanitizeSetupCode,
  type SalaryRangeDraft,
} from "@/services/cost/variableSetup";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalaryRangeRecord, SalaryTier } from "@/types";

const ruleText = (r: CalcRule) =>
  `${r.roundStep ? `Round up ${formatNumber(r.roundStep)}` : "No rounding"} · ${r.regionOn ? `Highland +${formatNumber(r.regionAmount)}` : "No Highland"}`;

export function SalaryRangeTab() {
  const all = useCollection(salaryRangeRepository);
  const types = useVehicleTypes();
  const [open, setOpen] = useState<SalaryRangeRecord | "new" | null>(null);
  const rows = useMemo(
    () => all.filter((r) => !r.deleted).sort((a, b) => a.code.localeCompare(b.code)),
    [all],
  );
  const typeKeys = types.map((t) => t.key);
  const columns = useMemo<ListColumn<SalaryRangeRecord>[]>(
    () => [
      {
        key: "code",
        width: 130,
        label: "Salary Range Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      { key: "name", width: 240, label: "Salary Range Name", type: "text", value: (r) => r.name },
      {
        key: "vehicleType",
        width: 190,
        label: "Vehicle Type",
        type: "enum",
        options: typeKeys,
        value: (r) => r.vehicleType,
        render: (r) => (
          <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {r.vehicleType}
          </span>
        ),
      },
      {
        key: "tiers",
        width: 170,
        label: "Tiers",
        type: "text",
        value: (r) => `${r.tiers.length} tiers`,
        render: (r) =>
          `${r.tiers.length} tiers · 0 – ${formatNumber(r.tiers[r.tiers.length - 1]?.to ?? 0)} km`,
      },
      {
        key: "rule",
        width: 220,
        label: "Calculation Rule",
        type: "text",
        value: (r) => ruleText(ruleOf(r.rule)),
      },
      {
        key: "status",
        width: 110,
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (r) => r.status,
        render: (r) => <StatusBadge status={r.status} />,
      },
      updatedAtColumn<SalaryRangeRecord>(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeKeys.join("|")],
  );

  return (
    <div className="space-y-4">
      <EntityListPage<SalaryRangeRecord>
        embedded
        lang="en"
        screen="salary-range"
        entityType="Salary Range"
        entityLabel="Salary Range"
        title="Salary Range"
        rows={rows}
        columns={columns}
        searchPlaceholder="Search code, name, vehicle type..."
        searchValues={(r) => [r.code, r.name, r.vehicleType]}
        quickFilters={[
          {
            key: "vehicleType",
            allLabel: "All vehicle types",
            options: typeKeys.map((v) => ({
              label: v,
              conditions: [{ field: "vehicleType", operator: "eq", value: v }],
            })),
          },
          statusFilter,
        ]}
        crud={salaryRangeCrud}
        readOnlyReason="Import is not available for salary ranges yet"
        bordered
        addLabel="Add Salary Range"
        onAdd={() => setOpen("new")}
        onView={(r) => setOpen(r)}
        onEdit={(r) => setOpen(r)}
      />
      {open && (
        <SalaryRangeDialog
          key={open === "new" ? "new" : open.id}
          source={open === "new" ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Salary Range form

function SalaryRangeDialog({
  source,
  onClose,
}: {
  source: SalaryRangeRecord | null;
  onClose: () => void;
}) {
  const types = useVehicleTypes();
  const all = useCollection(salaryRangeRepository);
  const [d, setD] = useState<SalaryRangeDraft>({
    code: source?.code ?? "",
    name: source?.name ?? "",
    vehicleType: source?.vehicleType ?? "",
    tiers: source ? source.tiers.map((t) => ({ ...t })) : [],
    rule: { ...ruleOf(source?.rule ?? DEFAULT_RULE) },
    remark: source?.remark ?? "",
    status: source?.status === "Inactive" ? "Inactive" : "Active",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copyFrom, setCopyFrom] = useState("");
  const [pct, setPct] = useState({ salary: "15", extra: "15" });
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
  // Example under this rule: 60 km on the tiers being edited.
  const ruleOk = d.rule.roundStep >= 0 && (!d.rule.regionOn || d.rule.regionAmount >= 0);
  const example =
    check.ok && ruleOk ? tripSalaryOf(d.tiers, 60, undefined, undefined, { rule: d.rule }) : null;
  const others = all.filter((r) => !r.deleted && r.id !== source?.id);

  const setTier = (i: number, k: keyof SalaryTier, v: string) =>
    patch({
      tiers: d.tiers.map((t, j) => (j === i ? { ...t, [k]: v === "" ? NaN : Number(v) } : t)),
    });
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
          roadSupportFee: last?.roadSupportFee ?? 0,
        },
      ],
    });
  };
  const applyCopy = () => {
    const src = others.find((r) => r.id === copyFrom);
    if (!src) return;
    if (
      d.tiers.length &&
      !window.confirm(`Replace the ${d.tiers.length} tiers with ${src.code}'s?`)
    )
      return;
    patch({ tiers: scaleTiers(src.tiers, Number(pct.salary) || 0, Number(pct.extra) || 0) });
    toast.success(`Tiers copied from ${src.code}`);
  };

  const save = () => {
    try {
      const rec = salaryRangeService.save(d, source?.id);
      toast.success(`${rec.code} ${source ? "saved" : "added"}`);
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
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{source ? `Salary Range · ${source.code}` : "Add Salary Range"}</DialogTitle>
          <DialogDescription>
            The driver salary tiers of one vehicle type. A COGS of that vehicle type reads its Trip
            Salary and Road Support Fee from here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <Field
            label="Salary Range Code"
            required
            error={errors["code"]}
            className="sm:col-span-3"
            hint={`${d.code.length}/20`}
            info="Unique, auto-uppercase. A–Z, 0–9, . - _ no spaces (max 20 characters)."
          >
            <Input
              value={d.code}
              maxLength={20}
              placeholder="Enter Code"
              onChange={(e) => patch({ code: sanitizeSetupCode(e.target.value) })}
              aria-invalid={!!errors["code"] || undefined}
            />
          </Field>
          <Field
            label="Salary Range Name"
            required
            error={errors["name"]}
            className="sm:col-span-6"
          >
            <Input
              value={d.name}
              maxLength={200}
              placeholder="Enter Name"
              onChange={(e) => patch({ name: e.target.value })}
              aria-invalid={!!errors["name"] || undefined}
            />
          </Field>
          <Field label="Status" className="sm:col-span-3">
            <NativeSelect
              value={d.status}
              onChange={(v) => patch({ status: v as SalaryRangeDraft["status"] })}
              options={["Active", "Inactive"]}
              className="h-10 w-full"
            />
          </Field>
          <Field
            label="Vehicle Type"
            required
            error={errors["vehicleType"]}
            className="sm:col-span-12"
            info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer)."
          >
            <VehicleTypePicker
              value={d.vehicleType}
              onChange={(vehicleType) => patch({ vehicleType })}
              types={types}
              invalid={!!errors["vehicleType"]}
            />
          </Field>
        </div>

        <section className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-2.5">
            <div className="text-sm font-semibold">Calculation Rule</div>
            <p className="text-xs text-muted-foreground">
              Trip salary = tier salary + extra rate × (standard km − tier start), rounded up.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-12">
            <Field
              label="Round up to (đ)"
              error={errors["roundStep"] || undefined}
              className="sm:col-span-4"
              info="The trip salary is rounded up to a multiple of this. 0 = no rounding."
            >
              <Input
                inputMode="numeric"
                value={ruleNum(d.rule.roundStep)}
                onChange={(e) => setRule({ roundStep: toNum(e.target.value) })}
                className="text-right tabular-nums"
                aria-invalid={!!errors["roundStep"] || undefined}
              />
            </Field>
            <Field
              label="Highland (Tây Nguyên) surcharge (đ)"
              error={errors["regionAmount"] || undefined}
              className="sm:col-span-8"
              info="Added to the road support fee of routes whose Terrain = Highland in Routing."
            >
              <div className="flex items-center gap-3">
                <label className="flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm">
                  <Checkbox
                    checked={d.rule.regionOn}
                    onCheckedChange={(v) => setRule({ regionOn: v === true })}
                  />
                  Apply
                </label>
                <Input
                  inputMode="numeric"
                  disabled={!d.rule.regionOn}
                  value={ruleNum(d.rule.regionAmount)}
                  onChange={(e) => setRule({ regionAmount: toNum(e.target.value) })}
                  className="w-48 text-right tabular-nums"
                  aria-invalid={!!errors["regionAmount"] || undefined}
                />
              </div>
            </Field>
            <p className="text-xs tabular-nums text-muted-foreground sm:col-span-12">
              {example
                ? `Example · 60 km: ${example.basis}`
                : "Example · 60 km: enter valid tiers and rule values to see it."}
            </p>
          </div>
        </section>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="text-sm font-semibold">
              Tiers <span className="text-destructive">*</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Copy tiers from">
                <NativeSelect
                  value={copyFrom}
                  onChange={setCopyFrom}
                  options={["", ...others.map((r) => r.id)]}
                  labels={{
                    "": "Select Salary Range",
                    ...Object.fromEntries(
                      others.map((r) => [r.id, `${r.code} · ${r.vehicleType}`]),
                    ),
                  }}
                  className="h-9 w-64"
                />
              </Field>
              <Field label="Salary +%">
                <Input
                  inputMode="numeric"
                  value={pct.salary}
                  onChange={(e) =>
                    setPct((p) => ({ ...p, salary: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                  className="h-9 w-20 text-right tabular-nums"
                />
              </Field>
              <Field label="Extra rate +%">
                <Input
                  inputMode="numeric"
                  value={pct.extra}
                  onChange={(e) =>
                    setPct((p) => ({ ...p, extra: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                  className="h-9 w-20 text-right tabular-nums"
                />
              </Field>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={!copyFrom}
                onClick={applyCopy}
              >
                Copy
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={addTier}>
                <Plus className="h-4 w-4" />
                Add Tier
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            E.g. a reefer container: copy the dry container's tiers with salary +15 % (road support
            fee stays the same), then adjust.
          </p>
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
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
          <TierTable
            rows={d.tiers}
            renderRow={(t, i) => (
              <>
                <TableCell className="py-1.5 text-sm">Tier {i + 1}</TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-1">
                    <NumInput
                      value={t.from}
                      onChange={(v) => setTier(i, "from", v)}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">–</span>
                    <NumInput value={t.to} onChange={(v) => setTier(i, "to", v)} className="w-20" />
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <NumInput value={t.tripSalary} onChange={(v) => setTier(i, "tripSalary", v)} />
                </TableCell>
                <TableCell className="py-1.5">
                  <NumInput value={t.extraRate} onChange={(v) => setTier(i, "extraRate", v)} />
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
              </>
            )}
          />
        </div>

        <Field label="Remark">
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="Enter Remark"
            value={d.remark}
            onChange={(e) => patch({ remark: e.target.value })}
          />
        </Field>

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

function TierTable({
  rows,
  renderRow,
}: {
  rows: SalaryTier[];
  renderRow: (t: SalaryTier, i: number) => ReactNode;
}) {
  return (
    <div className="max-h-[360px] overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(thClass, "w-20")}>Tier</TableHead>
            <TableHead className={cn(thClass, "w-56")}>Distance (km)</TableHead>
            <TableHead className={thClass}>Trip Salary</TableHead>
            <TableHead className={thClass}>Extra Distance Rate (đ/km)</TableHead>
            <TableHead className={thClass}>Road Support Fee</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className={cn("py-6 text-center text-xs text-muted-foreground")}
              >
                No tier yet — add one with “Add Tier” or copy them from another Salary Range.
              </TableCell>
            </TableRow>
          )}
          {rows.map((t, i) => (
            <TableRow key={i}>{renderRow(t, i)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: string) => void;
  className?: string;
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
