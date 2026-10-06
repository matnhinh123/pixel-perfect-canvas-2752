import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock,
  Coins,
  History,
  Loader2,
  MapPin,
  Milestone,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  NativeSelect,
  Panel,
  StatCard,
  StatusBadge,
  Tag,
  EmptyState,
} from "@/components/movex/common";
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
  TollBreakdown,
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
import type { RouteRecord, RouteType, Status } from "@/types";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/routing/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "Create Route — MoveX" : "Route Detail — MoveX" },
      {
        name: "description",
        content: "Route detail with map, vehicle profile and toll breakdown.",
      },
      { property: "og:title", content: "Route Detail — MoveX" },
      {
        property: "og:description",
        content: "Route detail with map, vehicle profile and toll breakdown.",
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
          title="Route not found"
          description="It may have been deleted or the link is wrong."
          action={
            <Button asChild size="sm">
              <Link to="/routing">Back to Routing</Link>
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
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"vietmap" | "mock" | null>(null);
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
  // Keep form in sync when a background change happens (e.g. status changed from the header) while not editing.
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

  const totals = routeTotals(r);
  const { outbound, ret } = routeLegs(r);
  const round = r.type === "Round Trip";
  const stale = !!r.outbound && lastSig !== calcSig(r);

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
        `Route calculated: ${res.outbound.distance} km outbound${res.returnLeg ? ` + ${res.returnLeg.distance} km return` : ""}`,
        w.length ? { description: w[0] } : undefined,
      );
    } catch (e) {
      setCalcState("error");
      setCalcError(e instanceof Error ? e.message : "Routing failed");
      toast.error(e instanceof Error ? e.message : "Routing failed");
    }
  };

  const save = (asDraft = false) => {
    setFormError(null);
    const draft: RouteRecord = asDraft ? { ...r, status: "Draft" } : r;
    const e = validateRoute(draft);
    if (stale)
      e["calc"] = "Route inputs changed after the last calculation — click Calculate Route again.";
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Cannot save — please fix the following:");
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = routeService.save(draft);
      guard.allowNext();
      toast.success(isNew ? `Route ${saved.code} created` : `Route ${saved.code} saved`);
      void navigate({ to: "/routing/$id", params: { id: saved.id }, search: { mode: "view" } });
      if (!isNew) setR(structuredClone(saved));
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError(err instanceof Error ? err.message : "Save failed");
      toast.error(err instanceof Error ? err.message : "Save failed");
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
      ? "Vietmap Route v4 · OSM tiles"
      : "Mock route data · OSM tiles"
    : provider === "vietmap"
      ? "Vietmap ready"
      : "Mock provider (no VIETMAP_API_KEY)";

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: isNew ? "Create Route" : r.code }]}
        title={isNew ? "Create Route" : readOnly ? "Route Detail" : "Edit Route"}
        subtitle={
          isNew ? (
            "Tạo tuyến mới"
          ) : (
            <span className="flex items-center gap-2">
              {source!.name} <StatusBadge status={source!.status} />
            </span>
          )
        }
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
        {...(isNew ? { onSaveDraft: () => save(true) } : {})}
        onSave={() => save(false)}
        extra={
          <>
            {!isNew && (
              <Button variant="outline" onClick={() => setAuditOpen(true)}>
                <History className="h-4 w-4" />
                Audit History
              </Button>
            )}
            {!readOnly && (
              <Button
                variant="secondary"
                onClick={() => void calculate()}
                disabled={calcState === "loading"}
              >
                {calcState === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                Calculate Route
              </Button>
            )}
            {readOnly &&
              source &&
              (source.status === "Inactive" ? (
                <Button
                  variant="outline"
                  onClick={() => void actions.setStatus([source], "Active")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void actions.setStatus([source], "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              ))}
            {readOnly && (
              <Button
                onClick={() =>
                  void navigate({
                    to: "/routing/$id",
                    params: { id: source!.id },
                    search: { mode: "edit" },
                  })
                }
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
          </>
        }
      />

      <FormErrorBanner message={formError} errors={errors} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <fieldset
          disabled={readOnly}
          className="col-span-1 flex min-w-0 flex-col gap-6 xl:col-span-2"
        >
          <Panel title="Basic Info">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Route Code" required error={errors["code"]}>
                <Input
                  value={r.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="RT-XXX"
                  aria-invalid={!!errors["code"] || undefined}
                />
              </Field>
              <Field label="Route Type" required>
                <div className="flex rounded-md border p-0.5">
                  {(["Single Trip", "Round Trip"] as RouteType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("type", t)}
                      className={cn(
                        "flex-1 rounded px-2 py-1.5 text-xs font-semibold",
                        r.type === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Route Name" required error={errors["name"]} className="col-span-2">
                <Input
                  value={r.name}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={!!errors["name"] || undefined}
                />
              </Field>
              <Field label="Origin (A)" required error={errors["origin"]} className="col-span-2">
                <LocationPicker
                  value={r.origin}
                  onChange={(p) => set("origin", p)}
                  placeholder="Điểm đi"
                  invalid={!!errors["origin"]}
                  disabled={readOnly}
                />
              </Field>
              <div className="col-span-2">
                <WaypointEditor
                  points={r.waypoints}
                  onChange={(p) => set("waypoints", p)}
                  error={errors["waypoints"]}
                />
              </div>
              <Field
                label="Destination (B)"
                required
                error={errors["destination"]}
                className="col-span-2"
              >
                <LocationPicker
                  value={r.destination}
                  onChange={(p) => set("destination", p)}
                  placeholder="Điểm đến"
                  invalid={!!errors["destination"]}
                  disabled={readOnly}
                />
              </Field>
              <Field
                label="Status"
                error={errors["status"]}
                className="col-span-2"
                hint={isNew ? "Use Save Draft to keep it as Draft." : undefined}
              >
                <NativeSelect
                  value={r.status}
                  onChange={(v) => set("status", v as Status)}
                  options={["Draft", "Active", "Inactive"]}
                  invalid={!!errors["status"]}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Vehicle">
            <VehiclePanel r={r} set={set} errors={errors} />
          </Panel>

          {round && (
            <Panel
              title="Return Route"
              actions={
                <div className="flex rounded-md border p-0.5 text-xs">
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
                      {m === "auto" ? "Auto-generate" : "Custom"}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="mb-3 rounded-lg bg-muted p-3 text-sm">
                <span className="font-semibold">Return:</span> {r.destination.name || "B"} →{" "}
                {(r.returnMode === "custom" ? r.returnWaypoints : [...r.waypoints].reverse())
                  .map((w) => w.name)
                  .filter(Boolean)
                  .join(" → ")}
                {(r.returnMode === "custom" ? r.returnWaypoints : r.waypoints).length ? " → " : ""}
                {r.origin.name || "A"}
              </div>
              {r.returnMode === "auto" ? (
                <p className="text-xs text-muted-foreground">
                  Auto: the return leg is calculated from B back to A through the outbound waypoints
                  in reverse order, with its own toll stations.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <WaypointEditor
                    label="Return waypoints"
                    addLabel="Add return waypoint"
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
                      Calculate the route to prefill return distance, time and tolls, then adjust
                      them.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          )}
        </fieldset>

        <div className="col-span-1 flex min-w-0 flex-col gap-6 xl:col-span-3">
          <Panel
            title="Map & Route Visualization"
            actions={
              r.outbound && (
                <span className="text-xs text-muted-foreground">
                  Calculated {formatDateTime(r.outbound.calculatedAt)}
                </span>
              )
            }
          >
            {stale && !readOnly && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Route inputs changed — results below are outdated.
                </span>
                <Button size="sm" variant="outline" onClick={() => void calculate()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Recalculate
                </Button>
              </div>
            )}
            {calcState === "error" && calcError && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-danger-soft px-3 py-2 text-sm text-destructive">
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {calcError}
                </span>
                <Button size="sm" variant="outline" onClick={() => void calculate()}>
                  Retry
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
                height={460}
              />
              {calcState === "loading" && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center rounded-lg bg-card/60 text-sm font-medium">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                  Calculating route…
                </div>
              )}
              {!r.outbound && calcState !== "loading" && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-[450] -translate-x-1/2 rounded-md bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow">
                  No route yet — pick Origin & Destination, then click <b>Calculate Route</b>.
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Distance"
                value={totals.calculated ? `${totals.distanceKm} km` : "—"}
                hint={round && ret ? `${outbound?.distance ?? 0} + ${ret.distance} km` : undefined}
                icon={<MapPin className="h-4 w-4" />}
              />
              <StatCard
                label="Estimated Time"
                value={totals.calculated ? formatDuration(totals.estimatedTimeMin) : "—"}
                hint={
                  round && ret
                    ? `${formatDuration(outbound?.estimatedTime ?? 0)} + ${formatDuration(ret.estimatedTime)}`
                    : undefined
                }
                icon={<Clock className="h-4 w-4" />}
              />
              <StatCard
                label="Toll Stations"
                value={String(totals.stationCount)}
                hint={
                  round && ret
                    ? `${outbound?.tollStations.length ?? 0} outbound · ${ret.tollStations.length} return`
                    : undefined
                }
                icon={<Milestone className="h-4 w-4" />}
              />
              <StatCard
                label="Total Toll Cost"
                value={formatVnd(totals.totalRouteCost)}
                hint={
                  totals.manualTotal ? `incl. manual ${formatVnd(totals.manualTotal)}` : undefined
                }
                icon={<Coins className="h-4 w-4" />}
              />
            </div>
            {round && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <Tag>Outbound</Tag>
                  <div className="mt-1 text-muted-foreground">
                    {outbound
                      ? `${outbound.distance} km · ${formatDuration(outbound.estimatedTime)} · ${formatVnd(totals.outboundToll)}`
                      : "Not calculated"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <Tag>Return</Tag>{" "}
                  <span className="text-xs text-muted-foreground">
                    {r.returnMode === "custom" ? "custom" : "auto"}
                  </span>
                  <div className="mt-1 text-muted-foreground">
                    {ret
                      ? `${ret.distance} km · ${formatDuration(ret.estimatedTime)} · ${formatVnd(totals.returnToll)}`
                      : "Not calculated"}
                  </div>
                </div>
              </div>
            )}
            {[...(r.outbound?.warnings ?? []), ...(round ? (r.returnLeg?.warnings ?? []) : [])]
              .filter((w, i, a) => a.indexOf(w) === i)
              .map((w) => (
                <p key={w} className="mt-2 flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {w}
                </p>
              ))}
          </Panel>
        </div>
      </div>

      <Panel title="Toll / Ferry Cost" className="mt-6">
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

      {!isNew && (
        <Panel
          title={`Linked Cost Records (${linkedCosts.length})`}
          className="mt-6"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/cost/$id" params={{ id: "new" }} search={{ routeId: source!.id }}>
                <Plus className="h-4 w-4" />
                Create Cost for this Route
              </Link>
            </Button>
          }
        >
          {linkedCosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cost record uses this route yet.</p>
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

      <ManualCostDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onAdd={(m) => {
          set("manualCosts", [...r.manualCosts, m]);
          toast.success(`Manual cost added: ${m.reason} +${formatVnd(m.amount)} (save to keep it)`);
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
