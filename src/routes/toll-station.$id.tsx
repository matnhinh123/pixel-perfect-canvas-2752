import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions } from "@/services/commonCodeService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  History,
  Lock,
  MapPin,
  Pencil,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import { MapPickerDialog } from "@/components/movex/location/MapPickerDialog";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { reverseGeocode } from "@/services/reverseGeocode";
import { VN_PROVINCES } from "@/mock-data/locationCatalog";
import { cn } from "@/lib/utils";
import { useCollection } from "@/hooks/use-store";
import { locationRepository, tollStationRepository } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  FEE_TYPE_OPTIONS,
  TOLL_GROUPS,
  archiveTollStations,
  draftOf,
  feeTypeFromLabel,
  feeTypeName,
  locationLabel,
  newTollStationDraft,
  sourceOf,
  tollStationCrud,
  tollStationService,
  tollStationStatus,
  validateTollStation,
  type TollStationDraft,
} from "@/services/tollStationService";
import { formatNumber } from "@/lib/format";
import type { Status } from "@/types";

type Mode = "view" | "edit";
const CURRENCIES = ["VND", "USD"];

export const Route = createFileRoute("/toll-station/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Add Toll Station — MoveX" : "Toll Station — MoveX" }],
  }),
  component: TollStationPage,
});

function TollStationPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const all = useCollection(tollStationRepository);
  const source = id === "new" ? null : (all.find((g) => g.id === id && !g.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title="Toll station not found"
          action={
            <Button asChild size="sm">
              <Link to="/toll-station">Back to Toll Stations</Link>
            </Button>
          }
        />
      </Panel>
    );
  if (!source || search.mode === "edit")
    return <TollStationForm key={source?.id ?? "new"} source={source} />;
  return <TollStationView key={source.id} station={source} />;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

/** The 5 fixed toll groups; fees editable in the form, read-only in the view. */
function RatesTable({
  prices,
  currency,
  onChange,
}: {
  prices: TollGateRecord["prices"];
  currency: string;
  onChange?: ((prices: TollGateRecord["prices"]) => void) | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={`${thClass} w-28`}>Toll Group</TableHead>
          <TableHead className={thClass}>Remark</TableHead>
          <TableHead className={`${thClass} w-44 text-right`}>Toll Fee</TableHead>
          <TableHead className={`${thClass} w-24`}>Currency</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {TOLL_GROUPS.map(({ group, applied }, i) => (
          <TableRow key={group}>
            <TableCell className="py-2 font-semibold">Group {group}</TableCell>
            <TableCell className="py-2 text-muted-foreground">{applied}</TableCell>
            <TableCell className="py-1.5 text-right">
              {onChange ? (
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  aria-label={`Group ${group} toll fee`}
                  className="h-8 text-right font-medium"
                  value={Number.isFinite(prices[i]) ? prices[i] : ""}
                  onChange={(e) =>
                    onChange(
                      prices.map((p, j) =>
                        j === i ? (e.target.value === "" ? NaN : Number(e.target.value)) : p,
                      ) as TollGateRecord["prices"],
                    )
                  }
                />
              ) : (
                <span className="font-medium">{formatNumber(prices[i] ?? 0)}</span>
              )}
            </TableCell>
            <TableCell className="py-2">{currency}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------- detail

function TollStationView({ station }: { station: TollGateRecord }) {
  const navigate = useNavigate();
  const actions = useEntityActions(tollStationCrud, "en");
  const [auditOpen, setAuditOpen] = useState(false);
  const locations = useCollection(locationRepository);
  const loc = station.locationId ? locations.find((l) => l.id === station.locationId) : undefined;
  const hasCoords = Number.isFinite(station.lat) && Number.isFinite(station.lng);
  const confirm = useConfirm();

  const archive = async (archived: boolean) => {
    const r = await confirm(
      archived
        ? {
            title: `Archive Toll Station ${station.code}?`,
            description:
              "The station is kept with its rates and history, set to Inactive and no longer used for route calculation. You can restore it later.",
            cancelLabel: "Cancel",
            confirmLabel: "Archive",
            tone: "danger",
          }
        : {
            title: `Restore Toll Station ${station.code}?`,
            description:
              "The station returns from the archive as Inactive. Activate it to use it for routing again.",
            cancelLabel: "Cancel",
            confirmLabel: "Restore",
          },
    );
    if (r !== "confirm") return;
    if (archiveTollStations([station.id], archived))
      toast.success(`Toll station ${station.code} ${archived ? "archived" : "restored"}`);
  };

  useEffect(() => {
    auditService.logView("Toll Station", station.id, station.code);
  }, [station.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <FormPageHeader
        crumbs={[{ label: "Toll Station", to: "/toll-station" }, { label: station.code }]}
        rootLabel="Master Data"
        title={
          <span className="flex flex-col gap-1">
            <span>{station.name}</span>
            <span className="text-sm font-normal text-muted-foreground">{station.code}</span>
          </span>
        }
        badge={<StatusBadge status={tollStationStatus(station)} />}
        readOnly
        onBack={() => void navigate({ to: "/toll-station" })}
        extra={
          <>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              Change History
            </Button>
            {station.archived ? (
              <Button variant="outline" size="lg" onClick={() => void archive(false)}>
                <ArchiveRestore className="h-4 w-4" />
                Restore
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => void archive(true)}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            )}
            {station.archived ? null : station.status === "Inactive" ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => void actions.setStatus([station], "Active")}
              >
                <CheckCircle2 className="h-4 w-4" />
                Activate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                onClick={() => void actions.setStatus([station], "Inactive")}
              >
                <XCircle className="h-4 w-4" />
                Deactivate
              </Button>
            )}
            <Button
              size="lg"
              onClick={() =>
                void navigate({
                  to: "/toll-station/$id",
                  params: { id: station.id },
                  search: { mode: "edit" },
                })
              }
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <Panel title="General">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
            <InfoRow label="Location">
              {locationLabel(
                station,
                loc ? `${loc.code ? `${loc.code} · ` : ""}${loc.name}` : undefined,
              )}
            </InfoRow>
            <InfoRow label="Fee Type">{feeTypeName(station.feeType)}</InfoRow>
            <InfoRow label="Source From">
              <Tag tone={sourceOf(station)}>{sourceOf(station)}</Tag>
            </InfoRow>
            <InfoRow label="Map Position">
              {hasCoords ? `${station.lat}, ${station.lng}` : null}
            </InfoRow>
            <InfoRow label="Province/City">{station.province}</InfoRow>
            <div className="sm:col-span-2">
              <InfoRow label="Address">{station.address}</InfoRow>
            </div>
            <div className="sm:col-span-3">
              <InfoRow label="Remark">{station.remark}</InfoRow>
            </div>
          </dl>
        </Panel>
        <Panel title="Toll Rates" bodyClassName="p-0">
          <RatesTable prices={station.prices} currency={station.currency ?? "VND"} />
        </Panel>
      </div>
      <AuditHistoryDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        entityType="Toll Station"
        entityId={station.id}
        title={station.code}
        english
      />
    </div>
  );
}

// ---------------------------------------------------------------- create / edit

function TollStationForm({ source }: { source: TollGateRecord | null }) {
  const navigate = useNavigate();
  const feeTypes = useCodeOptions(CC.TOLL_FEE_TYPE, FEE_TYPE_OPTIONS);
  const isNew = !source;
  const initial = useMemo(() => (source ? draftOf(source) : newTollStationDraft()), [source]);
  const [d, setD] = useState<TollStationDraft>(initial);
  const [status, setStatus] = useState<Status>(
    source?.status === "Inactive" ? "Inactive" : "Active",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const hasCoords = Number.isFinite(d.lat) && Number.isFinite(d.lng);
  const [mapOpen, setMapOpen] = useState(false);
  // Keep a stored province selectable even when it is not in the catalog.
  const provinces =
    d.province && !VN_PROVINCES.includes(d.province) ? [d.province, ...VN_PROVINCES] : VN_PROVINCES;

  // Map spot → Province/City / Address (reverse geocoding), as on Location. Only the latest pick counts.
  const geoSeq = useRef(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      const n = { ...e };
      for (const k of keys) delete n[k];
      return n;
    });
  const pickSpot = (p: { lat: number; lng: number }) => {
    setD((x) => ({ ...x, lat: p.lat, lng: p.lng }));
    clearErrors("lat", "lng");
    if (!Number.isFinite(p.lat)) return;
    const seq = ++geoSeq.current;
    setGeoBusy(true);
    reverseGeocode(p.lat, p.lng)
      .then((r) => {
        if (seq !== geoSeq.current) return;
        if (!r) throw new Error("empty");
        setD((x) => ({
          ...x,
          province: r.province || x.province,
          address: r.address || x.address,
        }));
        clearErrors("province", "address");
      })
      .catch(() => {
        if (seq === geoSeq.current)
          toast.error("Could not look up the address of this spot — please type it.");
      })
      .finally(() => {
        if (seq === geoSeq.current) setGeoBusy(false);
      });
  };
  /** Another Province/City no longer matches the map position: clear it, drop a pending lookup. */
  const changeProvince = (province: string) => {
    if (province === d.province) return;
    geoSeq.current++;
    setGeoBusy(false);
    setD((x) => ({ ...x, province, lat: NaN, lng: NaN }));
    clearErrors("province", "lat", "lng");
  };

  const dirty =
    JSON.stringify(d) !== JSON.stringify(initial) || status !== (source?.status ?? "Active");
  const guard = useUnsavedChangesGuard(dirty);

  const set = <K extends keyof TollStationDraft>(k: K, v: TollStationDraft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  };

  const back = () =>
    source
      ? void navigate({
          to: "/toll-station/$id",
          params: { id: source.id },
          search: { mode: "view" },
        })
      : void navigate({ to: "/toll-station" });

  const save = () => {
    setFormError(null);
    const e = validateTollStation(d, source?.id);
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError("Cannot save yet — please check:");
      toast.error("Please check the highlighted fields.");
      return;
    }
    try {
      const saved = tollStationService.save(d, source?.id);
      if (saved.status !== status)
        tollStationCrud.setStatus([saved.id], status as "Active" | "Inactive");
      guard.allowNext();
      toast.success(
        isNew ? `Toll station ${saved.code} created` : `Toll station ${saved.code} saved`,
      );
      void navigate({
        to: "/toll-station/$id",
        params: { id: saved.id },
        search: { mode: "view" },
      });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Toll Station", to: "/toll-station" },
          ...(source ? [{ label: source.code, to: `/toll-station/${source.id}` }] : []),
          { label: isNew ? "New" : "Edit" },
        ]}
        rootLabel="Master Data"
        unsavedLabel="Unsaved"
        title={isNew ? "Add Toll Station" : `Edit: ${source.name}`}
        badge={source?.archived ? <StatusBadge status="Archived" /> : undefined}
        dirty={dirty}
        onBack={back}
        onCancel={back}
        onSave={save}
        extra={
          // Status sits in the header when editing (a new station starts Active).
          source && (
            <div className="relative">
              <span
                className={cn(
                  "absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full",
                  status === "Active" ? "bg-success" : "bg-muted-foreground",
                )}
              />
              <select
                aria-label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="h-11 appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ▾
              </span>
            </div>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="flex flex-col gap-5">
        <Panel title="General">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
            <Field label="Toll Station Code" required error={errors["code"]}>
              <Input
                value={d.code}
                placeholder="e.g. QL1A-NL"
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Toll Station Name" required error={errors["name"]}>
              <Input
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Fee Type" required>
              <NativeSelect
                value={feeTypeName(d.feeType)}
                onChange={(v) => set("feeType", feeTypeFromLabel(v, d.feeType))}
                options={feeTypes}
              />
            </Field>
            <Field label="Source From">
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                {(d.vietmapId ?? "").trim() ? "Vietmap" : "Manual"}
              </div>
            </Field>
            <Field
              label="Map Position"
              error={errors["lat"] ?? errors["lng"]}
              info="Gate position as “Latitude, Longitude”. Click to pick it on the map: Province/City and Address are filled in and stay editable. Changing Province/City clears the position to pick again."
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className={cn(
                    "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    (errors["lat"] || errors["lng"]) && "border-destructive",
                    hasCoords ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {hasCoords ? `${d.lat}, ${d.lng}` : "Click to pick a spot on the map"}
                  </span>
                </button>
                {hasCoords && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Clear position"
                    onClick={() => setD((p) => ({ ...p, lat: NaN, lng: NaN }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Province/City" error={errors["province"]}>
              <SearchableSelect
                value={d.province ?? ""}
                onChange={changeProvince}
                options={["", ...provinces]}
                labels={{ "": "Select Province/City" }}
                invalid={!!errors["province"]}
                searchPlaceholder="Type to search…"
                emptyText="No matching province / city"
              />
            </Field>
            <Field
              label="Address"
              error={errors["address"]}
              className="sm:col-span-3"
              hint={geoBusy ? "Looking up the address…" : undefined}
            >
              <Input
                value={d.address ?? ""}
                placeholder="Enter Address"
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
            <Field label="Remark" className="sm:col-span-3">
              <Textarea
                rows={2}
                value={d.remark ?? ""}
                onChange={(e) => set("remark", e.target.value)}
              />
            </Field>
          </div>
          <MapPickerDialog
            open={mapOpen}
            onOpenChange={setMapOpen}
            lat={d.lat}
            lng={d.lng}
            onConfirm={pickSpot}
          />
        </Panel>

        <Panel
          title="Toll Rates"
          bodyClassName="p-0"
          actions={
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Currency</span>
              <NativeSelect
                value={d.currency ?? "VND"}
                onChange={(v) => set("currency", v)}
                options={CURRENCIES}
                className="h-8"
              />
            </label>
          }
        >
          {errors["prices"] && (
            <p className="border-b px-4 py-2 text-xs font-medium text-destructive">
              {errors["prices"]}
            </p>
          )}
          <RatesTable
            prices={d.prices}
            currency={d.currency ?? "VND"}
            onChange={(prices) => set("prices", prices)}
          />
        </Panel>
      </div>
    </div>
  );
}
