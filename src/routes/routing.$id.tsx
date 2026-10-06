import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Info, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, Field, Panel, StatusBadge, Tag } from "@/components/movex/common";
import { RouteMapPanel, type MapToll } from "@/components/movex/RouteMapPanel";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import {
  ManualCostDialog,
  ReturnRouteSection,
  StopList,
  TollBreakdown,
} from "@/components/movex/routing/RouteSections";
import { VehicleSelector } from "@/components/movex/routing/VehicleSelector";
import {
  altTitle,
  RouteAlternativeSelector,
} from "@/components/movex/routing/RouteAlternativeSelector";
import { RouteSummary } from "@/components/movex/routing/RouteSummary";
import { TollStationTable, type TollRow } from "@/components/movex/routing/TollStationTable";
import { useCollection } from "@/hooks/use-store";
import { routeRepository } from "@/repositories";
import {
  emptyPoint,
  newRouteDraft,
  routeService,
  validateRoute,
  type RouteAuditAction,
} from "@/services/routeService";
import { routingService, validateRouteInput } from "@/services/routing/routingService";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import { routeLegs, routeTotals } from "@/services/cost/costMath";
import { LOCATIONS } from "@/mock-data/locations";
import { routeVehicleFields, VEHICLES } from "@/mock-data/vehicles";
import type { MockTollGate } from "@/mock-data/tollCatalog";
import { formatVnd } from "@/lib/format";
import type { RouteCalculation, RoutePoint, RouteRecord, RouteType, Status } from "@/types";
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
        content: "Route create/edit with vehicle, stops, route alternatives and toll stations.",
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

/** Records saved before alternatives existed: fill in the new fields. */
const normalize = (r: RouteRecord): RouteRecord => ({
  ...newRouteDraft(),
  ...r,
  alternatives: r.alternatives ?? (r.outbound ? [r.outbound] : []),
  selectedRouteId: r.selectedRouteId ?? r.outbound?.id ?? null,
});

/** Signature of inputs that affect the routing result — used to flag a stale calculation. */
const calcSig = (r: RouteRecord) =>
  JSON.stringify([
    r.type,
    r.returnMode,
    r.vehicleId,
    r.departureTime,
    r.avoidFerry,
    [r.origin, ...r.waypoints, r.destination].map((p) => [p.lat, p.lng]),
    r.returnWaypoints.map((p) => [p.lat, p.lng]),
  ]);

const altId = (a: RouteCalculation, i: number) => a.id ?? `ALT-${i + 1}`;
const altName = (alts: RouteCalculation[], id: string | null) => {
  const i = alts.findIndex((a, j) => altId(a, j) === id);
  if (i < 0) return "—";
  const a = alts[i]!;
  return `${altTitle(a, i)}${a.recommended ? " (Đề xuất)" : ""}`;
};

function RouteEditor({ source }: { source: RouteRecord | null }) {
  const navigate = useNavigate();
  const isNew = !source;
  const initial = useMemo(() => normalize(source ?? newRouteDraft()), [source]);
  const [r, setR] = useState<RouteRecord>(() => structuredClone(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [calcState, setCalcState] = useState<"idle" | "loading" | "error">("idle");
  const [calcError, setCalcError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState(() => (initial.outbound ? calcSig(initial) : ""));
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Editor actions (recalculate, pick alternative) written to the audit trail on Save. */
  const [pending, setPending] = useState<RouteAuditAction[]>([]);

  const dirty = useMemo(() => JSON.stringify(r) !== JSON.stringify(initial), [r, initial]);
  const guard = useUnsavedChangesGuard(dirty);

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
  const inputError = validateRouteInput(r);
  const loading = calcState === "loading";
  const selectedName = altName(r.alternatives, r.selectedRouteId);

  const calculate = async () => {
    if (inputError) {
      toast.error(inputError);
      return;
    }
    setCalcState("loading");
    setCalcError(null);
    try {
      const res = await routingService.calculate(r);
      const best = res.alternatives.find((a) => a.recommended) ?? res.alternatives[0]!;
      const bestId = altId(best, res.alternatives.indexOf(best));
      setR((p) => {
        const { customReturn: _drop, ...rest } = p;
        return {
          ...rest,
          alternatives: res.alternatives,
          selectedRouteId: bestId,
          outbound: best,
          returnLeg: res.returnLeg,
        };
      });
      setLastSig(calcSig(r));
      setCalcState("idle");
      setPending((q) => [
        ...q,
        {
          action: "CALCULATE_ROUTE",
          field: "Alternatives",
          newValue: `${res.alternatives.length} tuyến`,
          note: `${best.provider === "vietmap" ? "Vietmap" : "Mock provider"} · ${altName(res.alternatives, bestId)}: ${best.distance} km`,
        },
      ]);
      const w = [...best.warnings, ...(res.returnLeg?.warnings ?? [])];
      toast.success(
        `Đã tính lộ trình: ${res.alternatives.length} phương án tuyến`,
        w.length ? { description: w[0] } : undefined,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không tính được lộ trình";
      setCalcState("error");
      setCalcError(msg);
      toast.error(msg);
    }
  };

  const selectAlternative = (id: string) => {
    if (id === r.selectedRouteId) return;
    const i = r.alternatives.findIndex((a, j) => altId(a, j) === id);
    const alt = r.alternatives[i];
    if (!alt) return;
    setPending((q) => [
      ...q,
      {
        action: "SELECT_ALTERNATIVE",
        field: "Selected Route",
        oldValue: altName(r.alternatives, r.selectedRouteId),
        newValue: altName(r.alternatives, id),
        note: `${alt.distance} km · toll ${formatVnd(alt.tollCost)}`,
      },
    ]);
    setR((p) => ({ ...p, selectedRouteId: id, outbound: alt }));
  };

  /** Link a provider toll gate to Toll Station master; kept on the alternative so re-selecting keeps it. */
  const mapStation = (row: TollRow, gate: MockTollGate) => {
    const patch = (c: RouteCalculation): RouteCalculation => ({
      ...c,
      tollStations: c.tollStations.map((t) =>
        t.id === row.station.id
          ? { ...t, code: gate.code, name: gate.name, address: gate.province, reconciled: true }
          : t,
      ),
    });
    setR((p) => {
      if (row.leg === "Return") return { ...p, returnLeg: p.returnLeg && patch(p.returnLeg) };
      return {
        ...p,
        outbound: p.outbound && patch(p.outbound),
        alternatives: p.alternatives.map((a, j) =>
          altId(a, j) === p.selectedRouteId ? patch(a) : a,
        ),
      };
    });
    toast.success(`Đã đối chiếu với ${gate.code} · ${gate.name}`);
  };

  const save = () => {
    setFormError(null);
    const e = validateRoute(r);
    if (stale) e["calc"] = "Route needs recalculation — bấm Tính lại lộ trình trước khi lưu.";
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Chưa thể lưu — vui lòng kiểm tra:");
      toast.error("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    setSaving(true);
    try {
      const saved = routeService.save(r, pending);
      setPending([]);
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

  const tollRows: TollRow[] = [
    ...(outbound?.tollStations ?? []).map((t, i) => ({
      key: `o-${t.id}-${i}`,
      leg: "Outbound" as const,
      station: t,
    })),
    ...(round ? (ret?.tollStations ?? []) : []).map((t, i) => ({
      key: `r-${t.id}-${i}`,
      leg: "Return" as const,
      station: t,
    })),
  ];
  const mapTolls: MapToll[] = tollRows.map((x) => ({ ...x.station, leg: x.leg }));

  const recalcButton = (
    <Button
      variant="outline"
      size="lg"
      onClick={() => void calculate()}
      disabled={loading || !!inputError}
      title={inputError ?? "Tính lại lộ trình"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Tính lại lộ trình
    </Button>
  );

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: isNew ? "Tạo mới" : "Chỉnh sửa" }]}
        title={isNew ? "Tạo mới Route" : "Chỉnh sửa Route"}
        badge={<StatusBadge status={(source ?? r).status} />}
        dirty={dirty}
        saving={saving}
        onBack={() => void navigate({ to: "/routing" })}
        onCancel={() => void navigate({ to: "/routing" })}
        onSave={save}
        extra={
          <>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              Lịch sử thay đổi
            </Button>
            {recalcButton}
          </>
        }
      />

      <FormErrorBanner message={formError} errors={errors} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.05fr]">
        {/* ---------- LEFT ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="1. Thông tin chung">
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
                  placeholder="VD: HCM → Đà Nẵng"
                  aria-invalid={!!errors["name"] || undefined}
                />
              </Field>
              <Field label="Loại route" required>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2" role="radiogroup">
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
                      <span className={cn(r.type === v && "text-primary")}>{en}</span>
                      <span className={cn(r.type === v && "text-primary")}>({vi})</span>
                    </label>
                  ))}
                </div>
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
              <Field label="Mô tả" className="col-span-2">
                <Textarea
                  rows={2}
                  maxLength={500}
                  value={r.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="VD: Tuyến vận chuyển hàng từ TP.HCM đi Đà Nẵng"
                />
                <span className="self-end text-xs text-muted-foreground">
                  {(r.description ?? "").length}/500
                </span>
              </Field>
            </div>
          </Panel>

          <Panel title="2. Phương tiện">
            <Field label="Xe" required error={errors["vehicleId"]}>
              <VehicleSelector
                vehicles={VEHICLES}
                value={r.vehicleId}
                invalid={!!errors["vehicleId"]}
                onChange={(v) => {
                  setR((p) => {
                    if (v) return { ...p, ...routeVehicleFields(v) };
                    const { vehicleId: _drop, ...rest } = p;
                    return rest;
                  });
                  clearErrors("vehicleId");
                }}
              />
            </Field>
          </Panel>

          <Panel title="3. Tùy chọn tính tuyến">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-40 text-sm">Thời gian khởi hành</span>
              <Input
                type="date"
                className="h-10 w-44"
                value={r.departureTime.slice(0, 10)}
                onChange={(e) =>
                  set(
                    "departureTime",
                    `${e.target.value}T${r.departureTime.slice(11, 16) || "08:00"}`,
                  )
                }
              />
              <Input
                type="time"
                className="h-10 w-32"
                value={r.departureTime.slice(11, 16)}
                onChange={(e) =>
                  set("departureTime", `${r.departureTime.slice(0, 10)}T${e.target.value}`)
                }
              />
            </div>
            <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={r.avoidFerry}
                onCheckedChange={(c) => set("avoidFerry", c === true)}
              />
              Tránh đi qua phà
            </label>
          </Panel>

          <Panel
            title="4. Danh sách điểm dừng"
            bodyClassName="p-0"
            actions={
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-primary/40 text-primary"
                onClick={addStop}
              >
                <Plus className="h-4 w-4" />
                Thêm điểm dừng
              </Button>
            }
          >
            {round && (
              <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 text-sm font-semibold">
                <Tag tone="Outbound">Outbound</Tag>
                Chiều đi
              </div>
            )}
            <StopList
              seq={seq}
              onChange={setSequence}
              locations={LOCATIONS}
              errors={{
                origin: errors["origin"],
                destination: errors["destination"],
                waypoints: errors["waypoints"],
              }}
            />
            {round && (
              <ReturnRouteSection
                mode={r.returnMode}
                onModeChange={(m) => set("returnMode", m)}
                origin={r.origin}
                waypoints={r.waypoints}
                destination={r.destination}
                returnWaypoints={r.returnWaypoints}
                onReturnWaypointsChange={(w) => set("returnWaypoints", w)}
                locations={LOCATIONS}
              />
            )}
          </Panel>
        </div>

        {/* ---------- RIGHT ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Bản đồ lộ trình" bodyClassName="flex flex-col gap-3 p-4">
            <RouteAlternativeSelector
              alternatives={r.alternatives}
              selectedId={r.selectedRouteId}
              onSelect={selectAlternative}
              disabled={loading}
            />
            {stale && (
              <div className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />
                Route needs recalculation — dữ liệu đã thay đổi sau lần tính gần nhất.
              </div>
            )}
            {calcState === "error" && calcError && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive">
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {calcError}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => void calculate()}
                >
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
                returnWaypoints={round && r.returnMode === "custom" ? r.returnWaypoints : []}
                tolls={mapTolls}
                roundTrip={round}
                providerLabel={
                  r.outbound
                    ? r.outbound.provider === "vietmap"
                      ? "Vietmap Route v4"
                      : "Mock route data"
                    : "Chưa tính lộ trình"
                }
                height={340}
                alternatives={r.alternatives.map((a, i) => ({
                  id: altId(a, i),
                  label: altTitle(a, i),
                  geometry: a.geometry,
                }))}
                selectedAlternativeId={r.selectedRouteId}
                onSelectAlternative={selectAlternative}
              />
              {loading && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center rounded-lg bg-card/60 text-sm font-medium">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                  Đang tính lộ trình…
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title={
              <>
                Thông tin tuyến{" "}
                {r.outbound && <span className="text-primary">({selectedName})</span>}
              </>
            }
          >
            <RouteSummary
              calculated={totals.calculated}
              distanceKm={totals.distanceKm}
              estimatedTimeMin={totals.estimatedTimeMin}
              tollCost={totals.totalRouteCost}
              stationCount={totals.stationCount}
            />
          </Panel>

          <Panel
            title={`Danh sách trạm thu phí${r.outbound ? ` (${selectedName.replace(" (Đề xuất)", "")})` : ""}`}
            bodyClassName="p-0"
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 text-primary"
                  onClick={() => setManualOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Thêm phí thủ công
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 text-primary"
                  onClick={() => setDetailOpen(true)}
                >
                  <Info className="h-3.5 w-3.5" />
                  Xem chi tiết (MD-06)
                </Button>
              </div>
            }
          >
            <TollStationTable
              rows={tollRows}
              showLeg={round}
              manualCosts={r.manualCosts}
              calculated={totals.calculated}
              onMap={mapStation}
              onRemoveManual={(mid) =>
                set(
                  "manualCosts",
                  r.manualCosts.filter((m) => m.id !== mid),
                )
              }
            />
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
      <AuditHistoryDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Route"
        entityId={source?.id}
        title={r.code || "Route mới"}
      />
    </div>
  );
}
