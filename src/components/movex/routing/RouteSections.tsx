import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Toll: "Cầu đường",
  Bridge: "Cầu đường",
  Ferry: "Phà",
};

// ---------- Stop list (Danh sách điểm dừng) ----------
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
  labels,
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
  labels?: { origin: string; destination: string };
}) {
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
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {["", "#", "Loại điểm", "Địa điểm", "Địa chỉ / Ghi chú", "Thao tác"].map((h, i) => (
            <TableHead
              key={i}
              className={cn(
                "h-10 text-sm font-semibold text-foreground",
                (i === 1 || i === 5) && "text-center",
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
              <TableCell className="w-8 text-muted-foreground">
                {kind === "stop" ? (
                  <span
                    className="flex cursor-grab items-center active:cursor-grabbing"
                    onMouseDown={() => setArmed(i)}
                    onMouseUp={() => setArmed(null)}
                    title="Kéo để đổi thứ tự điểm dừng"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                ) : (
                  <GripVertical className="h-4 w-4 opacity-20" />
                )}
              </TableCell>
              <TableCell className="w-10 text-center text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="w-28 whitespace-nowrap">
                {kind === "origin"
                  ? (labels?.origin ?? "Điểm đi")
                  : kind === "destination"
                    ? (labels?.destination ?? "Điểm đến")
                    : "Điểm dừng"}
              </TableCell>
              <TableCell className="min-w-56 py-1.5">
                <span className="flex items-center gap-2">
                  {/* Locked endpoints = return leg, which runs B → A. */}
                  <StopBadge
                    kind={locked ? (kind === "origin" ? "destination" : "origin") : kind}
                    index={i}
                  />
                  <span className="min-w-0 flex-1">
                    {locked ? (
                      <span className="block px-2 text-sm">{p.name || "—"}</span>
                    ) : (
                      <LocationAutocomplete
                        inline
                        locations={locations}
                        value={p.locationId ?? null}
                        {...(p.locationId ? {} : { fallbackLabel: p.name })}
                        onChange={(l) => update(i, l ? toPoint(l, p.note) : emptyStop(p.note))}
                        invalid={invalid}
                        placeholder={
                          kind === "origin"
                            ? "Gõ để tìm điểm đi…"
                            : kind === "destination"
                              ? "Gõ để tìm điểm đến…"
                              : "Gõ để tìm điểm dừng…"
                        }
                      />
                    )}
                  </span>
                </span>
              </TableCell>
              <TableCell className="py-1.5">
                <Input
                  value={p.note ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const { note: _drop, ...rest } = p;
                    update(i, e.target.value ? { ...rest, note: e.target.value } : rest);
                  }}
                  placeholder={p.address || "Ghi chú"}
                  className="h-9 border-transparent bg-transparent shadow-none placeholder:text-muted-foreground hover:border-input focus-visible:bg-card disabled:cursor-default disabled:opacity-100"
                />
              </TableCell>
              <TableCell className="w-20 text-center">
                {locked ? (
                  <span className="text-muted-foreground">--</span>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Thao tác điểm"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {kind === "stop" ? (
                        <>
                          <DropdownMenuItem disabled={i <= 1} onSelect={() => move(i, i - 1)}>
                            <ArrowUp className="h-4 w-4" />
                            Di chuyển lên
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={i >= last - 1}
                            onSelect={() => move(i, i + 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                            Di chuyển xuống
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onChange(seq.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                            Xoá điểm dừng
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          disabled={!p.name}
                          onSelect={() => update(i, emptyStop(p.note))}
                        >
                          <X className="h-4 w-4" />
                          Bỏ chọn địa điểm
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ---------- Round trip: return leg (Chiều về) ----------
export function ReturnRouteSection({
  mode,
  onModeChange,
  origin,
  waypoints,
  destination,
  returnWaypoints,
  onReturnWaypointsChange,
  locations,
}: {
  mode: "auto" | "custom";
  onModeChange: (m: "auto" | "custom") => void;
  origin: RoutePoint;
  waypoints: RoutePoint[];
  destination: RoutePoint;
  returnWaypoints: RoutePoint[];
  onReturnWaypointsChange: (w: RoutePoint[]) => void;
  locations: LocationRecord[];
}) {
  const reversed = [destination, ...[...waypoints].reverse(), origin];
  const custom = [destination, ...returnWaypoints, origin];
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Tag tone="Return">Return</Tag>
          Chiều về
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm" role="radiogroup">
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
      </div>
      {mode === "auto" ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
          {reversed.map((p, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <StopBadge
                kind={i === 0 ? "destination" : i === reversed.length - 1 ? "origin" : "stop"}
                index={i}
              />
              <span>{p.name || "—"}</span>
            </span>
          ))}
        </div>
      ) : (
        <>
          <StopList
            seq={custom}
            onChange={(next) => onReturnWaypointsChange(next.slice(1, -1))}
            locations={locations}
            lockEndpoints
            labels={{ origin: "Điểm đi (B)", destination: "Điểm về (A)" }}
          />
          <div className="px-4 pb-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/40 text-primary"
              onClick={() => onReturnWaypointsChange([...returnWaypoints, emptyStop()])}
            >
              <Plus className="h-4 w-4" />
              Thêm điểm dừng chiều về
            </Button>
          </div>
        </>
      )}
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
const LEG_LABEL = { Outbound: "Chiều đi", Return: "Chiều về", Manual: "Chi phí thủ công" } as const;

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
  onAddManual: () => void;
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
                "Thứ tự",
                "Trạm thu phí",
                "Loại phí",
                "Nhóm xe",
                "Đơn giá",
                "Số lượt",
                "Thành tiền",
                "Nguồn",
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
                        ? "Phà, phụ phí giờ cao điểm, chi phí khác"
                        : `${items.length} trạm · tạm tính ${formatVnd(sub)}`}
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
                          aria-label="Xoá chi phí"
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
                        ? "Chưa có chi phí thủ công."
                        : outbound
                          ? "Chiều này không qua trạm thu phí."
                          : 'Bấm "Tính lại lộ trình" để lấy danh sách trạm.'}
                    </TableCell>
                  </TableRow>
                ),
              ];
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} className="text-right text-xs text-muted-foreground">
                Chiều đi {formatVnd(outTotal)}
                {ret ? ` + Chiều về ${formatVnd(retTotal)}` : ""} + Thủ công{" "}
                {formatVnd(manualTotal)}
              </TableCell>
              <TableCell colSpan={3} className="font-bold text-primary">
                Total Toll Cost: {formatVnd(outTotal + retTotal + manualTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={onAddManual}>
        <Plus className="h-4 w-4" />
        Add Manual Cost
      </Button>
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
    if (!f.amount || !(amt > 0)) e["amount"] = "Số tiền phải lớn hơn 0.";
    if (!f.reason.trim()) e["reason"] = "Vui lòng nhập lý do.";
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
          <DialogTitle>Thêm chi phí thủ công</DialogTitle>
          <DialogDescription>
            Các chi phí routing engine không biết: phà, phụ phí giờ cao điểm, chi phí khác.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loại chi phí" required>
            <NativeSelect
              value={f.costType}
              onChange={(v) => setF({ ...f, costType: v as ManualCostType })}
              options={MANUAL_COST_TYPES}
            />
          </Field>
          <Field label="Số tiền (₫)" required error={errors["amount"]}>
            <Input
              type="number"
              min={0}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </Field>
          <Field label="Lý do" required error={errors["reason"]} className="col-span-2">
            <Input
              value={f.reason}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
              placeholder="VD: Ferry surcharge"
            />
          </Field>
          <Field label="Ghi chú" className="col-span-2">
            <Textarea
              rows={2}
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit}>
            <Plus className="h-4 w-4" />
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
