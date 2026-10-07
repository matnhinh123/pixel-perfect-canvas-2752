import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, List, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
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
import { STOP_COLUMNS, StopList } from "@/components/movex/routing/RouteSections";
import {
  altTitle,
  RouteAlternativeSelector,
} from "@/components/movex/routing/RouteAlternativeSelector";
import { TollStationTable, type TollRow } from "@/components/movex/routing/TollStationTable";
import { AddTollDialog, type TollLeg } from "@/components/movex/routing/AddTollDialog";
import { TollDetailsSheet } from "@/components/movex/routing/TollDetailsSheet";
import { vehicleClassFor } from "@/services/routing/RouteProvider";
import { VehicleClassPicker } from "@/components/movex/routing/VehicleClassPicker";
import { useCollection } from "@/hooks/use-store";
import {
  emptyPoint,
  newRouteDraft,
  routeService,
  validateRoute,
  type RouteAuditAction,
} from "@/services/routeService";
import {
  returnSequence,
  reverseLeg,
  routingService,
  validateRouteInput,
} from "@/services/routing/routingService";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import { routeLegs, routeTotals } from "@/services/cost/costMath";
import { locationRepository, routeRepository } from "@/repositories";
import { formatDuration } from "@/lib/format";
import {
  type RouteCalculation,
  type TollStation,
  type RoutePoint,
  type RouteRecord,
  type RouteType,
  type Status,
  type Terrain,
  type VehicleProfile,
} from "@/types";
import { cn } from "@/lib/utils";
import { nearestVertex } from "@/services/routing/geo";

export const Route = createFileRoute("/routing/$id")({
  // `mode` is accepted for old links; the page is always the create/edit form.
  validateSearch: (s: Record<string, unknown>): { mode?: "view" | "edit" } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: params.id === "new" ? "New Route — MoveX" : "Edit Route — MoveX" },
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
          title="Route not found"
          description="The route may have been deleted or the link is wrong."
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

/** Records saved before alternatives existed: fill in the new fields. */
const normalize = (r: RouteRecord): RouteRecord => ({
  ...newRouteDraft(),
  ...r,
  // Routes are only Active / Inactive; legacy "Draft" records count as Inactive.
  status: r.status === "Active" ? "Active" : "Inactive",
  alternatives: r.alternatives ?? (r.outbound ? [r.outbound] : []),
  selectedRouteId: r.selectedRouteId ?? r.outbound?.id ?? null,
  // Same route reversed = the outbound leg driven back (records saved before were re-routed B → A).
  ...(r.returnMode !== "custom" && r.outbound ? { returnLeg: reverseLeg(r.outbound) } : {}),
});

/** Signature of inputs that affect the routing result — used to flag a stale calculation. */
const calcSig = (r: RouteRecord) =>
  JSON.stringify([
    r.returnMode,
    r.vehicleId,
    r.vehicleProfile,
    r.vehicleClass,
    r.terrain,
    r.departureTime,
    r.avoidFerry,
    [r.origin, ...r.waypoints, r.destination].map((p) => [p.lat, p.lng]),
    returnSequence(r).map((p) => [p.lat, p.lng]),
  ]);

const PROFILE_LABEL: Record<VehicleProfile, string> = {
  Truck: "Truck",
  Container: "Container",
  Car: "Car",
  Motorcycle: "Motorcycle",
};

const altId = (a: RouteCalculation, i: number) => a.id ?? `ALT-${i + 1}`;
const altName = (alts: RouteCalculation[], id: string | null) => {
  const i = alts.findIndex((a, j) => altId(a, j) === id);
  if (i < 0) return "—";
  const a = alts[i]!;
  return `${altTitle(a, i)}${a.recommended ? " (Recommended)" : ""}`;
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
  const [auditOpen, setAuditOpen] = useState(false);
  const locationsAll = useCollection(locationRepository);
  const [addTollOpen, setAddTollOpen] = useState(false);
  const [tollDetailsOpen, setTollDetailsOpen] = useState(false);
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
  const usedLocationIds = new Set(
    [...seq, ...returnSequence(r)].map((p) => p.locationId).filter(Boolean),
  );
  const locations = locationsAll.filter(
    (l) => !l.deleted && (l.status === "Active" || usedLocationIds.has(l.id)),
  );
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
  // Distance: calculated from the route, or typed by the user (kept until the next recalculation).
  const { distanceOverrides: _ov, ...noOverride } = r;
  const calculatedKm = routeTotals(noOverride).distanceKm;
  const kmOverride = r.distanceOverrides?.[r.type];
  const [kmText, setKmText] = useState<string | null>(null);
  const setDistance = (km: number | null) => {
    const next = km === null || km === calculatedKm ? null : km;
    if ((kmOverride ?? null) === next) return;
    setPending((q) => [
      ...q,
      {
        action: "CHANGE_DISTANCE",
        field: "Distance",
        oldValue: `${totals.distanceKm} km`,
        newValue: `${next ?? calculatedKm} km`,
        note: next === null ? "Restored calculated distance" : "Distance adjusted manually",
      },
    ]);
    setR((p) => {
      const rest = { ...p.distanceOverrides };
      if (next === null) delete rest[p.type];
      else rest[p.type] = next;
      const { distanceOverrides: _d, ...others } = p;
      return Object.keys(rest).length ? { ...others, distanceOverrides: rest } : others;
    });
  };
  const commitKm = () => {
    if (kmText === null) return;
    const v = kmText.trim();
    const km = Number(v);
    if (v === "") setDistance(null);
    else if (Number.isFinite(km) && km >= 0) setDistance(Math.round(km * 10) / 10);
    setKmText(null);
  };
  const { outbound, ret } = routeLegs(r);
  const round = r.type === "Round Trip";
  /** Round trip = outbound + the same route driven back to the Departure (no recalculation needed). */
  const changeRouteType = (type: RouteType) => {
    if (type === r.type) return;
    setPending((q) => [
      ...q,
      { action: "CHANGE_ROUTE_TYPE", field: "Route Type", oldValue: r.type, newValue: type },
    ]);
    setR((p) => ({
      ...p,
      type,
      ...(type === "Round Trip"
        ? { returnMode: "auto" as const, returnLeg: p.outbound ? reverseLeg(p.outbound) : null }
        : {}),
    }));
  };
  const stale = !!r.outbound && lastSig !== calcSig(r);
  const inputError = validateRouteInput(r);
  const loading = calcState === "loading";
  const selectedName = altName(r.alternatives, r.selectedRouteId);

  const calculate = async (rec: RouteRecord = r) => {
    const err = validateRouteInput(rec);
    if (err) {
      toast.error(err);
      return;
    }
    setCalcState("loading");
    setCalcError(null);
    try {
      const res = await routingService.calculate(rec);
      const best = res.alternatives.find((a) => a.recommended) ?? res.alternatives[0]!;
      const bestId = altId(best, res.alternatives.indexOf(best));
      setR((p) => {
        const { customReturn: _drop, distanceOverrides: _d, ...rest } = p;
        return {
          ...rest,
          alternatives: res.alternatives,
          selectedRouteId: bestId,
          outbound: best,
          returnLeg: res.returnLeg,
        };
      });
      setLastSig(calcSig(rec));
      setCalcState("idle");
      setPending((q) => [
        ...q,
        {
          action: "CALCULATE_ROUTE",
          field: "Alternatives",
          newValue: `${res.alternatives.length} routes`,
          note: `${best.provider === "vietmap" ? "Vietmap" : best.provider === "valhalla" ? "OSM Truck" : "Mock provider"} · ${altName(res.alternatives, bestId)}: ${best.distance} km`,
        },
      ]);
      const w = [...best.warnings, ...(res.returnLeg?.warnings ?? [])];
      toast.success(
        `Route calculated: ${res.alternatives.length} option(s)`,
        w.length ? { description: w[0] } : undefined,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not calculate the route";
      setCalcState("error");
      setCalcError(msg);
      toast.error(msg);
    }
  };

  /** Google-Maps-style travel mode: switch the routing profile and re-route when the inputs are complete. */
  /** Truck (class 1–5) / Container (class 3–5): sets the toll class Vietmap prices by, then re-routes. */
  const vehicleClass = vehicleClassFor(r.vehicleProfile, r.vehicleClass, r.capacityKg);
  const changeVehicle = (profile: VehicleProfile, cls: number) => {
    if (profile === r.vehicleProfile && cls === vehicleClass) return;
    const next = { ...r, vehicleProfile: profile, vehicleClass: cls };
    setR(next);
    setPending((q) => [
      ...q,
      {
        action: "CHANGE_VEHICLE",
        field: "Vehicle Group",
        oldValue: `${PROFILE_LABEL[r.vehicleProfile]} · Group ${vehicleClass}`,
        newValue: `${PROFILE_LABEL[profile]} · Group ${cls}`,
      },
    ]);
    if (r.outbound && !validateRouteInput(next)) void calculate(next);
  };

  const dragPoint = (ll: { lat: number; lng: number }): RoutePoint => ({
    name: `Dragged point (${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)})`,
    lat: ll.lat,
    lng: ll.lng,
  });

  /** Drop on the line: insert a via point between the stops the dragged spot lies between, then re-route. */
  const addViaPoint = (ll: { lat: number; lng: number }) => {
    const geom = r.outbound?.geometry;
    if (!geom?.length) return;
    const at = nearestVertex(geom, ll).index;
    let pos = 0;
    for (const w of r.waypoints) {
      if (nearestVertex(geom, w).index <= at) pos++;
      else break;
    }
    const point = dragPoint(ll);
    const waypoints = [...r.waypoints.slice(0, pos), point, ...r.waypoints.slice(pos)];
    const next = { ...r, waypoints };
    setR(next);
    setPending((q) => [
      ...q,
      {
        action: "ADD_WAYPOINT",
        field: "Waypoints",
        newValue: point.name,
        note: "Dragged on map",
      },
    ]);
    void calculate(next);
  };

  const moveWaypoint = (index: number, ll: { lat: number; lng: number }) => {
    const old = r.waypoints[index];
    const point = dragPoint(ll);
    const next = { ...r, waypoints: r.waypoints.map((w, i) => (i === index ? point : w)) };
    setR(next);
    setPending((q) => [
      ...q,
      {
        action: "CHANGE_WAYPOINT",
        field: `Waypoint ${index + 1}`,
        ...(old ? { oldValue: old.name } : {}),
        newValue: point.name,
        note: "Dragged on map",
      },
    ]);
    void calculate(next);
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
        note: `${alt.distance} km`,
      },
    ]);
    setR((p) => ({
      ...p,
      selectedRouteId: id,
      outbound: alt,
      ...(p.returnMode !== "custom" ? { returnLeg: reverseLeg(alt) } : {}),
    }));
  };

  /** Add a toll (from Toll Station or typed in). Same route reversed: it applies to both legs. */
  const addToll = (toll: TollStation, leg: TollLeg) => {
    const withToll = (c: RouteCalculation): RouteCalculation => {
      const tollStations = [...c.tollStations.filter((t) => t.id !== toll.id), toll];
      return {
        ...c,
        tollStations,
        tollCost: tollStations.reduce((n, t) => n + t.price * t.passCount, 0),
      };
    };
    setR((p) => {
      if (leg === "Return" && p.returnMode === "custom")
        return { ...p, returnLeg: p.returnLeg && withToll(p.returnLeg) };
      const outbound = p.outbound && withToll(p.outbound);
      return {
        ...p,
        outbound,
        alternatives: p.alternatives.map((a, j) =>
          altId(a, j) === p.selectedRouteId ? withToll(a) : a,
        ),
        ...(p.returnMode !== "custom" && outbound ? { returnLeg: reverseLeg(outbound) } : {}),
      };
    });
    setPending((q) => [
      ...q,
      {
        action: "UPDATE",
        field: "Tolls",
        newValue: `+ ${toll.code ?? ""} ${toll.name}`.trim(),
        note: leg === "Return" ? "Return Trip" : "Outbound",
      },
    ]);
    toast.success(`Added toll ${toll.name}`);
  };

  const save = () => {
    setFormError(null);
    const e = validateRoute(r);
    if (stale) e["calc"] = "Route needs recalculation — click Recalculate Route before saving.";
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Cannot save yet — please check:");
      toast.error("Please check the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const saved = routeService.save(r, pending);
      setPending([]);
      guard.allowNext();
      toast.success(isNew ? `Route ${saved.code} created` : `Route ${saved.code} saved`);
      if (isNew) void navigate({ to: "/routing/$id", params: { id: saved.id } });
      else setR(structuredClone(saved));
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
      title={inputError ?? "Recalculate Route"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Recalculate Route
    </Button>
  );

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Routing", to: "/routing" }, { label: isNew ? "New" : "Edit" }]}
        title={isNew ? "New Route" : "Edit Route"}
        rootLabel="Master Data"
        unsavedLabel="Unsaved"
        dirty={dirty}
        saving={saving}
        onBack={() => void navigate({ to: "/routing" })}
        onCancel={() => void navigate({ to: "/routing" })}
        onSave={save}
        extra={
          <>
            <div className="relative" title={errors["status"]}>
              <span
                className={cn(
                  "absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full",
                  r.status === "Active" ? "bg-success" : "bg-muted-foreground",
                )}
              />
              <select
                aria-label="Status"
                value={r.status}
                onChange={(e) => set("status", e.target.value as Status)}
                className={cn(
                  "h-11 appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring",
                  errors["status"] && "border-destructive",
                )}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ▾
              </span>
            </div>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              Change History
            </Button>
            {recalcButton}
          </>
        }
      />

      <FormErrorBanner message={formError} errors={errors} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[6fr_4fr]">
        {/* ---------- LEFT ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Route Information" bodyClassName="p-0">
            <div className="p-4">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Route Code" required error={errors["code"]}>
                  <Input
                    className="h-10"
                    value={r.code}
                    onChange={(e) => set("code", e.target.value.toUpperCase())}
                    placeholder="e.g. RT-HCM-DN"
                    aria-invalid={!!errors["code"] || undefined}
                  />
                </Field>
                <Field label="Route Name" required error={errors["name"]}>
                  <Input
                    className="h-10"
                    value={r.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. HCM → Da Nang"
                    aria-invalid={!!errors["name"] || undefined}
                  />
                </Field>
                <Field label="Route Type">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2" role="radiogroup">
                    {(
                      [
                        ["Single Trip", "Single Trip"],
                        ["Round Trip", "Round Trip"],
                      ] as [RouteType, string][]
                    ).map(([v, label]) => (
                      <label key={v} className="flex cursor-pointer items-center gap-2 text-[15px]">
                        <input
                          type="radio"
                          name="routeType"
                          checked={r.type === v}
                          onChange={() => changeRouteType(v)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <span className={cn(r.type === v && "text-primary")}>{label}</span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Terrain">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2" role="radiogroup">
                    {(
                      [
                        ["Plain", "Plain"],
                        ["Highland", "Highland"],
                      ] as [Terrain, string][]
                    ).map(([v, label]) => (
                      <label key={v} className="flex cursor-pointer items-center gap-2 text-[15px]">
                        <input
                          type="radio"
                          name="terrain"
                          checked={(r.terrain ?? "Plain") === v}
                          onChange={() => set("terrain", v)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        <span className={cn((r.terrain ?? "Plain") === v && "text-primary")}>
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Notes" className="col-span-2">
                  <Textarea
                    rows={2}
                    maxLength={500}
                    value={r.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="e.g. Cargo route from Ho Chi Minh City to Da Nang"
                  />
                  <span className="self-end text-xs text-muted-foreground">
                    {(r.description ?? "").length}/500
                  </span>
                </Field>
              </div>
            </div>
            {/* Same columns as the stop list: Distance over Location Code, time over Location. */}
            <div
              className="grid items-center border-y bg-muted/40 py-2 text-sm"
              style={{ gridTemplateColumns: STOP_COLUMNS.map(([, w]) => w).join(" ") }}
            >
              <span className="col-span-2 px-4 font-semibold">Route Detail</span>
              <div className="flex min-w-0 items-center gap-2 px-2">
                <label htmlFor="route-distance" className="shrink-0 text-muted-foreground">
                  Distance
                </label>
                <span className="relative w-28 shrink-0">
                  <Input
                    id="route-distance"
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8 w-full bg-card pr-9 text-right font-semibold"
                    value={
                      kmText ??
                      (totals.calculated || kmOverride !== undefined
                        ? String(totals.distanceKm)
                        : "")
                    }
                    placeholder="—"
                    title={
                      totals.calculated
                        ? `Calculated: ${calculatedKm} km — type to adjust, clear to reset`
                        : "Filled in by Recalculate Route; you can also type it."
                    }
                    onChange={(e) => setKmText(e.target.value)}
                    onBlur={commitKm}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitKm();
                      if (e.key === "Escape") setKmText(null);
                    }}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    km
                  </span>
                </span>
                {kmOverride !== undefined && totals.calculated && (
                  <button
                    type="button"
                    title={`Back to the calculated ${calculatedKm} km`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                    onClick={() => setDistance(null)}
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-2 px-2">
                <label htmlFor="route-time" className="shrink-0 text-muted-foreground">
                  Estimated Time
                </label>
                <Input
                  id="route-time"
                  readOnly
                  className="h-8 w-28 shrink-0 bg-card font-semibold"
                  value={totals.calculated ? formatDuration(totals.estimatedTimeMin) : ""}
                  placeholder="—"
                  title="Estimated driving time of the selected route"
                />
              </div>
              <div className="flex justify-center px-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 px-2.5 text-primary"
                  onClick={addStop}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
            <StopList
              seq={seq}
              onChange={setSequence}
              locations={locations}
              returnPoint={round ? r.origin : undefined}
              errors={{
                origin: errors["origin"],
                destination: errors["destination"],
                waypoints: errors["waypoints"],
              }}
            />
          </Panel>
        </div>

        {/* ---------- RIGHT ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Route Map"
            bodyClassName="flex flex-col gap-3 p-4"
            actions={
              <VehicleClassPicker
                profile={r.vehicleProfile}
                vehicleClass={vehicleClass}
                disabled={loading}
                onChange={changeVehicle}
              />
            }
          >
            <RouteAlternativeSelector
              alternatives={r.alternatives}
              selectedId={r.selectedRouteId}
              onSelect={selectAlternative}
              disabled={loading}
            />
            {stale && (
              <div className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />
                Route needs recalculation — inputs changed since the last calculation.
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
                  Retry
                </Button>
              </div>
            )}
            <div className="relative">
              <RouteMapPanel
                onRouteDrag={loading || !r.outbound ? undefined : addViaPoint}
                onWaypointDrag={loading || !r.outbound ? undefined : moveWaypoint}
                origin={r.origin}
                waypoints={r.waypoints}
                destination={r.destination}
                outboundGeometry={r.outbound?.geometry}
                tolls={mapTolls}
                providerLabel={
                  r.outbound
                    ? r.outbound.provider === "vietmap"
                      ? "Vietmap Route v4"
                      : r.outbound.provider === "valhalla"
                        ? "OSM/Valhalla · truck roads"
                        : "Mock route data"
                    : "Route not calculated"
                }
                height={240}
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
                  Calculating route…
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title={`Toll Stations${r.outbound ? ` (${selectedName.replace(" (Recommended)", "")})` : ""}`}
            bodyClassName="p-0"
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 text-primary"
                  disabled={!r.outbound || loading}
                  title={r.outbound ? "Add Toll" : "Calculate the route first"}
                  onClick={() => setAddTollOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Toll
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-primary/40 text-primary"
                  onClick={() => setTollDetailsOpen(true)}
                >
                  <List className="h-4 w-4" />
                  View Details
                </Button>
              </div>
            }
          >
            {totals.calculated && (
              <div className="flex flex-wrap gap-x-8 gap-y-1 border-b bg-muted/40 px-4 py-2 text-sm">
                <span>
                  Tolls: <b className="text-base">{tollRows.length}</b>
                </span>
              </div>
            )}
            <TollStationTable rows={tollRows} showLeg={round} calculated={totals.calculated} />
          </Panel>
        </div>
      </div>

      <TollDetailsSheet
        open={tollDetailsOpen}
        onOpenChange={setTollDetailsOpen}
        rows={tollRows}
        roundTrip={round}
        routeLabel={r.code || r.name || "New route"}
      />
      <AddTollDialog
        open={addTollOpen}
        onOpenChange={setAddTollOpen}
        tollClass={vehicleClass - 1}
        existingIds={new Set(tollRows.map((x) => x.station.id))}
        legs={round && r.returnMode === "custom" ? ["Outbound", "Return"] : ["Outbound"]}
        onAdd={addToll}
      />
      <AuditHistoryDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Route"
        entityId={source?.id}
        title={r.code || "New route"}
        english
      />
    </div>
  );
}
