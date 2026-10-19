import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { useState, type ReactNode } from "react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, NativeSelect, Tag, thClass } from "@/components/movex/common";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { stationsTotal, type LegFigures } from "@/services/cost/costMath";
import { uid } from "@/repositories/storage";
import { formatVnd } from "@/lib/format";
import {
  MANUAL_COST_TYPES,
  type FeeType,
  type ManualCost,
  type LocationRecord,
  type ManualCostType,
  type RoutePoint,
  type TollStation,
} from "@/types";
import { cn } from "@/lib/utils";

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  Toll: "Toll",
  Bridge: "Bridge",
  Ferry: "Ferry",
  Gate: "Custom / Gate Fee",
  "Rural Road": "Rural Road",
};

// ---------- Stop list ----------
/** Column widths of the stop list; the Route Detail bar above it uses the same grid. */
export const STOP_COLUMNS = [
  ["No.", "10%"],
  ["Location", "18%"],
  ["Loc-Code", "24%"],
  ["Loc-Name", "38%"],
  ["Actions", "10%"],
] as const;
type StopKind = "origin" | "stop" | "destination";

export function StopBadge({ kind, index }: { kind: StopKind; index: number }) {
  const cls =
    kind === "origin" ? "bg-success" : kind === "destination" ? "bg-destructive" : "bg-primary";
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
        cls,
      )}
    >
      {kind === "origin" ? "A" : kind === "destination" ? "B" : index}
    </span>
  );
}

const toPoint = (l: LocationRecord, note?: string): RoutePoint => ({
  name: l.name,
  address: l.province,
  lat: l.lat,
  lng: l.lng,
  locationId: l.id,
  ...(note ? { note } : {}),
});
const emptyStop = (note?: string): RoutePoint => ({
  name: "",
  lat: NaN,
  lng: NaN,
  ...(note ? { note } : {}),
});

/** Type of a stop between Departure and Destination: Pickup / Delivery (default Delivery). */
export const STOP_TYPES = ["Pickup", "Delivery"] as const;
export const stopTypeOf = (p: RoutePoint) => (p.stopType === "Pickup" ? "Pickup" : "Delivery");

/** What a row keeps when its location changes: note and the chosen Type. */
const extras = (p: RoutePoint) => ({
  ...(p.note ? { note: p.note } : {}),
  ...(p.stopType !== undefined ? { stopType: p.stopType } : {}),
});

/**
 * The sequence [origin, ...waypoints, destination] edited in place. Every row uses the same
 * LocationAutocomplete. Waypoints can be reordered (drag handle or the row menu) and deleted;
 * origin and destination stay first/last and cannot be deleted. With `lockEndpoints` the endpoints
 * are read-only (custom return leg: B → … → A).
 */
export function StopList({
  seq,
  onChange,
  locations,
  errors,
  lockEndpoints,
  returnPoint,
}: {
  seq: RoutePoint[];
  onChange: (seq: RoutePoint[]) => void;
  locations: LocationRecord[];
  errors?: {
    origin?: string | undefined;
    destination?: string | undefined;
    waypoints?: string | undefined;
  };
  lockEndpoints?: boolean;
  /** Round trip: a last, read-only "Return" row that always mirrors the Departure. */
  returnPoint?: RoutePoint | undefined;
}) {
  const stopTypes = useCodeOptions(CC.STOP_TYPE, STOP_TYPES);
  const [armed, setArmed] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const last = seq.length - 1;
  const isStop = (i: number) => i > 0 && i < last;

  const update = (i: number, p: RoutePoint) => onChange(seq.map((x, j) => (j === i ? p : x)));
  const move = (from: number, to: number) => {
    if (!isStop(from) || !isStop(to) || from === to) return;
    const next = [...seq];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };
  const reset = () => {
    setArmed(null);
    setDragFrom(null);
    setOver(null);
  };

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {STOP_COLUMNS.map(([h, w], i) => (
            <TableHead
              key={i}
              style={{ width: w }}
              className={cn(
                "h-10 text-sm font-semibold text-foreground",
                (i === 0 || i === 4) && "text-center",
                // Line up with the code input text (starts 17px in); Location starts with its badge.
                i === 2 && "pl-[17px]",
              )}
            >
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {seq.map((p, i) => {
          const kind: StopKind = i === 0 ? "origin" : i === last ? "destination" : "stop";
          const locked = lockEndpoints && kind !== "stop";
          const invalid =
            (kind === "origin" && !!errors?.origin) ||
            (kind === "destination" && !!errors?.destination) ||
            (kind === "stop" && !!errors?.waypoints && !Number.isFinite(p.lat));
          return (
            <TableRow
              key={i}
              draggable={armed === i}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                if (dragFrom === null || !isStop(i)) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                reset();
              }}
              onDragEnd={reset}
              className={cn(
                over === i && dragFrom !== null && dragFrom !== i && "bg-accent",
                dragFrom === i && "opacity-50",
              )}
            >
              <TableCell className="text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  {kind === "stop" ? (
                    <span
                      className="flex cursor-grab items-center active:cursor-grabbing"
                      onMouseDown={() => setArmed(i)}
                      onMouseUp={() => setArmed(null)}
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  ) : (
                    <GripVertical className="h-4 w-4 opacity-20" />
                  )}
                  {i + 1}
                </span>
              </TableCell>
              <TableCell className="py-1.5">
                {/* Badge (A / stop number / B) next to the row's role. First / last rows are always
                    Departure / Destination; locked endpoints = return leg, which runs B → A. */}
                <span className="flex items-center gap-2">
                  <StopBadge
                    kind={locked ? (kind === "origin" ? "destination" : "origin") : kind}
                    index={i}
                  />
                  {kind === "stop" ? (
                    <NativeSelect
                      value={stopTypeOf(p)}
                      onChange={(v) => update(i, { ...p, stopType: v })}
                      options={withCurrent(stopTypes, stopTypeOf(p))}
                      className="h-8 min-w-0 flex-1 px-2"
                    />
                  ) : (
                    <span className="text-sm">
                      {kind === "origin" ? "Departure" : "Destination"}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="py-1.5">
                {locked ? (
                  <span className="block px-2 text-sm">
                    {locations.find((l) => l.id === p.locationId)?.code ?? "—"}
                  </span>
                ) : (
                  <LocationAutocomplete
                    inline
                    field="code"
                    locations={locations}
                    value={p.locationId ?? null}
                    onChange={(l) => update(i, { ...(l ? toPoint(l) : emptyStop()), ...extras(p) })}
                    invalid={invalid}
                    placeholder="Code…"
                  />
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {locked ? (
                  <span className="block px-2 text-sm">{p.name || "—"}</span>
                ) : (
                  <LocationAutocomplete
                    inline
                    locations={locations}
                    value={p.locationId ?? null}
                    {...(p.locationId ? {} : { fallbackLabel: p.name })}
                    onChange={(l) => update(i, { ...(l ? toPoint(l) : emptyStop()), ...extras(p) })}
                    invalid={invalid}
                    placeholder="Search location…"
                  />
                )}
              </TableCell>
              <TableCell className="text-center">
                {locked ? (
                  <span className="text-muted-foreground">--</span>
                ) : (
                  // One click: a stop is removed; Departure / Destination (always kept) are cleared.
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-destructive"
                    disabled={kind !== "stop" && !p.name}
                    title={kind === "stop" ? "Remove stop" : "Clear location"}
                    aria-label={kind === "stop" ? "Remove stop" : "Clear location"}
                    onClick={() =>
                      kind === "stop"
                        ? onChange(seq.filter((_, j) => j !== i))
                        : update(i, { ...emptyStop(), ...extras(p) })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {returnPoint && (
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableCell className="text-center text-muted-foreground">{seq.length + 1}</TableCell>
            <TableCell className="py-1.5">
              <span className="flex items-center gap-2" title="Same as Departure">
                <StopBadge kind="origin" index={0} />
                <span className="text-sm">Return</span>
              </span>
            </TableCell>
            <TableCell className="pl-[17px] text-sm text-muted-foreground">
              {locations.find((l) => l.id === returnPoint.locationId)?.code ?? "—"}
            </TableCell>
            <TableCell className="py-1.5">
              <span className="block truncate px-2 text-sm" title="Same as Departure">
                {returnPoint.name || "—"}
              </span>
            </TableCell>
            <TableCell className="text-center text-muted-foreground">—</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ---------- Round trip: Outbound on top, Return Trip below ----------
function TripSection({
  title,
  tone,
  action,
  children,
}: {
  title: string;
  tone: "Outbound" | "Return";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
        <Tag tone={tone}>{title}</Tag>
        {action}
      </div>
      {children}
    </div>
  );
}

const addStopButton = (onClick: () => void) => (
  <Button
    variant="outline"
    size="sm"
    className="h-8 border-primary/40 text-primary"
    onClick={onClick}
  >
    <Plus className="h-4 w-4" />
    Add
  </Button>
);

export function RoundTripStops({
  seq,
  onSeqChange,
  onAddStop,
  errors,
  mode,
  onModeChange,
  returnSeq,
  onReturnSeqChange,
  locations,
}: {
  seq: RoutePoint[];
  onSeqChange: (seq: RoutePoint[]) => void;
  onAddStop: () => void;
  errors?: {
    origin?: string | undefined;
    destination?: string | undefined;
    waypoints?: string | undefined;
  };
  mode: "auto" | "custom";
  onModeChange: (m: "auto" | "custom") => void;
  /** Custom return route: start (B by default) → return stops → end (A by default). */
  returnSeq: RoutePoint[];
  onReturnSeqChange: (seq: RoutePoint[]) => void;
  locations: LocationRecord[];
}) {
  const origin = seq[0]!;
  const destination = seq[seq.length - 1]!;
  return (
    <div className="divide-y">
      <TripSection title="Outbound" tone="Outbound" action={addStopButton(onAddStop)}>
        <StopList
          seq={seq}
          onChange={onSeqChange}
          locations={locations}
          {...(errors ? { errors } : {})}
        />
      </TripSection>
      <TripSection
        title="Return Trip"
        tone="Return"
        action={
          mode === "custom"
            ? addStopButton(() =>
                onReturnSeqChange([
                  ...returnSeq.slice(0, -1),
                  emptyStop(),
                  returnSeq[returnSeq.length - 1]!,
                ]),
              )
            : undefined
        }
      >
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-2.5 text-sm"
          role="radiogroup"
        >
          {(
            [
              ["auto", "Same route reversed"],
              ["custom", "Custom return route"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="returnMode"
                checked={mode === v}
                onChange={() => onModeChange(v)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className={cn(mode === v && "text-primary")}>{label}</span>
            </label>
          ))}
        </div>
        {mode === "auto" ? (
          <div className="flex flex-col gap-2 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <StopBadge kind="destination" index={0} />B – {destination.name || "—"}
            </span>
            <span className="flex items-center gap-2">
              <StopBadge kind="origin" index={0} />A – {origin.name || "—"}
            </span>
            <span className="text-xs text-muted-foreground">Same route as outbound, reversed.</span>
          </div>
        ) : (
          <StopList seq={returnSeq} onChange={onReturnSeqChange} locations={locations} />
        )}
      </TripSection>
    </div>
  );
}

// ---------- Toll / ferry cost breakdown (MD-06 detail drawer) ----------
type Row = {
  key: string;
  leg: "Outbound" | "Return" | "Manual";
  t: TollStation;
  manualId?: string;
  note?: string;
};
const LEG_LABEL = { Outbound: "Outbound", Return: "Return Trip", Manual: "Manual costs" } as const;

export function TollBreakdown({
  outbound,
  ret,
  manualCosts,
  onAddManual,
  onRemoveManual,
}: {
  outbound: LegFigures | null;
  ret: LegFigures | null;
  manualCosts: ManualCost[];
  /** Omitted = no "Add Manual Cost" button (existing manual costs are still listed). */
  onAddManual?: () => void;
  onRemoveManual: (id: string) => void;
}) {
  const rows: Row[] = [
    ...(outbound?.tollStations ?? []).map((t, i) => ({
      key: `o-${i}`,
      leg: "Outbound" as const,
      t,
    })),
    ...(ret?.tollStations ?? []).map((t, i) => ({ key: `r-${i}`, leg: "Return" as const, t })),
    ...manualCosts.map((m) => ({
      key: m.id,
      leg: "Manual" as const,
      manualId: m.id,
      ...(m.note ? { note: m.note } : {}),
      t: {
        id: m.id,
        name: m.reason,
        feeType: m.costType === "Ferry" ? ("Ferry" as const) : ("Toll" as const),
        price: m.amount,
        vehicleTollGroup: "—",
        passCount: 1,
        source: "Manual" as const,
      },
    })),
  ];
  const manualTotal = manualCosts.reduce((s, m) => s + m.amount, 0);
  const outTotal = outbound ? stationsTotal(outbound.tollStations) : 0;
  const retTotal = ret ? stationsTotal(ret.tollStations) : 0;
  let order = 0;
  const groups: Row["leg"][] = ["Outbound", "Return", "Manual"];

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "No.",
                "Toll Station",
                "Fee Type",
                "Vehicle Class",
                "Unit Price",
                "Passes",
                "Amount",
                "Source",
                "",
              ].map((h) => (
                <TableHead key={h} className={thClass}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const items = rows.filter((x) => x.leg === g);
              if (g === "Return" && !ret) return null;
              const sub = g === "Outbound" ? outTotal : g === "Return" ? retTotal : manualTotal;
              return [
                <TableRow key={`h-${g}`} className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={9} className="py-1.5 text-xs font-semibold">
                    <Tag tone={g === "Manual" ? "Manual" : g}>{LEG_LABEL[g]}</Tag>
                    <span className="ml-2 text-muted-foreground">
                      {g === "Manual"
                        ? "Ferry, peak-hour surcharge, other costs"
                        : `${items.length} stations · subtotal ${formatVnd(sub)}`}
                    </span>
                  </TableCell>
                </TableRow>,
                ...items.map((x) => (
                  <TableRow key={x.key}>
                    <TableCell>{++order}</TableCell>
                    <TableCell className="font-medium">
                      {x.t.code && <span className="mr-1 text-primary">{x.t.code}</span>}
                      {x.t.name}
                      {x.note && (
                        <div className="text-xs font-normal text-muted-foreground">{x.note}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {x.leg === "Manual"
                        ? manualCosts.find((m) => m.id === x.manualId)?.costType
                        : FEE_TYPE_LABEL[x.t.feeType]}
                    </TableCell>
                    <TableCell>{x.t.vehicleTollGroup}</TableCell>
                    <TableCell>{formatVnd(x.t.price)}</TableCell>
                    <TableCell>{x.t.passCount}</TableCell>
                    <TableCell className="font-semibold">
                      {formatVnd(x.t.price * x.t.passCount)}
                    </TableCell>
                    <TableCell>
                      {x.t.source === "Mock" ? (
                        <Tag tone="Vietmap">Vietmap (mock)</Tag>
                      ) : (
                        <Tag>{x.t.source}</Tag>
                      )}
                    </TableCell>
                    <TableCell>
                      {x.manualId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onRemoveManual(x.manualId!)}
                          aria-label="Remove cost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )),
                items.length === 0 && (
                  <TableRow key={`e-${g}`}>
                    <TableCell
                      colSpan={9}
                      className="py-3 text-center text-xs text-muted-foreground"
                    >
                      {g === "Manual"
                        ? "No manual costs yet."
                        : outbound
                          ? "No toll stations on this leg."
                          : 'Click "Calculate Route" to load toll stations.'}
                    </TableCell>
                  </TableRow>
                ),
              ];
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} className="text-right text-xs text-muted-foreground">
                Outbound {formatVnd(outTotal)}
                {ret ? ` + Return Trip ${formatVnd(retTotal)}` : ""} + Manual{" "}
                {formatVnd(manualTotal)}
              </TableCell>
              <TableCell colSpan={3} className="font-bold text-primary">
                Total Toll Cost: {formatVnd(outTotal + retTotal + manualTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {onAddManual && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onAddManual}>
          <Plus className="h-4 w-4" />
          Add Manual Cost
        </Button>
      )}
    </div>
  );
}

export function ManualCostDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (m: ManualCost) => void;
}) {
  const costTypes = useCodeOptions(CC.MANUAL_COST_TYPE, MANUAL_COST_TYPES);
  const [f, setF] = useState({
    costType: "Ferry" as ManualCostType,
    amount: "",
    reason: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => {
    const e: Record<string, string> = {};
    const amt = Number(f.amount);
    if (!f.amount || !(amt > 0)) e["amount"] = "Amount must be greater than 0.";
    if (!f.reason.trim()) e["reason"] = "Please enter a reason.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onAdd({
      id: uid("MC-"),
      costType: f.costType,
      amount: amt,
      reason: f.reason.trim(),
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
    });
    setF({ costType: "Ferry", amount: "", reason: "", note: "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Cost</DialogTitle>
          <DialogDescription>
            Costs the routing engine does not know: ferry, peak-hour surcharge, other.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cost Type" required>
            <NativeSelect
              value={f.costType}
              onChange={(v) => setF({ ...f, costType: v as ManualCostType })}
              options={withCurrent(costTypes, f.costType)}
            />
          </Field>
          <Field label="Amount (₫)" required error={errors["amount"]}>
            <Input
              type="number"
              min={0}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </Field>
          <Field label="Reason" required error={errors["reason"]} className="col-span-2">
            <Input
              value={f.reason}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
              placeholder="VD: Ferry surcharge"
            />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea
              rows={2}
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
