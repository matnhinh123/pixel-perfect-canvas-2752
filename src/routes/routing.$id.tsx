import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, Field, Panel, StatusBadge } from "@/components/movex/common";
import { RouteMapPanel, type MapToll } from "@/components/movex/RouteMapPanel";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import {
  ManualCostDialog,
  RoadTypes,
  StopList,
  TollBreakdown,
  TollReference,
} from "@/components/movex/routing/RouteSections";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import { emptyPoint, newRouteDraft, routeService, validateRoute } from "@/services/routeService";
import { routingService } from "@/services/routing/routingService";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import { routeLegs, routeTotals } from "@/services/cost/costMath";
import { formatDuration, formatVnd } from "@/lib/format";
import type { RoadTypeSplit, RoutePoint, RouteRecord, RouteType, Status } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/routing/$id")({
  // `mode` is accepted for old links; the page is always the create/edit form.
  validateSearch: (s: Record<string, unknown>): { mode?: "view" | "edit" } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Tạo mới Route — MoveX" : "Chỉnh sửa Route — MoveX" },
      {
        name: "description",
        content: "Route create/edit with map, stops, road types and toll stations.",
      },
    ],
  }),
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { id } = Route.useParams();
  const all = useCollection(routeRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Không tìm thấy route"
          description="Route có thể đã bị xoá hoặc đường dẫn không đúng."
          action={
            <Button asChild size="sm">
              <Link to="/routing">Về danh sách Routing</Link>
            </Button>
          }
        />
      </Panel>
    );
  return <RouteEditor key={source?.id ?? "new"} source={source} />;
}

/** Signature of inputs that affect the routing result — used to flag a stale calculation. */
const calcSig = (r: RouteRecord) =>
  JSON.stringify([
    r.type,
    r.returnMode,
    r.vehicleProfile,
    r.capacityKg,
    [r.origin, ...r.waypoints, r.destination].map((p) => [p.lat, p.lng]),
    r.returnWaypoints.map((p) => [p.lat, p.lng]),
  ]);

const sumSplit = (a: RoadTypeSplit, b?: RoadTypeSplit | null): RoadTypeSplit =>
  b
    ? {
        national: a.national + b.national,
        expressway: a.expressway + b.expressway,
        other: a.other + b.other,
      }
    : a;

function RouteEditor({ source }: { source: RouteRecord | null }) {
  const navigate = useNavigate();
  const isNew = !source;
  const [r, setR] = useState<RouteRecord>(() => structuredClone(source ?? newRouteDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [calcState, setCalcState] = useState<"idle" | "loading" | "error">("idle");
  const [calcError, setCalcError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState(() => (source?.outbound ? calcSig(source) : ""));
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"vietmap" | "mock" | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(r) !== JSON.stringify(source ?? newRouteDraft()),
    [r, source],
  );
  const guard = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    void routingService.providerName().then(setProvider);
  }, []);
  useEffect(() => {
    if (source) auditService.logView("Route", source.id, source.code);
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      if (!keys.some((k) => e[k])) return e;
      const n = { ...e };
      keys.forEach((k) => delete n[k]);
      return n;
    });
  const set = <K extends keyof RouteRecord>(k: K, v: RouteRecord[K]) => {
    setR((p) => ({ ...p, [k]: v }));
    clearErrors(k as string);
  };
  const seq = [r.origin, ...r.waypoints, r.destination];
  const setSequence = (next: RoutePoint[]) => {
    if (next.length < 2) return;
    setR((p) => ({
      ...p,
      origin: next[0]!,
      destination: next[next.length - 1]!,
      waypoints: next.slice(1, -1),
    }));
    clearErrors("origin", "destination", "waypoints");
  };
  const addStop = () => setSequence([...seq.slice(0, -1), emptyPoint(), seq[seq.length - 1]!]);

  const totals = routeTotals(r);
  const { outbound, ret } = routeLegs(r);
  const round = r.type === "Round Trip";
  const stale = !!r.outbound && lastSig !== calcSig(r);
  const roadSplit = r.outbound
    ? sumSplit(r.outbound.roadTypes, round ? r.returnLeg?.roadTypes : null)
    : null;
  const refStations = [
    ...(outbound?.tollStations ?? []),
    ...(round ? (ret?.tollStations ?? []) : []),
  ];

  const calculate = async () => {
    setCalcState("loading");
    setCalcError(null);
    try {
      const res = await routingService.calculate(r);
      setR((p) => ({ ...p, outbound: res.outbound, returnLeg: res.returnLeg }));
      setLastSig(calcSig(r));
      setCalcState("idle");
      const w = [...res.outbound.warnings, ...(res.returnLeg?.warnings ?? [])];
      toast.success(
        `Đã tính lộ trình: ${res.outbound.distance} km${res.returnLeg ? ` + ${res.returnLeg.distance} km chiều về` : ""}`,
        w.length ? { description: w[0] } : undefined,
      );
    } catch (e) {
      setCalcState("error");
      setCalcError(e instanceof Error ? e.message : "Không tính được lộ trình");
      toast.error(e instanceof Error ? e.message : "Không tính được lộ trình");
    }
  };

  const save = () => {
    setFormError(null);
    const e = validateRoute(r);
    if (stale)
      e["calc"] = "Dữ liệu tuyến đã thay đổi sau lần tính gần nhất — hãy bấm Tính lại lộ trình.";
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Chưa thể lưu — vui lòng kiểm tra:");
      toast.error("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    setSaving(true);
    try {
      const saved = routeService.save(r);
      guard.allowNext();
      toast.success(isNew ? `Đã tạo route ${saved.code}` : `Đã lưu route ${saved.code}`);
      if (isNew) void navigate({ to: "/routing/$id", params: { id: saved.id } });
      else setR(structuredClone(saved));
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError(err instanceof Error ? err.message : "Lưu thất bại");
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const mapTolls: MapToll[] = [
    ...(outbound?.tollStations ?? []).map((t) => ({ ...t, leg: "Outbound" as const })),
    ...(round ? (ret?.tollStations ?? []).map((t) => ({ ...t, leg: "Return" as const })) : []),
  ];
  const providerLabel = r.outbound
    ? r.outbound.provider === "vietmap"
      ? "Vietmap Route v4"
      : "Mock route data"
    : provider === "vietmap"
      ? "Vietmap sẵn sàng"
      : "Mock provider";

  const summary = (
    <div className="w-64 rounded-lg bg-card/95 px-4 py-3 text-sm shadow-lg">
      {[
        ["Tổng khoảng cách", totals.calculated ? `${totals.distanceKm} km` : "—"],
        ["Thời gian ước tính", totals.calculated ? formatDuration(totals.estimatedTimeMin) : "—"],
        ["Số điểm dừng", String(r.waypoints.length)],
        ["Số trạm thu phí (dự kiến)", String(totals.stationCount)],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-bold">{v}</span>
        </div>
      ))}
    </div>
  );

  const recalcButton = (label: string) => (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-10 w-10 shrink-0 text-primary"
      onClick={() => void calculate()}
      disabled={calcState === "loading"}
      aria-label={label}
      title="Tính lại"
    >
      {calcState === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: isNew ? "Tạo mới" : "Chỉnh sửa" }]}
        title="Tạo mới / Chỉnh sửa Route"
        badge={<StatusBadge status={(source ?? r).status} />}
        dirty={dirty}
        saving={saving}
        onBack={() => void navigate({ to: "/routing" })}
        onCancel={() => void navigate({ to: "/routing" })}
        onSave={save}
      />

      <FormErrorBanner message={formError} errors={errors} />

      {/* Row 1 — Thông tin chung | Bản đồ lộ trình */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Thông tin chung" className="min-w-0">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Mã route" required error={errors["code"]}>
              <Input
                className="h-10"
                value={r.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="RT-XXX"
                aria-invalid={!!errors["code"] || undefined}
              />
            </Field>
            <Field label="Tên route" required error={errors["name"]}>
              <Input
                className="h-10"
                value={r.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="VD: HCM - Đà Nẵng"
                aria-invalid={!!errors["name"] || undefined}
              />
            </Field>
            <Field label="Loại route" required className="col-span-2">
              <div className="flex flex-wrap gap-8 pt-1" role="radiogroup">
                {(
                  [
                    ["Single Trip", "Single-trip", "Một chiều"],
                    ["Round Trip", "Round-trip", "Khứ hồi"],
                  ] as [RouteType, string, string][]
                ).map(([v, en, vi]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 text-[15px]">
                    <input
                      type="radio"
                      name="routeType"
                      checked={r.type === v}
                      onChange={() => set("type", v)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className={cn(r.type === v && "text-primary")}>{en}</span>{" "}
                    <span>({vi})</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Tổng khoảng cách (km)">
              <div className="flex gap-2">
                <Input
                  className="h-10 bg-muted/60"
                  readOnly
                  tabIndex={-1}
                  value={totals.calculated ? String(totals.distanceKm) : ""}
                  placeholder="Chưa tính"
                />
                {recalcButton("Tính lại khoảng cách")}
              </div>
            </Field>
            <Field label="Thời gian ước tính">
              <div className="flex gap-2">
                <Input
                  className="h-10 bg-muted/60"
                  readOnly
                  tabIndex={-1}
                  value={totals.calculated ? formatDuration(totals.estimatedTimeMin) : ""}
                  placeholder="Chưa tính"
                />
                {recalcButton("Tính lại thời gian")}
              </div>
            </Field>
            <div className="col-span-2 grid grid-cols-[1fr_200px] gap-5">
              <Field label="Mô tả">
                <Textarea
                  rows={2}
                  value={r.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="VD: Tuyến vận chuyển hàng từ TP.HCM đi Đà Nẵng"
                />
              </Field>
              <Field label="Trạng thái" error={errors["status"]}>
                <div className="relative">
                  <span
                    className={cn(
                      "absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full",
                      r.status === "Active"
                        ? "bg-success"
                        : r.status === "Draft"
                          ? "bg-primary"
                          : "bg-muted-foreground",
                    )}
                  />
                  <select
                    value={r.status}
                    onChange={(e) => set("status", e.target.value as Status)}
                    className={cn(
                      "h-10 w-full appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring",
                      errors["status"] && "border-destructive",
                    )}
                  >
                    {["Active", "Draft", "Inactive"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ▾
                  </span>
                </div>
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Bản đồ lộ trình" className="min-w-0" bodyClassName="p-0">
          {stale && (
            <div className="flex items-center justify-between gap-2 border-b bg-warning-soft px-4 py-2 text-sm text-warning">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Điểm dừng đã thay đổi — bấm Tính lại lộ trình.
              </span>
            </div>
          )}
          {calcState === "error" && calcError && (
            <div className="flex items-center justify-between gap-2 border-b bg-danger-soft px-4 py-2 text-sm text-destructive">
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {calcError}
              </span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => void calculate()}>
                Thử lại
              </Button>
            </div>
          )}
          <div className="relative">
            <RouteMapPanel
              origin={r.origin}
              waypoints={r.waypoints}
              destination={r.destination}
              outboundGeometry={r.outbound?.geometry}
              returnGeometry={round ? r.returnLeg?.geometry : undefined}
              tolls={mapTolls}
              roundTrip={round}
              providerLabel={providerLabel}
              height={stale || calcState === "error" ? 318 : 356}
              overlay={summary}
            />
            {calcState === "loading" && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-card/60 text-sm font-medium">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                Đang tính lộ trình…
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Row 2 — Danh sách điểm dừng | Địa hình + Trạm thu phí */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Danh sách điểm dừng"
          bodyClassName="p-0"
          className="min-w-0"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={addStop}
              >
                <Plus className="h-4 w-4" />
                Thêm điểm dừng
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={() => void calculate()}
                disabled={calcState === "loading"}
              >
                {calcState === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Tính lại lộ trình
              </Button>
            </div>
          }
        >
          <StopList
            seq={seq}
            onChange={setSequence}
            errors={{
              origin: errors["origin"],
              destination: errors["destination"],
              waypoints: errors["waypoints"],
            }}
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Địa hình tuyến đường" bodyClassName="px-4 py-1">
            <RoadTypes split={roadSplit} />
          </Panel>
          <Panel
            title="Trạm thu phí trên tuyến (tham khảo)"
            bodyClassName="p-0"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={() => setDetailOpen(true)}
              >
                <Info className="h-3.5 w-3.5" />
                Xem chi tiết (MD-06)
              </Button>
            }
          >
            <TollReference stations={refStations} />
          </Panel>
        </div>
      </div>

      {/* MD-06 detail: prices per station, outbound / return split and manual costs */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[920px] overflow-y-auto sm:max-w-[920px]">
          <SheetHeader>
            <SheetTitle>Chi tiết phí cầu đường / phà (MD-06)</SheetTitle>
            <SheetDescription>
              {r.code || "Route mới"} ·{" "}
              {totals.calculated ? `${totals.distanceKm} km` : "chưa tính lộ trình"} · tổng{" "}
              {formatVnd(totals.totalRouteCost)}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <TollBreakdown
              outbound={outbound}
              ret={round ? ret : null}
              manualCosts={r.manualCosts}
              onAddManual={() => setManualOpen(true)}
              onRemoveManual={(mid) =>
                set(
                  "manualCosts",
                  r.manualCosts.filter((m) => m.id !== mid),
                )
              }
            />
          </div>
        </SheetContent>
      </Sheet>
      <ManualCostDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onAdd={(m) => {
          set("manualCosts", [...r.manualCosts, m]);
          toast.success(`Đã thêm: ${m.reason} +${formatVnd(m.amount)} (bấm Save để lưu)`);
        }}
      />
    </div>
  );
}
