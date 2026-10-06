import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Info, Pencil, Plus, Trash2 } from "lucide-react";
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
import { EmptyState, Field, NativeSelect, Tag, thClass } from "@/components/movex/common";
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
  type FeeType,
  type ManualCost,
  type ManualCostType,
  type RoadTypeSplit,
  type RoutePoint,
  type RouteRecord,
  type TollStation,
  type VehicleGroup,
  type VehicleProfile,
} from "@/types";
import { cn } from "@/lib/utils";

const validPoint = (p: RoutePoint) => !!p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  Toll: "Cầu đường",
  Bridge: "Cầu đường",
  Ferry: "Phà",
};

// ---------- Stop list (Danh sách điểm dừng) ----------
function StopBadge({ kind, index }: { kind: "origin" | "stop" | "destination"; index: number }) {
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

/**
 * Whole sequence [origin, ...waypoints, destination] as one table. Rows can be dragged; after a drop the
 * first row becomes the origin and the last the destination.
 */
export function StopList({
  r,
  onChange,
  onEditStop,
  readOnly,
}: {
  r: Pick<RouteRecord, "origin" | "waypoints" | "destination">;
  onChange: (seq: RoutePoint[]) => void;
  onEditStop: (waypointIndex: number) => void;
  readOnly?: boolean;
}) {
  const seq = [r.origin, ...r.waypoints, r.destination];
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drop = (to: number) => {
    if (dragFrom === null || dragFrom === to) return;
    const next = [...seq];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };
  const remove = (i: number) => onChange(seq.filter((_, j) => j !== i));

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
          const kind = i === 0 ? "origin" : i === seq.length - 1 ? "destination" : "stop";
          return (
            <TableRow
              key={i}
              draggable={!readOnly}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={() => {
                drop(i);
                setDragFrom(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOver(null);
              }}
              className={cn(
                over === i && dragFrom !== null && dragFrom !== i && "bg-accent",
                dragFrom === i && "opacity-50",
              )}
            >
              <TableCell className="w-8 text-muted-foreground">
                <GripVertical className={cn("h-4 w-4", !readOnly && "cursor-grab")} />
              </TableCell>
              <TableCell className="w-10 text-center text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                {kind === "origin" ? "Điểm đi" : kind === "destination" ? "Điểm đến" : "Điểm dừng"}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-3">
                  <StopBadge kind={kind} index={i} />
                  {validPoint(p) ? (
                    p.name
                  ) : (
                    <span className="text-muted-foreground">(chưa chọn)</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.note || p.address || "—"}</TableCell>
              <TableCell className="text-center">
                {kind === "stop" && !readOnly ? (
                  <span className="inline-flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEditStop(i - 1)}
                      aria-label="Sửa điểm dừng"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => remove(i)}
                      aria-label="Xoá điểm dừng"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function StopDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: RoutePoint | null;
  onSave: (p: RoutePoint) => void;
  title: string;
}) {
  const [p, setP] = useState<RoutePoint>(() => initial ?? emptyPoint());
  const [error, setError] = useState<string | null>(null);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setP(initial ?? emptyPoint());
    setError(null);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Chọn địa điểm từ danh mục Location hoặc tìm kiếm.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Địa điểm" required error={error ?? undefined}>
            <LocationPicker
              value={p}
              onChange={(v) => {
                setP((x) => ({ ...v, ...(x.note ? { note: x.note } : {}) }));
                setError(null);
              }}
              invalid={!!error}
              placeholder="Tìm địa điểm…"
            />
          </Field>
          <Field label="Ghi chú">
            <Input
              value={p.note ?? ""}
              onChange={(e) => setP({ ...p, note: e.target.value })}
              placeholder="VD: Lấy thêm hàng tại kho đối tác"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => {
              if (!validPoint(p)) {
                setError("Hãy chọn một địa điểm trong danh sách.");
                return;
              }
              const { note, ...rest } = p;
              onSave(note?.trim() ? { ...rest, note: note.trim() } : rest);
              onOpenChange(false);
            }}
          >
            Lưu điểm dừng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Nearest-neighbour ordering of waypoints between a fixed origin and destination. */
export function optimizeStops(origin: RoutePoint, waypoints: RoutePoint[]): RoutePoint[] {
  const left = [...waypoints];
  const out: RoutePoint[] = [];
  let cur = origin;
  const d = (a: RoutePoint, b: RoutePoint) =>
    (a.lat - b.lat) ** 2 + ((a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) ** 2;
  while (left.length) {
    let best = 0;
    left.forEach((w, i) => {
      if (d(cur, w) < d(cur, left[best]!)) best = i;
    });
    cur = left.splice(best, 1)[0]!;
    out.push(cur);
  }
  return out;
}

// ---------- Road types (Địa hình tuyến đường) ----------
export function RoadTypes({ split }: { split: RoadTypeSplit | null }) {
  if (!split)
    return (
      <EmptyState
        title="Chưa có dữ liệu"
        description='Bấm "Tính lại lộ trình" để phân tích loại đường.'
      />
    );
  const total = split.national + split.expressway + split.other || 1;
  const rows: [string, number][] = [
    ["Quốc lộ", split.national],
    ["Cao tốc", split.expressway],
    ["Đường tỉnh/khác", split.other],
  ];
  return (
    <div className="flex flex-col">
      {rows.map(([label, km]) => {
        const pct = Math.round((km / total) * 100);
        return (
          <div
            key={label}
            className="grid grid-cols-[130px_80px_1fr_48px] items-center gap-3 border-b py-2 text-sm last:border-0"
          >
            <span>{label}</span>
            <span className="text-right text-muted-foreground">{km} km</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-right text-muted-foreground">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Toll reference (Trạm thu phí trên tuyến) ----------
export function TollReference({ stations }: { stations: TollStation[] }) {
  if (stations.length === 0)
    return (
      <EmptyState
        title="Không có trạm thu phí"
        description="Tuyến chưa được tính hoặc không đi qua trạm nào."
      />
    );
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {["#", "Mã trạm", "Tên trạm", "Loại phí"].map((h) => (
            <TableHead key={h} className="h-9 text-sm font-semibold text-foreground">
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {stations.map((t, i) => (
          <TableRow key={`${t.id}-${i}`}>
            <TableCell className="w-10 py-2 text-center">{i + 1}</TableCell>
            <TableCell className="py-2">
              {t.code ? (
                <Link
                  to="/toll-station"
                  search={{ q: t.code }}
                  className="font-medium text-primary hover:underline"
                >
                  {t.code}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="py-2">{t.name}</TableCell>
            <TableCell className="py-2">{FEE_TYPE_LABEL[t.feeType]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------- Return waypoints editor ----------
export function WaypointEditor({
  points,
  onChange,
  label = "Điểm dừng",
  error,
  addLabel = "Thêm điểm dừng",
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
      <span className="text-sm font-semibold">
        {label} ({points.length})
      </span>
      {points.map((w, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="flex h-9 w-6 items-center justify-center text-xs font-bold text-success">
            R{i + 1}
          </span>
          <div className="flex-1">
            <LocationPicker
              value={w}
              onChange={(p) => onChange(points.map((x, j) => (j === i ? p : x)))}
              placeholder="Điểm dừng chiều về"
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
            aria-label="Lên"
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
            aria-label="Xuống"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onChange(points.filter((_, j) => j !== i))}
            aria-label="Xoá"
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
        <div className="mb-1.5 flex items-center gap-1 text-sm font-semibold">
          Vehicle Profile{" "}
          <span className="font-normal text-muted-foreground">(dùng cho routing API)</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Gửi cho routing engine (Vietmap <code>vehicle</code>) để chọn đường hợp lệ và giá vé
              theo loại xe. Không dùng cho đơn giá chi phí MoveX.
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
                "rounded-lg border px-2 py-2.5 text-sm font-semibold transition",
                r.vehicleProfile === v
                  ? "border-primary bg-accent text-primary"
                  : "hover:border-primary",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Vehicle Group (nghiệp vụ MoveX)"
          required
          hint="Dùng cho đơn giá chi phí & bảng giá"
        >
          <NativeSelect
            value={r.vehicleGroup}
            onChange={(v) => set("vehicleGroup", v as VehicleGroup)}
            options={VEHICLE_GROUPS}
          />
        </Field>
        {heavy ? (
          <Field
            label="Tải trọng / Capacity (kg)"
            required
            error={errors["capacityKg"]}
            hint="Map vào tham số capacity của Vietmap"
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
            Chỉ cần tải trọng với Truck / Container.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Toll / ferry cost breakdown ----------
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
                      {x.t.positionApproximate && (
                        <div className="text-[10px] text-muted-foreground">vị trí ước lượng</div>
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
                        <span title="Dữ liệu từ Mock provider — sẽ là Vietmap khi cấu hình VIETMAP_API_KEY">
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
        <Field label="Khoảng cách chiều về (km)" required>
          <Input
            type="number"
            min={0}
            step="0.1"
            value={value.distance}
            onChange={(e) => onChange({ ...value, distance: Number(e.target.value) })}
          />
        </Field>
        <Field label="Thời gian chiều về (phút)" required>
          <Input
            type="number"
            min={0}
            value={value.estimatedTime}
            onChange={(e) => onChange({ ...value, estimatedTime: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="text-sm font-semibold">Trạm thu phí chiều về</div>
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
            aria-label="Xoá trạm"
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
        Thêm trạm chiều về
      </Button>
    </div>
  );
}
