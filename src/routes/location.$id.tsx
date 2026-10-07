import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, MapPin, Pencil, Save, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { FormGroup, ReadOnlyScope, S3, S6, S12 } from "@/components/movex/general/FormParts";
import { MapPickerDialog } from "@/components/movex/location/MapPickerDialog";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  draftOfLocation,
  locationService,
  newLocationDraft,
  type LocationDraft,
} from "@/services/locationService";
import { LOCATION_COUNTRIES, LOCATION_TYPES, SERVICE_MODES } from "@/mock-data/locationCatalog";
import type { LocationMasterRecord } from "@/mock-data/locations";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/location/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Location — MoveX" : "Location — MoveX" }],
  }),
  component: LocationPage,
});

function LocationPage() {
  const { t } = useT();
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useCollection(locationRepository);
  const source = id === "new" ? null : (all.find((r) => r.id === id && !r.deleted) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title={t("Không tìm thấy địa điểm", "Location not found")}
          action={
            <Button asChild size="sm">
              <Link to="/location">{t("Về danh sách", "Back to list")}</Link>
            </Button>
          }
        />
      </Panel>
    );
  // `key` resets the form state when switching between records / modes.
  return (
    <LocationForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
  );
}

function LocationForm({
  source,
  readOnly,
}: {
  source: LocationMasterRecord | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const isNew = !source;
  const initial = useMemo<LocationDraft>(
    () => (source ? draftOfLocation(source) : newLocationDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<LocationDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      if ("lat" in p || "lng" in p) delete n["coords"];
      return n;
    });
  };
  const text = (k: keyof LocationDraft) => ({
    value: String(d[k] ?? ""),
    onChange: (e: { target: { value: string } }) => patch({ [k]: e.target.value }),
    "aria-invalid": !!errors[k] || undefined,
  });
  const select = (
    k: keyof LocationDraft,
    options: readonly string[],
    placeholder: string,
    disabled?: boolean,
  ): Parameters<typeof NativeSelect>[0] => ({
    value: String(d[k] ?? ""),
    onChange: (v) => patch({ [k]: v }),
    options: ["", ...options],
    labels: { "": readOnly ? "—" : placeholder },
    className: "w-full",
    invalid: !!errors[k],
    ...(disabled !== undefined ? { disabled } : {}),
  });

  const hasCoords = Number.isFinite(d.lat) && Number.isFinite(d.lng);
  const subTypes = LOCATION_TYPES[d.locationType] ?? [];

  const back = () =>
    source
      ? void navigate({ to: "/location/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: "/location" });

  const save = () => {
    setFormError(null);
    try {
      const saved = locationService.save(d, source?.id);
      guard.allowNext();
      toast.success(
        isNew
          ? t(`Đã thêm địa điểm ${saved.code}`, `Location ${saved.code} added`)
          : t(`Đã lưu địa điểm ${saved.code}`, `Location ${saved.code} saved`),
      );
      void navigate({ to: "/location/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(t("Chưa thể lưu — vui lòng kiểm tra:", "Cannot save yet — please check:"));
      }
      toast.error(err instanceof Error ? err.message : t("Lưu thất bại", "Save failed"));
    }
  };

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Location", to: "/location" },
          ...(source ? [{ label: source.code ?? source.name }] : []),
          {
            label: isNew ? "Add New" : readOnly ? t("Chi tiết", "Detail") : t("Chỉnh sửa", "Edit"),
          },
        ]}
        title={
          isNew
            ? "Create Location"
            : readOnly
              ? source.name
              : t(`Chỉnh sửa: ${source.name}`, `Edit: ${source.name}`)
        }
        subtitle={source?.code}
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/location" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          source && (
            <>
              <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" />
                {t("Lịch sử", "History")}
              </Button>
              {readOnly && (
                <Button asChild size="lg">
                  <Link to="/location/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <ReadOnlyScope readOnly={readOnly}>
        <Panel title="General Information" bodyClassName="space-y-6">
          <FormGroup title={t("Địa điểm", "Location")}>
            <Field
              label="Location Code"
              required
              error={errors["code"]}
              className={S3}
              info={t(
                "Duy nhất. 2–20 ký tự: chữ, số, - hoặc _. Hệ thống gợi ý mã kế tiếp (VN001, VN002…), có thể sửa.",
                "Unique. 2–20 characters: letters, digits, - or _. The next code (VN001, VN002…) is suggested; you can change it.",
              )}
            >
              <Input
                placeholder="Enter Location Code"
                maxLength={20}
                value={d.code}
                onChange={(e) =>
                  patch({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })
                }
                aria-invalid={!!errors["code"] || undefined}
              />
            </Field>
            <Field label="Location Name" required error={errors["name"]} className={S3}>
              <Input placeholder="Enter Location Name" {...text("name")} />
            </Field>
            <Field label="Location Type" required error={errors["locationType"]} className={S3}>
              <NativeSelect
                {...select("locationType", Object.keys(LOCATION_TYPES), "Select Location Type")}
                onChange={(v) => patch({ locationType: v, locationSubType: "" })}
              />
            </Field>
            <Field
              label="Location Sub Type"
              required
              error={errors["locationSubType"]}
              className={S3}
            >
              <NativeSelect
                {...select(
                  "locationSubType",
                  subTypes,
                  "Select Location Sub Type",
                  !readOnly && !d.locationType,
                )}
              />
            </Field>

            <Field label="Service Mode" required error={errors["serviceMode"]} className={S3}>
              <NativeSelect {...select("serviceMode", SERVICE_MODES, "Select Service Mode")} />
            </Field>
            <Field label="Country" required error={errors["country"]} className={S3}>
              <NativeSelect {...select("country", LOCATION_COUNTRIES, "Select Country")} />
            </Field>
            <Field label="Longitude/Latitude" error={errors["coords"]} className={S6}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className={cn(
                    "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "group-disabled:pointer-events-none group-disabled:bg-muted/40",
                    errors["coords"] && "border-destructive",
                    hasCoords ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {hasCoords
                      ? `${d.lng}, ${d.lat}`
                      : readOnly
                        ? "—"
                        : t("Click để chọn vị trí trên bản đồ", "Click to pick a spot on the map")}
                  </span>
                </button>
                {hasCoords && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="group-disabled:hidden"
                    aria-label={t("Xoá toạ độ", "Clear coordinates")}
                    onClick={() => patch({ lat: NaN, lng: NaN })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Field>

            <Field label="Address" required error={errors["address"]} className={S12}>
              <Input placeholder="Enter Address" {...text("address")} />
            </Field>
          </FormGroup>

          <FormGroup title={t("Mã & đơn vị vận hành", "Codes & Operator")}>
            <Field
              label="UN/LOCODE"
              error={errors["unLocode"]}
              className={S3}
              info={t(
                "Mã địa điểm của Liên Hợp Quốc: 2 chữ quốc gia + 3 ký tự (VD: VNSGN).",
                "United Nations location code: 2-letter country + 3 characters (e.g. VNSGN).",
              )}
            >
              <Input
                placeholder="Enter UN/LOCODE"
                maxLength={5}
                value={d.unLocode}
                onChange={(e) => patch({ unLocode: e.target.value.toUpperCase() })}
                aria-invalid={!!errors["unLocode"] || undefined}
              />
            </Field>
            <Field
              label="IATA Code"
              error={errors["iataCode"]}
              className={S3}
              info={t(
                "Mã 3 chữ cái của sân bay theo IATA (VD: SGN).",
                "3-letter IATA airport code (e.g. SGN).",
              )}
            >
              <Input
                placeholder="Enter IATA Code"
                maxLength={3}
                value={d.iataCode}
                onChange={(e) => patch({ iataCode: e.target.value.toUpperCase() })}
                aria-invalid={!!errors["iataCode"] || undefined}
              />
            </Field>
            <Field label="External Code" className={S3}>
              <Input placeholder="Enter External Code" {...text("externalCode")} />
            </Field>
            <Field label="Operator Name" className={S3}>
              <Input placeholder="Enter Operator Name" {...text("operatorName")} />
            </Field>
          </FormGroup>

          <FormGroup title={t("Kiểm soát & trạng thái", "Control & Status")}>
            <Field label="Is Customs Controlled" className={S3}>
              <SwitchRow
                checked={d.customsControlled}
                onChange={(v) => patch({ customsControlled: v })}
                on="Yes"
                off="No"
              />
            </Field>
            <Field label="Is Bonded" className={S3}>
              <SwitchRow
                checked={d.bonded}
                onChange={(v) => patch({ bonded: v })}
                on="Yes"
                off="No"
              />
            </Field>
            <Field label="Status" className={S3}>
              <SwitchRow
                checked={d.status === "Active"}
                onChange={(v) => patch({ status: v ? "Active" : "Inactive" })}
                on="Active"
                off="Inactive"
              />
            </Field>
            <Field label="Remark" className={S12}>
              <Textarea rows={2} placeholder="Enter Remark" {...text("remark")} />
            </Field>
          </FormGroup>
        </Panel>
      </ReadOnlyScope>

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-7 mt-4 flex items-center justify-end gap-2 border-t bg-card/95 px-7 py-3 backdrop-blur">
          {dirty && (
            <span className="mr-auto text-sm font-medium text-warning">
              {t("Có thay đổi chưa lưu", "You have unsaved changes")}
            </span>
          )}
          <Button variant="outline" onClick={back}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={save}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      )}

      <MapPickerDialog
        open={mapOpen && !readOnly}
        onOpenChange={setMapOpen}
        lat={d.lat}
        lng={d.lng}
        onConfirm={(p) => patch({ lat: p.lat, lng: p.lng })}
      />
      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Location"
          entityId={source.id}
          title={source.code ?? source.name}
        />
      )}
    </div>
  );
}

function SwitchRow({
  checked,
  onChange,
  on,
  off,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  on: string;
  off: string;
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-sm">{checked ? on : off}</span>
    </div>
  );
}
