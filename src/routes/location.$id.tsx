import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { History, MapPin, Pencil, X, XCircle } from "lucide-react";
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
import { FormGroup, ReadOnlyScope, S3, S12 } from "@/components/movex/general/FormParts";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { LocationCodeInput } from "@/components/movex/location/LocationCodeInput";
import { MapPickerDialog } from "@/components/movex/location/MapPickerDialog";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  draftOfLocation,
  locationService,
  newLocationDraft,
  typeFits,
  withCodeType,
  withStandardCode,
  type LocationDraft,
} from "@/services/locationService";
import { reverseGeocode } from "@/services/reverseGeocode";
import { LOCATION_COUNTRIES, LOCATION_TYPES, VN_PROVINCES } from "@/mock-data/locationCatalog";
import type { LocationMasterRecord } from "@/mock-data/locations";
import {
  CODE_KINDS,
  DOUBTFUL_STATUSES,
  findStandardCode,
  UN_LOCODE_STATUS,
  type CodeKind,
  type StandardCode,
} from "@/mock-data/standardCodes";
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
  const locationTypes = useCodeOptions(CC.LOCATION_TYPE, LOCATION_TYPES);
  // Keep a stored province selectable even when it is not in the catalog.
  const provinces =
    d.province && !VN_PROVINCES.includes(d.province) ? [d.province, ...VN_PROVINCES] : VN_PROVINCES;
  // Reference entry of the code, when it matches the chosen Code Type: it fixes the Country and
  // limits the Location Type.
  const std = [findStandardCode(d.code)].find((c) => c?.kind === d.codeType);
  const typeOptions = withCurrent(
    locationTypes.filter((x) => typeFits(d, x)),
    d.locationType,
  );
  const doubtful = std && DOUBTFUL_STATUSES.includes(std.status);

  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      const n = { ...e };
      for (const k of keys) delete n[k];
      return n;
    });

  /** A code from the reference list (picked or typed in full) fills what it knows. */
  const applyCode = (c: StandardCode) => {
    setD((x) => withStandardCode(x, c));
    clearErrors("code", "codeType", "name", "country", "locationType", "coords");
  };

  // Map spot → Country / Province / Address (reverse geocoding). Only the latest pick counts.
  const geoSeq = useRef(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const pickSpot = (p: { lat: number; lng: number }) => {
    patch({ lat: p.lat, lng: p.lng });
    if (!Number.isFinite(p.lat)) return;
    const seq = ++geoSeq.current;
    setGeoBusy(true);
    reverseGeocode(p.lat, p.lng)
      .then((r) => {
        if (seq !== geoSeq.current) return;
        if (!r) throw new Error("empty");
        setD((x) => {
          const country = r.country || x.country;
          return {
            ...x,
            country,
            province: country === (r.country || country) ? r.province : x.province,
            address: r.address || x.address,
          };
        });
        clearErrors("country", "province", "address");
      })
      .catch(() => {
        if (seq === geoSeq.current)
          toast.error(
            t(
              "Không lấy được địa chỉ từ toạ độ — vui lòng nhập tay.",
              "Could not look up the address of this spot — please type it.",
            ),
          );
      })
      .finally(() => {
        if (seq === geoSeq.current) setGeoBusy(false);
      });
  };

  /**
   * Choosing another Country or Province/City clears the Map Position (it no longer matches) and
   * drops a pending map lookup so it cannot overwrite the choice.
   */
  const changeArea = (
    p: Pick<LocationDraft, "province"> & Partial<Pick<LocationDraft, "country">>,
  ) => {
    if (Object.entries(p).every(([k, v]) => d[k as keyof LocationDraft] === v)) return;
    geoSeq.current++;
    setGeoBusy(false);
    patch({ ...p, lat: NaN, lng: NaN });
  };

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
          <FormGroup title={t("Mã & loại địa điểm", "Code & Type")}>
            <Field
              label="Code Type"
              required
              error={errors["codeType"]}
              className={S3}
              info={t(
                "UN/LOCODE (cảng / ICD) hoặc IATA Code (sân bay): chọn mã có trong danh mục chuẩn — Country lấy theo mã; UN/LOCODE là Seaport hoặc Depot, IATA Code là Airport. Local Code: mã do tenant tự đặt.",
                "UN/LOCODE (port / ICD) or IATA Code (airport): pick a code from the reference list — Country follows the code; a UN/LOCODE is a Seaport or a Depot, an IATA Code an Airport. Local Code: a code the tenant defines.",
              )}
            >
              <NativeSelect
                value={d.codeType}
                options={[...CODE_KINDS]}
                className="w-full"
                invalid={!!errors["codeType"]}
                onChange={(v) => {
                  setD((x) => withCodeType(x, v as CodeKind));
                  clearErrors("codeType", "code", "locationType", "country");
                }}
              />
            </Field>
            {/* The code field is named after the chosen Code Type. */}
            <Field
              label={d.codeType}
              required
              error={errors["code"]}
              className={S3}
              info={
                d.codeType === "UN/LOCODE"
                  ? t(
                      "Mã địa điểm của Liên Hợp Quốc: 2 chữ quốc gia + 3 ký tự (VD: VNSGN). Gõ mã hoặc tên để chọn từ danh mục.",
                      "United Nations location code: 2-letter country + 3 characters (e.g. VNSGN). Type a code or name to pick from the list.",
                    )
                  : d.codeType === "IATA Code"
                    ? t(
                        "Mã 3 chữ cái của sân bay theo IATA (VD: SGN). Gõ mã hoặc tên để chọn từ danh mục.",
                        "3-letter IATA airport code (e.g. SGN). Type a code or name to pick from the list.",
                      )
                    : t(
                        "Mã do tenant tự đặt, duy nhất. 2–20 ký tự: chữ, số, - hoặc _. Hệ thống gợi ý mã kế tiếp (VN001, VN002…).",
                        "Tenant-defined, unique. 2–20 letters, digits, - or _. The next code (VN001, VN002…) is suggested.",
                      )
              }
              hint={
                doubtful ? (
                  <span className="text-warning">
                    {t(
                      `Mã đang ở trạng thái ${std.status}: ${UN_LOCODE_STATUS[std.status] ?? ""}. Kiểm tra trước khi dùng.`,
                      `Code status ${std.status}: ${UN_LOCODE_STATUS[std.status] ?? ""}. Check before use.`,
                    )}
                  </span>
                ) : undefined
              }
            >
              <LocationCodeInput
                value={d.code}
                onChange={(code) => {
                  const c = findStandardCode(code);
                  if (c && c.kind === d.codeType) applyCode(c);
                  else patch({ code });
                }}
                onPick={applyCode}
                kind={d.codeType}
                country={d.country}
                placeholder={
                  d.codeType === "UN/LOCODE"
                    ? t("Gõ UN/LOCODE hoặc tên cảng", "Type a UN/LOCODE or port name")
                    : d.codeType === "IATA Code"
                      ? t("Gõ IATA Code hoặc tên sân bay", "Type an IATA Code or airport name")
                      : "Enter Local Code"
                }
                invalid={!!errors["code"]}
              />
            </Field>
            <Field
              label="Location Name"
              required
              error={errors["name"]}
              className={S3}
              info={t(
                "Tên hiển thị nội bộ; với mã chuẩn mặc định lấy tên chính thức, có thể sửa.",
                "Internal display name; a standard code fills its official name, editable.",
              )}
            >
              <Input placeholder="Enter Location Name" {...text("name")} />
            </Field>
            <Field
              label="Location Type"
              required
              error={errors["locationType"]}
              className={S3}
              info={t(
                "UN/LOCODE: chọn Seaport (cảng biển / cảng sông) hoặc Depot (ICD – cảng cạn, bãi container nội địa). IATA Code: luôn là Airport. Local Code: chọn tự do.",
                "UN/LOCODE: Seaport (sea / river port) or Depot (ICD – inland container depot / yard). IATA Code: always Airport. Local Code: any type.",
              )}
            >
              <NativeSelect
                {...select("locationType", typeOptions, "Select Location Type")}
                disabled={d.codeType === "IATA Code"}
              />
            </Field>
          </FormGroup>

          {std && <StandardInfo c={std} t={t} />}

          <FormGroup title={t("Vị trí", "Position")}>
            <Field
              label="Map Position"
              error={errors["coords"]}
              className={S3}
              info={t(
                'Toạ độ của địa điểm, ghi dạng "Latitude, Longitude" (Vĩ độ, Kinh độ). VD: 10.7704, 106.7858 — Latitude (vĩ độ) -90…90, Longitude (kinh độ) -180…180. Chọn điểm trên bản đồ: Country, Province/City và Address được điền tự động (OpenStreetMap), có thể sửa lại. Đổi Country hoặc Province/City sẽ xoá toạ độ để chọn lại.',
                'The location\'s coordinates, written "Latitude, Longitude". e.g. 10.7704, 106.7858 — Latitude -90…90, Longitude -180…180. Pick a spot on the map: Country, Province/City and Address are filled in (OpenStreetMap) and stay editable. Changing Country or Province/City clears the position to pick again.',
              )}
            >
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
                      ? `${d.lat}, ${d.lng}`
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
            <Field
              label="Country"
              required
              error={errors["country"]}
              className={S3}
              info={
                std
                  ? t(
                      `Điền sẵn theo ${std.kind} ${std.code}; có thể đổi.`,
                      `Filled from ${std.kind} ${std.code}; can be changed.`,
                    )
                  : undefined
              }
            >
              <SearchableSelect
                {...select("country", LOCATION_COUNTRIES, "Select Country")}
                searchPlaceholder={t("Gõ để tìm quốc gia…", "Type to search…")}
                emptyText={t("Không có quốc gia phù hợp", "No matching country")}
                onChange={(v) => changeArea({ country: v, province: "" })}
              />
            </Field>
            <Field label="Province/City" error={errors["province"]} className={S3}>
              {d.country === "Vietnam" ? (
                <SearchableSelect
                  {...select("province", provinces, "Select Province/City")}
                  searchPlaceholder={t("Gõ để tìm tỉnh / thành phố…", "Type to search…")}
                  emptyText={t("Không có tỉnh / thành phố phù hợp", "No matching province / city")}
                  onChange={(v) => changeArea({ province: v })}
                />
              ) : (
                <Input
                  placeholder="Enter Province/City"
                  {...text("province")}
                  onChange={(e) => changeArea({ province: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Address"
              required
              error={errors["address"]}
              className={S3}
              hint={
                geoBusy ? t("Đang lấy địa chỉ từ bản đồ…", "Looking up the address…") : undefined
              }
            >
              <Input placeholder="Enter Address" {...text("address")} />
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

      <MapPickerDialog
        open={mapOpen && !readOnly}
        onOpenChange={setMapOpen}
        lat={d.lat}
        lng={d.lng}
        onConfirm={pickSpot}
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

/** Read-only facts of a standard code, exactly as the international list publishes them. */
function StandardInfo({ c, t }: { c: StandardCode; t: (vi: string, en: string) => string }) {
  const coords = Number.isFinite(c.lat) && Number.isFinite(c.lng) ? `${c.lat}, ${c.lng}` : "—";
  const items: [string, ReactNode][] =
    c.kind === "UN/LOCODE"
      ? [
          ["Official Name", c.name],
          ["Country", `${c.country || "—"} (${c.iso2})`],
          ["Subdivision", c.subdivision || "—"],
          ["Function", c.functions.join(", ") || "—"],
          [
            "Status",
            <span
              key="s"
              className={DOUBTFUL_STATUSES.includes(c.status) ? "text-warning" : undefined}
            >
              {c.status} — {UN_LOCODE_STATUS[c.status] ?? "—"}
            </span>,
          ],
          ["Coordinates", coords],
          ["Last Updated", c.updated || "—"],
          ["Remarks", c.remarks || "—"],
        ]
      : [
          ["Airport Name", c.name],
          ["City", c.city || "—"],
          ["Country", `${c.country || "—"} (${c.iso2})`],
          ["ICAO Code", c.icao || "—"],
          ["Airport Size", c.size || "—"],
          ["Scheduled Service", c.scheduled ? "Yes" : "No"],
          ["Region", c.subdivision || "—"],
          ["Coordinates", coords],
        ];
  return (
    <FormGroup title={t(`Thông tin chuẩn ${c.kind} (chỉ đọc)`, `${c.kind} reference (read-only)`)}>
      {items.map(([label, value]) => (
        <div key={label} className={S3}>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-sm">{value}</p>
        </div>
      ))}
    </FormGroup>
  );
}
