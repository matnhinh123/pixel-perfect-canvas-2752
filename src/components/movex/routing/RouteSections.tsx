import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Info, Plus, Trash2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, NativeSelect, Tag, thClass } from "@/components/movex/common";
import { LocationPicker } from "./LocationPicker";
import { emptyPoint } from "@/services/routeService";
import { stationsTotal, type LegFigures } from "@/services/cost/costMath";
import { uid } from "@/repositories/storage";
import { formatVnd } from "@/lib/format";
import {
  MANUAL_COST_TYPES,
  VEHICLE_GROUPS,
  VEHICLE_PROFILES,
  profileNeedsCapacity,
  type ManualCost,
  type ManualCostType,
  type RoutePoint,
  type RouteRecord,
  type TollStation,
  type VehicleGroup,
  type VehicleProfile,
} from "@/types";
import { cn } from "@/lib/utils";

// ---------- Waypoints ----------
export function WaypointEditor({
  points,
  onChange,
  label = "Waypoints",
  error,
  addLabel = "Add Waypoint",
}: {
  points: RoutePoint[];
  onChange: (p: RoutePoint[]) => void;
  label?: string;
  error?: string | undefined;
  addLabel?: string;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...points];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">
        {label} ({points.length})
      </span>
      {points.map((w, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="flex h-9 w-6 items-center justify-center text-xs font-bold text-primary">
            {i + 1}
          </span>
          <div className="flex-1">
            <LocationPicker
              value={w}
              onChange={(p) => onChange(points.map((x, j) => (j === i ? p : x)))}
              placeholder="Điểm dừng"
              invalid={!!error && !Number.isFinite(w.lat)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={i === 0}
            onClick={() => move(i, -1)}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={i === points.length - 1}
            onClick={() => move(i, 1)}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange(points.filter((_, j) => j !== i))}
            aria-label="Delete waypoint"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...points, emptyPoint()])}
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

// ---------- Vehicle ----------
export function VehiclePanel({
  r,
  set,
  errors,
}: {
  r: RouteRecord;
  set: <K extends keyof RouteRecord>(k: K, v: RouteRecord[K]) => void;
  errors: Record<string, string>;
}) {
  const heavy = profileNeedsCapacity(r.vehicleProfile);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          Vehicle Profile <span className="font-normal">(routing engine)</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Sent to the routing API (Vietmap <code>vehicle</code>) to choose legal roads and toll
              prices. Not used for MoveX cost rates.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {VEHICLE_PROFILES.map((v: VehicleProfile) => (
            <button
              key={v}
              type="button"
              onClick={() => set("vehicleProfile", v)}
              className={cn(
                "rounded-lg border px-2 py-3 text-xs font-semibold transition",
                r.vehicleProfile === v
                  ? "border-primary bg-accent text-accent-foreground"
                  : "hover:border-primary",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vehicle Group (MoveX business)" required hint="Drives cost rates & pricing">
          <NativeSelect
            value={r.vehicleGroup}
            onChange={(v) => set("vehicleGroup", v as VehicleGroup)}
            options={VEHICLE_GROUPS}
          />
        </Field>
        {heavy ? (
          <Field
            label="Capacity / Weight (kg)"
            required
            error={errors["capacityKg"]}
            hint="Mapped to Vietmap `capacity`"
          >
            <Input
              type="number"
              min={0}
              value={r.capacityKg ?? ""}
              aria-invalid={!!errors["capacityKg"] || undefined}
              onChange={(e) =>
                set("capacityKg", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </Field>
        ) : (
          <div className="flex items-end pb-2 text-xs text-muted-foreground">
            Capacity is only needed for Truck / Container.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Toll breakdown ----------
type Row = {
  key: string;
  leg: "Outbound" | "Return" | "Manual";
  t: TollStation;
  manualId?: string;
  note?: string;
};

export function TollBreakdown({
  outbound,
  ret,
  manualCosts,
  onAddManual,
  onRemoveManual,
  readOnly,
  footerExtra,
}: {
  outbound: LegFigures | null;
  ret: LegFigures | null;
  manualCosts: ManualCost[];
  onAddManual: () => void;
  onRemoveManual: (id: string) => void;
  readOnly?: boolean;
  footerExtra?: ReactNode;
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
                "Order",
                "Toll Station",
                "Fee Type",
                "Vehicle Toll Group",
                "Unit Price",
                "Pass Count",
                "Subtotal",
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
                    <Tag>{g === "Manual" ? "Manual" : g}</Tag>
                    <span className="ml-2 text-muted-foreground">
                      {g === "Manual"
                        ? "Manual costs (ferry, peak-hour surcharge, other)"
                        : `${items.length} station(s) · subtotal ${formatVnd(sub)}`}
                    </span>
                  </TableCell>
                </TableRow>,
                ...items.map((x) => (
                  <TableRow key={x.key}>
                    <TableCell>{++order}</TableCell>
                    <TableCell className="font-medium">
                      {x.t.name}
                      {x.note && (
                        <div className="text-xs font-normal text-muted-foreground">{x.note}</div>
                      )}
                      {x.t.positionApproximate && (
                        <div className="text-[10px] text-muted-foreground">position approx.</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {x.leg === "Manual"
                        ? manualCosts.find((m) => m.id === x.manualId)?.costType
                        : x.t.feeType}
                    </TableCell>
                    <TableCell>{x.t.vehicleTollGroup}</TableCell>
                    <TableCell>{formatVnd(x.t.price)}</TableCell>
                    <TableCell>{x.t.passCount}</TableCell>
                    <TableCell className="font-semibold">
                      {formatVnd(x.t.price * x.t.passCount)}
                    </TableCell>
                    <TableCell>
                      {x.t.source === "Mock" ? (
                        <span title="Mock provider data — shown as Vietmap source once VIETMAP_API_KEY is configured">
                          <Tag tone="Vietmap">Vietmap (mock)</Tag>
                        </span>
                      ) : (
                        <Tag>{x.t.source}</Tag>
                      )}
                    </TableCell>
                    <TableCell>
                      {x.manualId && !readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onRemoveManual(x.manualId!)}
                          aria-label="Remove manual cost"
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
                        ? "No manual cost."
                        : outbound
                          ? "No toll station on this leg."
                          : 'Click "Calculate Route" to get toll stations.'}
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
                {ret ? ` + Return ${formatVnd(retTotal)}` : ""} + Manual {formatVnd(manualTotal)}
              </TableCell>
              <TableCell colSpan={3} className="font-bold text-primary">
                Total Toll Cost: {formatVnd(outTotal + retTotal + manualTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {!readOnly ? (
          <Button variant="outline" size="sm" onClick={onAddManual}>
            <Plus className="h-4 w-4" />
            Add Manual Cost
          </Button>
        ) : (
          <span />
        )}
        {footerExtra}
      </div>
    </div>
  );
}

// ---------- Manual cost dialog ----------
export function ManualCostDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (m: ManualCost) => void;
}) {
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
    if (!f.reason.trim()) e["reason"] = "Reason is required.";
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
            Costs the routing engine cannot know, e.g. ferry, peak-hour surcharge.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cost Type" required>
            <NativeSelect
              value={f.costType}
              onChange={(v) => setF({ ...f, costType: v as ManualCostType })}
              options={MANUAL_COST_TYPES}
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
          <Field label="Note" className="col-span-2">
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

// ---------- Custom return toll editor ----------
export function CustomReturnEditor({
  value,
  onChange,
}: {
  value: LegFigures;
  onChange: (v: LegFigures) => void;
}) {
  const setStation = (i: number, patch: Partial<TollStation>) =>
    onChange({
      ...value,
      tollStations: value.tollStations.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Return Distance (km)" required>
          <Input
            type="number"
            min={0}
            step="0.1"
            value={value.distance}
            onChange={(e) => onChange({ ...value, distance: Number(e.target.value) })}
          />
        </Field>
        <Field label="Return Est. Time (min)" required>
          <Input
            type="number"
            min={0}
            value={value.estimatedTime}
            onChange={(e) => onChange({ ...value, estimatedTime: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="text-xs font-semibold text-muted-foreground">Return toll stations</div>
      {value.tollStations.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_70px_32px] items-center gap-2">
          <Input value={t.name} onChange={(e) => setStation(i, { name: e.target.value })} />
          <Input
            type="number"
            min={0}
            value={t.price}
            onChange={(e) => setStation(i, { price: Number(e.target.value), source: "Manual" })}
          />
          <Input
            type="number"
            min={1}
            value={t.passCount}
            onChange={(e) => setStation(i, { passCount: Math.max(1, Number(e.target.value)) })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              onChange({ ...value, tollStations: value.tollStations.filter((_, j) => j !== i) })
            }
            aria-label="Remove station"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onChange({
            ...value,
            tollStations: [
              ...value.tollStations,
              {
                id: uid("T-"),
                name: "Trạm mới",
                feeType: "Toll",
                price: 0,
                vehicleTollGroup: "—",
                passCount: 1,
                source: "Manual",
              },
            ],
          })
        }
      >
        <Plus className="h-4 w-4" />
        Add return toll station
      </Button>
    </div>
  );
}
