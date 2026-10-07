import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, History, Lock, Pencil, XCircle } from "lucide-react";
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
import { LocationAutocomplete } from "@/components/movex/routing/LocationAutocomplete";
import { useCollection } from "@/hooks/use-store";
import { locationRepository, tollStationRepository } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import { auditService } from "@/services/auditService";
import { BusinessRuleError } from "@/services/crudService";
import {
  FEE_TYPE_OPTIONS,
  TOLL_GROUPS,
  draftOf,
  feeTypeFromLabel,
  feeTypeName,
  locationLabel,
  newTollStationDraft,
  sourceOf,
  tollStationCrud,
  tollStationService,
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
          <TableHead className={thClass}>Applied Vehicle</TableHead>
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
        badge={<StatusBadge status={station.status} />}
        readOnly
        onBack={() => void navigate({ to: "/toll-station" })}
        extra={
          <>
            <Button variant="outline" size="lg" onClick={() => setAuditOpen(true)}>
              <History className="h-4 w-4" />
              Change History
            </Button>
            {station.status === "Inactive" ? (
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
      <div className="flex max-w-5xl flex-col gap-5">
        <Panel title="General">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <InfoRow label="Location">
              {locationLabel(
                station,
                loc ? `${loc.code ? `${loc.code} · ` : ""}${loc.name}` : undefined,
              )}
            </InfoRow>
            <InfoRow label="Fee Type">{feeTypeName(station.feeType)}</InfoRow>
            <InfoRow label="Vietmap ID">
              {station.vietmapId ? <span className="font-mono">{station.vietmapId}</span> : null}
            </InfoRow>
            <InfoRow label="Source">
              <Tag tone={sourceOf(station)}>{sourceOf(station)}</Tag>
            </InfoRow>
            <div className="sm:col-span-2">
              <InfoRow label="Description">{station.remark}</InfoRow>
            </div>
          </dl>
          {hasCoords && (
            <p className="mt-4 text-xs text-muted-foreground">
              Coordinates: {station.lat}, {station.lng}
            </p>
          )}
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
  const isNew = !source;
  const initial = useMemo(() => (source ? draftOf(source) : newTollStationDraft()), [source]);
  const [d, setD] = useState<TollStationDraft>(initial);
  const [status, setStatus] = useState<Status>(
    source?.status === "Inactive" ? "Inactive" : "Active",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const locationsAll = useCollection(locationRepository);
  const locations = useMemo(
    () =>
      locationsAll.filter((l) => !l.deleted && (l.status === "Active" || l.id === d.locationId)),
    [locationsAll, d.locationId],
  );
  const picked = d.locationId ? locations.find((l) => l.id === d.locationId) : undefined;

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
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

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
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        onBack={back}
        onCancel={back}
        onSave={save}
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="flex max-w-5xl flex-col gap-5">
        <Panel title="General">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Toll Station Code" required error={errors["code"]}>
              <Input
                value={d.code}
                placeholder="e.g. QL1A-NL"
                aria-invalid={!!errors["code"] || undefined}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
              />
            </Field>
            <Field
              label="Toll Station Name"
              required
              error={errors["name"]}
              className="lg:col-span-2"
            >
              <Input
                value={d.name}
                aria-invalid={!!errors["name"] || undefined}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Location" hint="Search by location code or name.">
              <LocationAutocomplete
                locations={locations}
                value={d.locationId ?? null}
                placeholder="Search location…"
                onChange={(l) =>
                  setD((p) => {
                    if (!l) {
                      const { locationId: _drop, ...rest } = p;
                      return rest;
                    }
                    const hasCoords = Number.isFinite(l.lat) && Number.isFinite(l.lng);
                    return {
                      ...p,
                      locationId: l.id,
                      province: l.province,
                      address: l.address,
                      ...(hasCoords ? { lat: l.lat, lng: l.lng } : {}),
                    };
                  })
                }
              />
            </Field>
            <Field label="Fee Type" required>
              <NativeSelect
                value={feeTypeName(d.feeType)}
                onChange={(v) => set("feeType", feeTypeFromLabel(v, d.feeType))}
                options={FEE_TYPE_OPTIONS}
              />
            </Field>
            <Field label="Status" required>
              <NativeSelect
                value={status}
                onChange={(v) => setStatus(v as Status)}
                options={["Active", "Inactive"]}
              />
            </Field>
            <Field label="Vietmap ID" error={errors["vietmapId"]}>
              <Input
                value={d.vietmapId ?? ""}
                placeholder="e.g. vm-toll-100231"
                aria-invalid={!!errors["vietmapId"] || undefined}
                onChange={(e) => set("vietmapId", e.target.value)}
              />
            </Field>
            <Field label="Source">
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                {(d.vietmapId ?? "").trim() ? "Vietmap" : "Manual"}
              </div>
            </Field>
            <Field label="Latitude" error={errors["lat"]}>
              <Input
                type="number"
                step="any"
                value={Number.isFinite(d.lat) ? d.lat : ""}
                placeholder={picked ? "From location" : "e.g. 10.8622"}
                onChange={(e) => set("lat", num(e.target.value))}
              />
            </Field>
            <Field label="Longitude" error={errors["lng"]}>
              <Input
                type="number"
                step="any"
                value={Number.isFinite(d.lng) ? d.lng : ""}
                placeholder={picked ? "From location" : "e.g. 106.7905"}
                onChange={(e) => set("lng", num(e.target.value))}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2 lg:col-span-3">
              <Textarea
                rows={2}
                value={d.remark ?? ""}
                onChange={(e) => set("remark", e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Coordinates are filled from the location when it has them; adjust to the gate position
            if needed.
          </p>
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
