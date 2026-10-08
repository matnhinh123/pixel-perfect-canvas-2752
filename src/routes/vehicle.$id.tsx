import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { History, Pencil, Save, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Field, NativeSelect, Panel, StatusBadge } from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import {
  CollapsiblePanel,
  FormGroup,
  ReadOnlyScope,
  S3,
  S6,
} from "@/components/movex/general/FormParts";
import { DimensionInput, UnitInput } from "@/components/movex/vehicle/VehicleInputs";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import {
  bpOwnerLabel,
  capacityRequired,
  daysUntil,
  draftOfVehicle,
  expiryState,
  maxDistanceKm,
  newVehicleDraft,
  ownerCandidates,
  VEHICLE_GROUP_OPTIONS,
  vehicleService,
  type VehicleDraft,
} from "@/services/vehicleMasterService";
import {
  ACQUISITION_CURRENCIES,
  FUEL_TYPES,
  PRODUCTION_COUNTRIES,
  TRADE_MARKS,
  VEHICLE_TYPES,
} from "@/mock-data/vehicleMaster";
import { VEHICLE_OWNERSHIPS, type VehicleMasterRecord, type VehicleOwnership } from "@/types";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit";

export const Route = createFileRoute("/vehicle/$id")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "view" || s["mode"] === "edit" ? { mode: s["mode"] } : {},
  head: ({ params }) => ({
    meta: [{ title: params.id === "new" ? "Create Vehicle — MoveX" : "Vehicle — MoveX" }],
  }),
  component: VehiclePage,
});

// Fields that live inside the folded "Specifications" panel (to unfold it on errors).
const SPEC_FIELDS = ["kerbMass", "engineDisplacement", "acquisitionCost"];

function VehiclePage() {
  const { t } = useT();
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const all = useVehicles();
  const source = id === "new" ? null : (all.find((r) => r.id === id) ?? null);
  if (id !== "new" && !source)
    return (
      <Panel>
        <EmptyState
          icon={<XCircle className="h-8 w-8" />}
          title={t("Không tìm thấy xe", "Vehicle not found")}
          action={
            <Button asChild size="sm">
              <Link to="/vehicle">{t("Về danh sách", "Back to list")}</Link>
            </Button>
          }
        />
      </Panel>
    );
  // `key` resets the form state when switching between records / modes.
  return (
    <VehicleForm
      key={`${source?.id ?? "new"}:${mode ?? "view"}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
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

/** "Expired" / "Due in 12 days" note under an expiry date (same threshold as the list and alerts). */
function ExpiryHint({ ymd }: { ymd: string }): ReactNode {
  const { t } = useT();
  const warnDays = useVehicleAlertDays();
  const s = expiryState(ymd, new Date(), warnDays);
  if (s === "expired")
    return <span className="font-medium text-destructive">{t("Đã hết hạn", "Expired")}</span>;
  if (s === "soon") {
    const days = Math.max(0, daysUntil(ymd));
    return (
      <span className="font-medium text-warning">
        {t(`Còn ${days} ngày`, `Due in ${days} day${days === 1 ? "" : "s"}`)}
      </span>
    );
  }
  return undefined;
}

function VehicleForm({
  source,
  readOnly,
}: {
  source: VehicleMasterRecord | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const isNew = !source;
  const initial = useMemo<VehicleDraft>(
    () => (source ? draftOfVehicle(source) : newVehicleDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const patch = (p: Partial<VehicleDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };
  const text = (k: keyof VehicleDraft, upper = false) => ({
    value: String(d[k] ?? ""),
    onChange: (e: { target: { value: string } }) =>
      patch({ [k]: upper ? e.target.value.toUpperCase() : e.target.value }),
    "aria-invalid": !!errors[k] || undefined,
  });
  const select = (
    k: keyof VehicleDraft,
    options: readonly string[],
    placeholder: string,
  ): Parameters<typeof NativeSelect>[0] => ({
    value: String(d[k] ?? ""),
    onChange: (v) => patch({ [k]: v }),
    options: ["", ...options],
    labels: { "": readOnly ? "—" : placeholder },
    className: "w-full",
    invalid: !!errors[k],
  });
  /** Native date picker while editing; plain dd/mm/yyyy text (blank when empty) when viewing. */
  const dateInput = (k: keyof VehicleDraft) =>
    readOnly ? (
      <Input disabled value={d[k] ? formatDate(String(d[k])) : ""} />
    ) : (
      <Input type="date" {...text(k)} />
    );
  const unit = (k: keyof VehicleDraft, u: string, placeholder: string) => (
    <UnitInput
      unit={u}
      placeholder={placeholder}
      invalid={!!errors[k]}
      value={String(d[k] ?? "")}
      onChange={(v) => patch({ [k]: v })}
    />
  );

  const bps = useCollection(businessPartnerRepository);
  const owners = useMemo(() => ownerCandidates(bps, initial.ownerId), [bps, initial.ownerId]);
  const ownerLabels = useMemo(
    () => Object.fromEntries(owners.map((b) => [b.id, bpOwnerLabel(b)])),
    [owners],
  );

  const maxDistance = maxDistanceKm(d.fuelRate, d.fuelCapacity);
  const specError = SPEC_FIELDS.some((k) => errors[k]);

  const back = () =>
    source
      ? void navigate({ to: "/vehicle/$id", params: { id: source.id }, search: { mode: "view" } })
      : void navigate({ to: "/vehicle" });

  const save = () => {
    setFormError(null);
    try {
      const saved = vehicleService.save(d, source?.id);
      guard.allowNext();
      toast.success(
        isNew
          ? t(`Đã thêm xe ${saved.plateNumber}`, `Vehicle ${saved.plateNumber} added`)
          : t(`Đã lưu xe ${saved.plateNumber}`, `Vehicle ${saved.plateNumber} saved`),
      );
      void navigate({ to: "/vehicle/$id", params: { id: saved.id }, search: { mode: "view" } });
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
          { label: "Vehicle", to: "/vehicle" },
          ...(source ? [{ label: source.plateNumber }] : []),
          {
            label: isNew ? "Add New" : readOnly ? t("Chi tiết", "Detail") : t("Chỉnh sửa", "Edit"),
          },
        ]}
        title={
          isNew
            ? "Create Vehicle"
            : readOnly
              ? source.plateNumber
              : t(`Chỉnh sửa: ${source.plateNumber}`, `Edit: ${source.plateNumber}`)
        }
        subtitle={
          source
            ? [source.vehicleType, source.vehicleGroup, source.modelCode]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        badge={source ? <StatusBadge status={source.status} /> : undefined}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/vehicle" }) : back())}
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
                  <Link to="/vehicle/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
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

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <Panel title="General Information" bodyClassName="space-y-6">
          <FormGroup title="Vehicle Identification">
            <Field label="Vehicle Type" required error={errors["vehicleType"]} className={S3}>
              <NativeSelect {...select("vehicleType", VEHICLE_TYPES, "Select vehicle type")} />
            </Field>
            <Field
              label="Vehicle Group"
              required
              error={errors["vehicleGroup"]}
              className={S3}
              info={t(
                "Mỗi xe thuộc đúng một nhóm — cơ sở cho định mức và giá.",
                "Each vehicle belongs to exactly one group — the basis for norms and prices.",
              )}
            >
              <NativeSelect
                {...select("vehicleGroup", VEHICLE_GROUP_OPTIONS, "Select vehicle group")}
              />
            </Field>
            <Field label="Ownership" required className={S3}>
              <NativeSelect
                value={d.ownership}
                onChange={(v) =>
                  patch(
                    v === "Outsourced"
                      ? { ownership: "Outsourced" }
                      : { ownership: v as VehicleOwnership, ownerId: "" },
                  )
                }
                options={VEHICLE_OWNERSHIPS}
                labels={{ Own: "Own fleet", Outsourced: "Outsourced" }}
                className="w-full"
              />
            </Field>
            {d.ownership === "Outsourced" ? (
              <Field
                label="Owner"
                required
                error={errors["ownerId"]}
                className={S3}
                info={t(
                  "Đối tác (Business Partner, vai trò Vendor) sở hữu xe thuê ngoài.",
                  "Business Partner (Vendor role) that owns the outsourced vehicle.",
                )}
              >
                <NativeSelect
                  value={d.ownerId}
                  onChange={(v) => patch({ ownerId: v })}
                  options={["", ...owners.map((b) => b.id)]}
                  labels={{ "": readOnly ? "—" : "Select owner", ...ownerLabels }}
                  className="w-full"
                  invalid={!!errors["ownerId"]}
                />
              </Field>
            ) : (
              <div className="hidden lg:col-span-3 lg:block" />
            )}

            <Field
              label="Plate Number"
              required
              error={errors["plateNumber"]}
              className={S3}
              info={t(
                "Biển số đăng ký, duy nhất. Tự viết hoa. VD: 51D-123.45",
                "Registered plate, unique. Auto-uppercase. e.g. 51D-123.45",
              )}
            >
              <Input
                placeholder="Enter plate number"
                maxLength={15}
                {...text("plateNumber", true)}
              />
            </Field>
            <Field
              label="Chassis Number (VIN)"
              error={errors["chassisNumber"]}
              className={S3}
              info={t(
                "Số khung 11–17 ký tự chữ/số, duy nhất.",
                "Optional. Chassis number, 11–17 letters/digits, unique.",
              )}
            >
              <Input
                placeholder="Enter Chassis Number (VIN)"
                maxLength={17}
                {...text("chassisNumber", true)}
              />
            </Field>
            <Field label="Engine Number" className={S3}>
              <Input placeholder="Enter engine number" {...text("engineNumber")} />
            </Field>
            <Field label="Production Year" error={errors["productionYear"]} className={S3}>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="yyyy"
                value={d.productionYear}
                aria-invalid={!!errors["productionYear"] || undefined}
                onChange={(e) => patch({ productionYear: e.target.value.replace(/\D/g, "") })}
              />
            </Field>

            <Field
              label="Capacity (kg)"
              required={capacityRequired(d.vehicleType)}
              error={errors["authorizedPayload"]}
              className={S3}
              info={t(
                "Tải trọng cho phép (kg). Bắt buộc với Truck / Tractor.",
                "Authorized payload in kg. Required for Truck / Tractor.",
              )}
            >
              {unit("authorizedPayload", "kg", "Enter capacity")}
            </Field>
            <Field label="Fuel Rate" error={errors["fuelRate"]} className={S3}>
              {unit("fuelRate", "l/100km", "Enter Fuel Rate")}
            </Field>
            <Field label="Fuel Capacity" error={errors["fuelCapacity"]} className={S3}>
              {unit("fuelCapacity", "liter", "Enter Fuel Capacity")}
            </Field>
            <Field
              label="Max Distance"
              className={S3}
              info={t(
                "Tự tính: Fuel Capacity ÷ Fuel Rate × 100 (km).",
                "Calculated: Fuel Capacity ÷ Fuel Rate × 100 (km).",
              )}
            >
              <UnitInput readOnly unit="km" value={maxDistance} placeholder="Enter max distance" />
            </Field>
          </FormGroup>

          <FormGroup title="Registration, Insurance And Badge">
            <Field
              label="Registration (Inspection) Expiry"
              className={S3}
              info={t(
                "Hạn đăng kiểm. Được cảnh báo khi sắp hết hạn.",
                "Registration (inspection / đăng kiểm) expiry. Alerted when about to expire.",
              )}
              hint={<ExpiryHint ymd={d.inspectionExpiry} />}
            >
              {dateInput("inspectionExpiry")}
            </Field>
            <Field
              label="Insurance Expiry"
              className={S3}
              hint={<ExpiryHint ymd={d.insuranceExpiry} />}
            >
              {dateInput("insuranceExpiry")}
            </Field>
            <Field
              label="Badge Expiry"
              className={S3}
              info={t("Hạn phù hiệu xe.", "Vehicle badge (phù hiệu) expiry.")}
              hint={<ExpiryHint ymd={d.badgeExpiry} />}
            >
              {dateInput("badgeExpiry")}
            </Field>
            <Field label="Lifetime Limit" className={S3}>
              {dateInput("lifetimeLimit")}
            </Field>
            <Field
              label="Vehicle Inspection No"
              className={S3}
              info={t(
                "Số giấy chứng nhận kiểm định (đăng kiểm).",
                "Vehicle inspection certificate number.",
              )}
            >
              <Input placeholder="Enter vehicle inspection number" {...text("inspectionNo")} />
            </Field>
          </FormGroup>
        </Panel>

        <CollapsiblePanel title="Specifications" forceOpen={specError}>
          <FormGroup title={t("Model & giấy tờ", "Model & Documents")}>
            <Field label="Trade Mark" className={S3}>
              <NativeSelect {...select("tradeMark", TRADE_MARKS, "Select trade mark")} />
            </Field>
            <Field
              label="Model Code"
              className={S3}
              info={t(
                "Mã model của nhà sản xuất, VD: HINO-XZU730L.",
                "Manufacturer model code, e.g. HINO-XZU730L.",
              )}
            >
              <Input placeholder="Enter model code" {...text("modelCode")} />
            </Field>
            <Field label="Production Country" className={S3}>
              <NativeSelect
                {...select("productionCountry", PRODUCTION_COUNTRIES, "Select production country")}
              />
            </Field>
            <Field label="Buying Date" className={S3}>
              {dateInput("buyingDate")}
            </Field>

            <Field
              label="Inspection Report No"
              error={errors["inspectionReportNo"]}
              className={S3}
              info={t("Số biên bản kiểm định kỹ thuật.", "Technical inspection report number.")}
            >
              <Input placeholder="Enter inspection report number" {...text("inspectionReportNo")} />
            </Field>
            <Field label="Comprehensive Policy Number" className={S3}>
              <Input placeholder="Enter comprehensive policy number" {...text("policyNumber")} />
            </Field>
            <Field label="Liability Insurance Number" className={S3}>
              <Input
                placeholder="Enter liability insurance number"
                {...text("liabilityInsuranceNumber")}
              />
            </Field>
            <Field label="Contract Number" className={S3}>
              <Input placeholder="Enter contract number" {...text("contractNumber")} />
            </Field>
          </FormGroup>

          <FormGroup title={t("Kích thước & tải trọng", "Dimensions & Weight")}>
            <Field label="Overall Dimension" className={S6}>
              <DimensionInput
                value={d.overallDimension}
                onChange={(v) => patch({ overallDimension: v })}
              />
            </Field>
            <Field label="Cargo Container Dimensions" className={S6}>
              <DimensionInput
                value={d.containerDimension}
                onChange={(v) => patch({ containerDimension: v })}
              />
            </Field>
            <Field label="Kerb Mass" error={errors["kerbMass"]} className={S3}>
              {unit("kerbMass", "kg", "Enter kerb mass")}
            </Field>
            <Field label="Fuel Type" className={S3}>
              <NativeSelect {...select("fuelType", FUEL_TYPES, "Select fuel type")} />
            </Field>
            <Field label="Engine Displacement" error={errors["engineDisplacement"]} className={S3}>
              {unit("engineDisplacement", "cm3", "Enter engine displacement")}
            </Field>
          </FormGroup>

          <FormGroup title={t("Tài sản & thiết bị", "Asset & Equipment")}>
            <Field label="Acquisition Cost" error={errors["acquisitionCost"]} className={S3}>
              <div className="flex">
                <Input
                  inputMode="decimal"
                  className="rounded-r-none"
                  placeholder="Enter acquisition cost"
                  value={d.acquisitionCost}
                  aria-invalid={!!errors["acquisitionCost"] || undefined}
                  onChange={(e) =>
                    patch({ acquisitionCost: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
                <NativeSelect
                  className="w-24 rounded-l-none border-l-0 bg-muted"
                  value={d.acquisitionCurrency}
                  onChange={(v) => patch({ acquisitionCurrency: v })}
                  options={ACQUISITION_CURRENCIES}
                />
              </div>
            </Field>
            <Field label="RFID / Barcode Tag" className={S3}>
              <Input placeholder="Enter RFID / barcode tag" {...text("rfidTag")} />
            </Field>
            <Field label="Status" className={S3}>
              <SwitchRow
                checked={d.status === "Active"}
                onChange={(v) => patch({ status: v ? "Active" : "Inactive" })}
                on="Active"
                off="Inactive"
              />
            </Field>

            <Field label="Modification" className={S3}>
              <SwitchRow
                checked={d.renovated}
                onChange={(v) => patch({ renovated: v })}
                on="Renovated"
                off="Not renovated"
              />
            </Field>
            <Field label="Transportation Business" className={S3}>
              <SwitchRow
                checked={d.transportationBusiness}
                onChange={(v) => patch({ transportationBusiness: v })}
                on="Yes"
                off="No"
              />
            </Field>
            <Field label="Equipped With Tachograph" className={S3}>
              <SwitchRow
                checked={d.tachograph}
                onChange={(v) => patch({ tachograph: v })}
                on="Yes"
                off="No"
              />
            </Field>
            <Field label="Telematics" className={S3}>
              <SwitchRow
                checked={d.telematics}
                onChange={(v) => patch({ telematics: v })}
                on="Yes"
                off="No"
              />
            </Field>
          </FormGroup>
        </CollapsiblePanel>
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

      {source && (
        <AuditHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          entityType="Vehicle"
          entityId={source.id}
          title={source.plateNumber}
        />
      )}
    </div>
  );
}
