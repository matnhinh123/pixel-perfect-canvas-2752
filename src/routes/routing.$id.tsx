import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Info,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Shuffle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Panel, StatusBadge, Tag } from "@/components/movex/common";
import { RouteMapPanel, type MapToll } from "@/components/movex/RouteMapPanel";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { LocationPicker } from "@/components/movex/routing/LocationPicker";
import {
  CustomReturnEditor,
  ManualCostDialog,
  optimizeStops,
  RoadTypes,
  StopDialog,
  StopList,
  TollBreakdown,
  TollReference,
  VehiclePanel,
  WaypointEditor,
} from "@/components/movex/routing/RouteSections";
import { useCollection } from "@/hooks/use-store";
import { costRepository, routeRepository } from "@/repositories";
import { newRouteDraft, routeCrud, routeService, validateRoute } from "@/services/routeService";
import { routingService } from "@/services/routing/routingService";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import { routeLegs, routeTotals } from "@/services/cost/costMath";
import { displayVersion } from "@/services/costService";
import { formatDateTime, formatDuration, formatVnd } from "@/lib/format";
import type { RoadTypeSplit, RoutePoint, RouteRecord, RouteType, Status } from "@/types";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/routing/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Tạo mới Route — MoveX" : "Route — MoveX" },
      {
        name: "description",
        content: "Route detail with map, stops, road types and toll stations.",
      },
      { property: "og:title", content: "Route — MoveX" },
      {
        property: "og:description",
        content: "Route detail with map, stops, road types and toll stations.",
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
  const search = Route.useSearch();
  const isNew = !source;
  const mode: Mode = isNew ? "edit" : (search.mode ?? "view");
  const readOnly = mode === "view";
  const [r, setR] = useState<RouteRecord>(() => structuredClone(source ?? newRouteDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [calcState, setCalcState] = useState<"idle" | "loading" | "error">("idle");
  const [calcError, setCalcError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState(() => (source?.outbound ? calcSig(source) : ""));
  const [auditOpen, setAuditOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [stopDialog, setStopDialog] = useState<{ index: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"vietmap" | "mock" | null>(null);
  const costSectionRef = useRef<HTMLDivElement>(null);
  const actions = useEntityActions(routeCrud);
  const costs = useCollection(costRepository);
  const linkedCosts = useMemo(
    () => (source ? costs.filter((c) => !c.deleted && c.routeId === source.id) : []),
    [costs, source],
  );

  const dirty = useMemo(
    () => JSON.stringify(r) !== JSON.stringify(source ?? newRouteDraft()),
    [r, source],
  );
  const guard = useUnsavedChangesGuard(dirty && !readOnly);

  useEffect(() => {
    void routingService.providerName().then(setProvider);
  }, []);
  useEffect(() => {
    if (source) auditService.logView("Route", source.id, source.code);
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (readOnly && source) setR(structuredClone(source));
  }, [source, readOnly]);

  const set = <K extends keyof RouteRecord>(k: K, v: RouteRecord[K]) => {
    setR((p) => ({ ...p, [k]: v }));
    if (errors[k as string])
      setErrors((e) => {
        const n = { ...e };
        delete n[k as string];
        return n;
      });
  };
  const setSequence = (seq: RoutePoint[]) => {
    if (seq.length < 2) {
      toast.error("Route cần tối thiểu điểm đi và điểm đến.");
      return;
    }
    setR((p) => ({
      ...p,
      origin: seq[0]!,
      destination: seq[seq.length - 1]!,
      waypoints: seq.slice(1, -1),
    }));
  };

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
      setR((p) => ({
        ...p,
        outbound: res.outbound,
        returnLeg: res.returnLeg,
        ...(p.type === "Round Trip" && p.returnMode === "custom" && res.returnLeg
          ? {
              customReturn: {
                distance: res.returnLeg.distance,
                estimatedTime: res.returnLeg.estimatedTime,
                tollStations: res.returnLeg.tollStations,
              },
            }
          : {}),
      }));
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

  const optimize = () => {
    if (r.waypoints.length < 2) {
      toast.info("Cần ít nhất 2 điểm dừng để tối ưu thứ tự.");
      return;
    }
    const next = optimizeStops(r.origin, r.waypoints);
    if (JSON.stringify(next) === JSON.stringify(r.waypoints)) {
      toast.info("Thứ tự điểm dừng đã tối ưu.");
      return;
    }
    set("waypoints", next);
    toast.success(
      "Đã sắp xếp lại điểm dừng theo quãng đường ngắn nhất — bấm Tính lại lộ trình để cập nhật.",
    );
  };

  const save = (asDraft = false) => {
    setFormError(null);
    const draft: RouteRecord = asDraft ? { ...r, status: "Draft" } : r;
    const e = validateRoute(draft);
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
      const saved = routeService.save(draft);
      guard.allowNext();
      toast.success(isNew ? `Đã tạo route ${saved.code}` : `Đã lưu route ${saved.code}`);
      void navigate({ to: "/routing/$id", params: { id: saved.id }, search: { mode: "view" } });
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

  const crumbLabel = isNew ? "Tạo mới" : readOnly ? r.code : "Chỉnh sửa";
  const title = isNew
    ? "Tạo mới / Chỉnh sửa Route"
    : readOnly
      ? `Route ${source!.code}`
      : "Tạo mới / Chỉnh sửa Route";

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

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: crumbLabel }]}
        title={title}
        badge={<StatusBadge status={(source ?? r).status} />}
        dirty={dirty}
        readOnly={readOnly}
        saving={saving}
        onBack={() => void navigate({ to: "/routing" })}
        onCancel={() =>
          isNew
            ? void navigate({ to: "/routing" })
            : void navigate({
                to: "/routing/$id",
                params: { id: source!.id },
                search: { mode: "view" },
              })
        }
        onSave={() => save(false)}
        extra={
          <>
            {!isNew && (
              <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
                <History className="h-4 w-4" />
                Audit History
              </Button>
            )}
            {readOnly &&
              source &&
              (source.status === "Inactive" ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void actions.setStatus([source], "Active")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void actions.setStatus([source], "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              ))}
            {readOnly && (
              <Button
                size="lg"
                onClick={() =>
                  void navigate({
                    to: "/routing/$id",
                    params: { id: source!.id },
                    search: { mode: "edit" },
                  })
                }
              >
                <Pencil className="h-4 w-4" />
                Chỉnh sửa
              </Button>
            )}
          </>
        }
      />

      <FormErrorBanner message={formError} errors={errors} />

      {/* Row 1 — Thông tin chung | Bản đồ lộ trình */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <fieldset disabled={readOnly} className="min-w-0">
          <Panel title="Thông tin chung" className="h-full">
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
              <Field label="Điểm đi" required error={errors["origin"]}>
                <LocationPicker
                  value={r.origin}
                  onChange={(p) => set("origin", p)}
                  placeholder="Chọn điểm đi"
                  invalid={!!errors["origin"]}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Điểm đến" required error={errors["destination"]}>
                <LocationPicker
                  value={r.destination}
                  onChange={(p) => set("destination", p)}
                  placeholder="Chọn điểm đến"
                  invalid={!!errors["destination"]}
                  disabled={readOnly}
                />
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-primary"
                    onClick={() => void calculate()}
                    disabled={calcState === "loading"}
                    aria-label="Tính lại khoảng cách"
                    title="Tính lại"
                  >
                    {calcState === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-primary"
                    onClick={() => void calculate()}
                    disabled={calcState === "loading"}
                    aria-label="Tính lại thời gian"
                    title="Tính lại"
                  >
                    {calcState === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
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
                        "h-10 w-full appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60",
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
        </fieldset>

        <Panel
          title="Bản đồ lộ trình"
          className="min-w-0"
          bodyClassName="p-0"
          actions={
            !readOnly && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={optimize}
              >
                <Shuffle className="h-3.5 w-3.5" />
                Tối ưu thứ tự điểm dừng
              </Button>
            )
          }
        >
          {stale && !readOnly && (
            <div className="flex items-center justify-between gap-2 border-b bg-warning-soft px-4 py-2 text-sm text-warning">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Dữ liệu tuyến đã thay đổi — kết quả đang cũ.
              </span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => void calculate()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Tính lại
              </Button>
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
              returnWaypoints={r.returnMode === "custom" ? r.returnWaypoints : []}
              tolls={mapTolls}
              roundTrip={round}
              providerLabel={providerLabel}
              height={430}
              overlay={summary}
            />
            {calcState === "loading" && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-card/60 text-sm font-medium">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                Đang tính lộ trình…
              </div>
            )}
            {!r.outbound && calcState !== "loading" && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-[450] -translate-x-1/2 rounded-md bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow">
                Chọn điểm đi, điểm đến rồi bấm <b>Tính lại lộ trình</b>.
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
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 text-primary"
                  onClick={() => setStopDialog({ index: null })}
                >
                  <Plus className="h-4 w-4" />
                  Thêm điểm dừng
                </Button>
              )}
              {!readOnly && (
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
              )}
            </div>
          }
        >
          <StopList
            r={r}
            onChange={setSequence}
            onEditStop={(i) => setStopDialog({ index: i })}
            readOnly={readOnly}
          />
          {errors["waypoints"] && (
            <p className="px-4 pb-3 text-xs font-medium text-destructive">{errors["waypoints"]}</p>
          )}
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
                onClick={() =>
                  costSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
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

      {/* Row 3 — vehicle & return leg */}
      <fieldset disabled={readOnly} className="mt-5 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Phương tiện">
          <VehiclePanel r={r} set={set} errors={errors} />
        </Panel>
        {round ? (
          <Panel
            title="Chiều về (Round-trip)"
            actions={
              <div className="flex rounded-md border bg-card p-0.5 text-xs">
                {(["auto", "custom"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      set("returnMode", m);
                      if (m === "custom" && !r.customReturn) {
                        const base = r.returnLeg ?? r.outbound;
                        if (base)
                          set("customReturn", {
                            distance: base.distance,
                            estimatedTime: base.estimatedTime,
                            tollStations: structuredClone(base.tollStations),
                          });
                      }
                    }}
                    className={cn(
                      "rounded px-3 py-1 font-semibold",
                      r.returnMode === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {m === "auto" ? "Tự động" : "Tuỳ chỉnh"}
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-3 rounded-lg bg-muted p-3 text-sm">
              <Tag>Return</Tag>{" "}
              <span className="ml-1">
                {r.destination.name || "B"} →{" "}
                {(r.returnMode === "custom" ? r.returnWaypoints : [...r.waypoints].reverse())
                  .map((w) => w.name)
                  .filter(Boolean)
                  .join(" → ")}
                {(r.returnMode === "custom" ? r.returnWaypoints : r.waypoints).length ? " → " : ""}
                {r.origin.name || "A"}
              </span>
            </div>
            {r.returnMode === "auto" ? (
              <p className="text-sm text-muted-foreground">
                Tự động: chiều về tính từ B về A qua các điểm dừng theo thứ tự ngược lại, với danh
                sách trạm thu phí riêng (không nhân đôi chiều đi).
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <WaypointEditor
                  label="Điểm dừng chiều về"
                  addLabel="Thêm điểm dừng chiều về"
                  points={r.returnWaypoints}
                  onChange={(p) => set("returnWaypoints", p)}
                />
                {r.customReturn ? (
                  <CustomReturnEditor
                    value={r.customReturn}
                    onChange={(v) => set("customReturn", v)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Tính lộ trình để điền sẵn khoảng cách, thời gian và trạm thu phí chiều về, sau
                    đó chỉnh sửa.
                  </p>
                )}
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Tóm tắt chiều đi / chiều về">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <Tag>Outbound</Tag>
                <div className="mt-1 text-muted-foreground">
                  {outbound
                    ? `${outbound.distance} km · ${formatDuration(outbound.estimatedTime)} · ${formatVnd(totals.outboundToll)}`
                    : "Chưa tính"}
                </div>
              </div>
              <div className="rounded-lg border border-dashed p-3 text-muted-foreground">
                Single-trip: không có chiều về. Chọn Round-trip để cấu hình chiều về.
              </div>
            </div>
            {[...(r.outbound?.warnings ?? [])].map((w) => (
              <p key={w} className="mt-2 flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {w}
              </p>
            ))}
          </Panel>
        )}
      </fieldset>

      {/* Row 4 — toll / ferry cost (detail of MD-06) */}
      <div ref={costSectionRef} className="mt-5 scroll-mt-4">
        <Panel
          title="Chi phí cầu đường / phà (Toll / Ferry Cost)"
          actions={
            r.outbound && (
              <span className="text-xs text-muted-foreground">
                Tính lúc {formatDateTime(r.outbound.calculatedAt)} · {providerLabel}
              </span>
            )
          }
        >
          <TollBreakdown
            outbound={outbound}
            ret={round ? ret : null}
            manualCosts={r.manualCosts}
            readOnly={readOnly}
            onAddManual={() => setManualOpen(true)}
            onRemoveManual={(mid) =>
              set(
                "manualCosts",
                r.manualCosts.filter((m) => m.id !== mid),
              )
            }
          />
        </Panel>
      </div>

      {!isNew && (
        <Panel
          title={`Chi phí liên kết (${linkedCosts.length})`}
          className="mt-5"
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/40 text-primary"
              asChild
            >
              <Link to="/cost/$id" params={{ id: "new" }} search={{ routeId: source!.id }}>
                <Plus className="h-4 w-4" />
                Tạo Cost cho route này
              </Link>
            </Button>
          }
        >
          {linkedCosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có bản ghi Cost nào dùng route này.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {linkedCosts.map((c) => {
                const v = displayVersion(c);
                return (
                  <Link
                    key={c.id}
                    to="/cost/$id"
                    params={{ id: c.id }}
                    className="flex items-center justify-between rounded-lg border p-3 hover:border-primary"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <Receipt className="h-4 w-4" />
                        {c.code}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.vehicleGroup} · v{v.version}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{formatVnd(v.totalEstimated)}</div>
                      <StatusBadge status={c.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <StopDialog
        open={!!stopDialog}
        onOpenChange={(o) => !o && setStopDialog(null)}
        title={
          stopDialog?.index == null ? "Thêm điểm dừng" : `Sửa điểm dừng ${stopDialog.index + 1}`
        }
        initial={stopDialog?.index == null ? null : (r.waypoints[stopDialog.index] ?? null)}
        onSave={(p) => {
          if (stopDialog?.index == null) set("waypoints", [...r.waypoints, p]);
          else
            set(
              "waypoints",
              r.waypoints.map((w, i) => (i === stopDialog.index ? p : w)),
            );
          toast.success("Đã cập nhật điểm dừng — bấm Tính lại lộ trình để cập nhật kết quả.");
        }}
      />
      <ManualCostDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onAdd={(m) => {
          set("manualCosts", [...r.manualCosts, m]);
          toast.success(`Đã thêm: ${m.reason} +${formatVnd(m.amount)} (bấm Save để lưu)`);
        }}
      />
      {source && (
        <AuditHistoryDrawer
          open={auditOpen}
          onOpenChange={setAuditOpen}
          entityType="Route"
          entityId={source.id}
          title={source.code}
        />
      )}
    </div>
  );
}
