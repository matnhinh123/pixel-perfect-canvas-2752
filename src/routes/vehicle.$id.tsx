import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { History, Pencil, Plus, Power, Save, ScanLine, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import {
  CollapsiblePanel,
  FormGroup,
  ReadOnlyScope,
  S2,
  S3,
  S4,
  S6,
  S12,
} from "@/components/movex/general/FormParts";
import { SuggestInput } from "@/components/movex/general/SuggestInput";
import { ScanCertificateDialog } from "@/components/movex/vehicle/ScanCertificateDialog";
import { DimensionInput, UnitInput } from "@/components/movex/vehicle/VehicleInputs";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import { BusinessRuleError } from "@/services/crudService";
import {
  baseTypeOf,
  daysUntil,
  draftOfVehicle,
  expiryState,
  fieldsLostOnTypeChange,
  fuelUnitOf,
  cargoVolumeM3,
  newVehicleDraft,
  showsField,
  SPEC_FIELDS,
  VEHICLE_GROUP_OPTIONS,
  vehicleGroupForTruckType,
  vehicleCrud,
  vehicleService,
  type VehicleDraft,
} from "@/services/vehicleMasterService";
import {
  ACQUISITION_CURRENCIES,
  FUEL_TYPES,
  TRAILER_BODY_TYPES,
  TRUCK_TYPES,
  VEHICLE_TYPES,
} from "@/mock-data/vehicleMaster";
import { TRAILER_TYPES, type VehicleMasterRecord, type VehicleMasterType } from "@/types";
import { formatDate } from "@/lib/format";
import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
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
      key={`${source?.id ?? "new"}:${mode ?? "view"}:${source?.updatedAt ?? ""}:${source?.status ?? ""}`}
      source={source}
      readOnly={!!source && mode !== "edit"}
    />
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

/** Dimensions & Weight: a size (wider) next to its mass. */
const DIM = "sm:col-span-6 lg:col-span-7";
const MASS = "sm:col-span-6 lg:col-span-5";

/** Specifications has data worth showing unfolded when editing. */
const SPEC_DATA: (keyof VehicleDraft)[] = [
  "overallDimension",
  "containerDimension",
  "kerbMass",
  "authorizedPayload",
  "authorizedTowedMass",
  "buyingDate",
  "acquisitionCost",
  "contractNumber",
];

function VehicleForm({
  source,
  readOnly,
}: {
  source: VehicleMasterRecord | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const vehicleTypes = useCodeOptions(CC.VEHICLE_TYPE, VEHICLE_TYPES);
  const trailerSizes = useCodeOptions(CC.TRAILER_SIZE, TRAILER_TYPES);
  const trailerTypes = useCodeOptions(CC.TRAILER_TYPE, TRAILER_BODY_TYPES);
  const truckTypes = useCodeOptions(CC.TRUCK_TYPE, TRUCK_TYPES);
  const vehicleGroups = useCodeOptions(CC.VEHICLE_GROUP, VEHICLE_GROUP_OPTIONS);
  const fuelTypes = useCodeOptions(CC.FUEL_TYPE, FUEL_TYPES);
  // Brand is typed freely; the brands already entered on the other vehicles drop down as suggestions.
  const fleet = useVehicles();
  const brandSuggestions = useMemo(
    () =>
      [
        ...new Set(
          fleet
            .filter((v) => v.id !== source?.id)
            .map((v) => v.tradeMark.trim().toUpperCase())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [fleet, source?.id],
  );
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const isNew = !source;
  const initial = useMemo<VehicleDraft>(
    () => (source ? draftOfVehicle(source) : newVehicleDraft()),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const shows = (k: keyof VehicleDraft) => showsField(d.vehicleType, k);

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
    options: ["", ...withCurrent(options, String(d[k] ?? ""))],
    labels: { "": readOnly ? "—" : placeholder },
    className: "w-full",
    invalid: !!errors[k],
  });
  /** Native date picker while editing; plain dd/mm/yyyy text when viewing. */
  const dateInput = (k: keyof VehicleDraft) =>
    readOnly ? (
      <Input disabled value={d[k] ? formatDate(String(d[k])) : ""} placeholder="—" />
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

  /** SR-VEH-02 / 17: leaving a type whose filled fields would be hidden asks first. */
  /** Fields read from the inspection certificate (ticked in the scan dialog). */
  const applyScan = (p: Partial<VehicleDraft>) => {
    patch(p);
    toast.success(
      t(
        `Đã điền ${Object.keys(p).length} trường từ giấy kiểm định — kiểm tra lại trước khi lưu.`,
        `Filled ${Object.keys(p).length} fields from the certificate — check them before saving.`,
      ),
    );
  };

  const changeType = async (next: string) => {
    const lost = fieldsLostOnTypeChange(d, next);
    if (lost.length) {
      const r = await confirm({
        title: t("Đổi loại xe?", "Change vehicle type?"),
        description: t(
          `Các trường sau sẽ bị ẩn và xoá giá trị khi lưu: ${lost.join(", ")}.`,
          `These fields will be hidden and their values cleared on save: ${lost.join(", ")}.`,
        ),
        confirmLabel: t("Đổi loại xe", "Change type"),
      });
      if (r !== "confirm") return;
    }
    patch({ vehicleType: next });
  };

  const hasFuel = shows("fuelType");
  const insuranceSpan = hasFuel ? S12 : S6;
  const cargoVolume = cargoVolumeM3(d.containerDimension);
  const fuelUnit = fuelUnitOf(d.fuelType);
  const specError = SPEC_FIELDS.some((k) => errors[k]);
  const specHasData = SPEC_DATA.some((k) => String(initial[k] ?? "").trim() !== "");

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
      // Create → back to the list; Edit → the vehicle's view.
      if (isNew) void navigate({ to: "/vehicle" });
      else
        void navigate({ to: "/vehicle/$id", params: { id: saved.id }, search: { mode: "view" } });
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError(t("Chưa thể lưu — vui lòng kiểm tra:", "Cannot save yet — please check:"));
        // SR-VEH-18: scroll to and focus the first invalid field (after the folded panel opens).
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>("[aria-invalid='true']");
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          el?.focus({ preventScroll: true });
        }, 50);
      }
      toast.error(err instanceof Error ? err.message : t("Lưu thất bại", "Save failed"));
    }
  };

  /** Deactivate / Activate from the view header. */
  const toggleStatus = async () => {
    if (!source) return;
    const next = source.status === "Active" ? "Inactive" : "Active";
    const verb = next === "Active" ? "Activate" : "Deactivate";
    const r = await confirm({
      title: `${verb} ${source.plateNumber}?`,
      description:
        next === "Inactive"
          ? t(
              "Xe Inactive bị ẩn khỏi danh sách chọn khi điều phối, vẫn giữ trong dữ liệu chuyến đã chạy.",
              "An inactive vehicle is hidden from dispatch pickers but kept in past trips.",
            )
          : t(
              "Xe sẽ được chọn lại khi điều phối.",
              "The vehicle becomes available for dispatch again.",
            ),
      confirmLabel: verb,
      ...(next === "Inactive" ? { tone: "danger" as const } : {}),
    });
    if (r !== "confirm") return;
    vehicleCrud.setStatus([source.id], next);
    toast.success(`${source.plateNumber} ${next === "Active" ? "activated" : "deactivated"}`);
  };

  const typeTag = (type: string) => (type ? <Tag>{type}</Tag> : null);

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
              ? `Vehicle #${source.plateNumber}`
              : `Edit Vehicle #${source.plateNumber}`
        }
        badge={
          source ? (
            <span className="flex items-center gap-2">
              {typeTag(source.vehicleType)}
              <StatusBadge status={source.status} />
            </span>
          ) : undefined
        }
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly || isNew ? void navigate({ to: "/vehicle" }) : back())}
        onCancel={back}
        onSave={save}
        extra={
          <>
            {!readOnly && (
              <Button variant="outline" size="lg" onClick={() => setScanOpen(true)}>
                <ScanLine className="h-4 w-4" />
                {t("Scan giấy kiểm định", "Scan certificate")}
              </Button>
            )}
            {source && (
              <>
                <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4" />
                  {t("Lịch sử", "History")}
                </Button>
                {readOnly && (
                  <>
                    <Button variant="outline" size="lg" onClick={() => void toggleStatus()}>
                      <Power className="h-4 w-4" />
                      {source.status === "Active" ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => void navigate({ to: "/vehicle" })}
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                    <Button asChild size="lg">
                      <Link to="/vehicle/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <Panel title="General Information" bodyClassName="space-y-6">
          <FormGroup title="Vehicle Identification">
            <Field label="Vehicle Type" required error={errors["vehicleType"]} className={S2}>
              <NativeSelect
                value={d.vehicleType}
                onChange={(v) => void changeType(v)}
                options={["", ...withCurrent(vehicleTypes, d.vehicleType)]}
                labels={{ "": readOnly ? "—" : "Chọn loại phương tiện" }}
                className="w-full"
                invalid={!!errors["vehicleType"]}
              />
            </Field>
            {shows("trailerType") && (
              <Field
                label="Trailer Type"
                error={errors["trailerType"]}
                className={S2}
                info={t(
                  "Loại rơ-moóc: Skeletal (xương, chở container), Flatbed (sàn), Low Bed (lùn), Side Wall (lửng), Box (thùng kín), Dump (ben), Tank (bồn).",
                  "Trailer body type: Skeletal (container chassis), Flatbed, Low Bed, Side Wall, Box, Dump, Tank.",
                )}
              >
                <NativeSelect {...select("trailerType", trailerTypes, "Chọn loại rơ-moóc")} />
              </Field>
            )}
            {shows("truckType") && (
              <Field label="Truck Type" required error={errors["truckType"]} className={S2}>
                <NativeSelect
                  {...select("truckType", truckTypes, "Chọn hạng tải xe")}
                  // The Vehicle Group follows the Truck Type's load band.
                  onChange={(v) => {
                    const group = vehicleGroupForTruckType(v, vehicleGroups);
                    patch({ truckType: v, ...(group ? { vehicleGroup: group } : {}) });
                  }}
                />
              </Field>
            )}
            {shows("vehicleGroup") && (
              <Field
                label="Vehicle Group"
                error={errors["vehicleGroup"]}
                className={S2}
                info={t(
                  "Tự chọn theo Truck Type: Group 01 dưới 2 tấn, 02 dưới 4 tấn, 03 dưới 10 tấn, 04 dưới 18 tấn, 05 từ 18 tấn.",
                  "Picked from the Truck Type: Group 01 under 2 t, 02 under 4 t, 03 under 10 t, 04 under 18 t, 05 from 18 t.",
                )}
              >
                <NativeSelect {...select("vehicleGroup", vehicleGroups, "Chọn nhóm xe")} />
              </Field>
            )}
            <Field
              label="Brand Name"
              className={S2}
              info={t(
                "Nhãn hiệu xe (hãng sản xuất) như trên giấy đăng ký / đăng kiểm. VD: HINO, HYUNDAI.",
                "Vehicle brand (manufacturer) as on the registration / inspection papers. e.g. HINO, HYUNDAI.",
              )}
            >
              <SuggestInput
                value={d.tradeMark}
                onChange={(v) => patch({ tradeMark: v })}
                suggestions={brandSuggestions}
                placeholder="Nhập nhãn hiệu xe"
                upper
              />
            </Field>
            {shows("modelCode") && (
              <Field
                label="Model Name"
                error={errors["modelCode"]}
                className={S2}
                info={t(
                  "Tên / số loại xe như trên giấy đăng ký. VD: HD210, Canter TF8.5",
                  "Model as on the registration papers. e.g. HD210, Canter TF8.5",
                )}
              >
                <Input placeholder="VD: HD210, Canter TF8.5" {...text("modelCode")} />
              </Field>
            )}
            <Field label="Production Year" error={errors["productionYear"]} className={S2}>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                value={d.productionYear}
                aria-invalid={!!errors["productionYear"] || undefined}
                onChange={(e) => patch({ productionYear: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            {/* Identity numbers on their own row. */}
            <div className="hidden lg:col-span-12 lg:block" />
            <Field
              label="Plate Number"
              required
              error={errors["plateNumber"]}
              className={S4}
              info={t(
                "Biển số Việt Nam, duy nhất. VD: 51C-123.45, 30A-12345, 29LD-123.45",
                "Vietnamese plate, unique. e.g. 51C-123.45, 30A-12345, 29LD-123.45",
              )}
            >
              <Input placeholder="VD: 51C-123.45" maxLength={12} {...text("plateNumber", true)} />
            </Field>
            <Field
              label="Chassis Number (VIN)"
              error={errors["chassisNumber"]}
              className={S4}
              info={t(
                "Số khung (không bắt buộc): chỉ chữ và số, không trùng xe khác.",
                "Chassis number (optional): letters and digits only, unique.",
              )}
            >
              <Input placeholder="Nhập số khung" maxLength={17} {...text("chassisNumber", true)} />
            </Field>
            {shows("engineNumber") && (
              <Field label="Engine Number" className={S4}>
                <Input placeholder="Nhập số máy" {...text("engineNumber")} />
              </Field>
            )}
          </FormGroup>

          <FormGroup title="Registration & Inspection Information">
            <Field
              label="Registration Expiration Date"
              className={S2}
              hint={<ExpiryHint ymd={d.registrationExpiry} />}
            >
              {dateInput("registrationExpiry")}
            </Field>
            <Field
              label="Vehicle Inspection No"
              error={errors["inspectionNo"]}
              className={S3}
              info={t(
                "Số quản lý phương tiện trên giấy đăng kiểm: chữ, số, gạch nối.",
                "Vehicle inspection number on the certificate: letters, digits, hyphens.",
              )}
            >
              <Input placeholder="Nhập số quản lý phương tiện" {...text("inspectionNo")} />
            </Field>
            <Field
              label="Inspection Report No"
              required
              error={errors["inspectionReportNo"]}
              className={S3}
              info={t(
                "Số giấy chứng nhận kiểm định: chữ, số, gạch nối.",
                "Inspection certificate number: letters, digits, hyphens.",
              )}
            >
              <Input placeholder="Nhập số chứng nhận kiểm định" {...text("inspectionReportNo")} />
            </Field>
            <Field
              label="Inspection Expiration Date"
              className={S2}
              hint={<ExpiryHint ymd={d.inspectionExpiry} />}
            >
              {dateInput("inspectionExpiry")}
            </Field>
            {shows("lifetimeLimit") && (
              <Field
                label="Lifetime Limit"
                className={S2}
                hint={<ExpiryHint ymd={d.lifetimeLimit} />}
                info={t(
                  "Niên hạn sử dụng: quá hạn thì xe không được điều.",
                  "Legal service life: past this date the vehicle cannot be dispatched.",
                )}
              >
                {dateInput("lifetimeLimit")}
              </Field>
            )}
          </FormGroup>

          {/* Two columns: Fuel | Insurance; a trailer has no fuel, so Insurance takes the full width. */}
          <div className={cn("grid gap-6", hasFuel && "lg:grid-cols-2")}>
            {/* Fuel: the type decides the units of the rate and the capacity. */}
            {hasFuel && (
              <FormGroup title="Fuel">
                <Field label="Fuel Type" className={S6}>
                  <NativeSelect {...select("fuelType", fuelTypes, "Chọn loại nhiên liệu")} />
                </Field>
                <Field label="Fuel Rate" error={errors["fuelRate"]} className={S6}>
                  {unit("fuelRate", fuelUnit.rate, "Nhập định mức tiêu hao")}
                </Field>
                <Field label="Fuel Capacity" error={errors["fuelCapacity"]} className={S6}>
                  {unit("fuelCapacity", fuelUnit.capacity, "Nhập dung tích bình dầu")}
                </Field>
              </FormGroup>
            )}

            <FormGroup title="Insurance">
              <Field
                label="Liability Insurance Number"
                className={insuranceSpan}
                info={t(
                  "Số bảo hiểm trách nhiệm dân sự (bắt buộc theo luật).",
                  "Compulsory civil liability insurance number.",
                )}
              >
                <Input placeholder="Nhập số bảo hiểm TNDS" {...text("liabilityInsuranceNumber")} />
              </Field>
              <Field
                label="Comprehensive Policy Number"
                className={insuranceSpan}
                info={t("Số bảo hiểm vật chất xe.", "Vehicle physical damage policy number.")}
              >
                <Input placeholder="Nhập số bảo hiểm vật chất" {...text("policyNumber")} />
              </Field>
            </FormGroup>
          </div>
        </Panel>

        <CollapsiblePanel
          title="Specifications"
          defaultOpen={readOnly || (!isNew && specHasData)}
          forceOpen={specError}
        >
          {/* Two columns: Dimensions & Weight | Asset. */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Each size sits next to its mass: Overall ↔ Kerb Mass, Cargo box ↔ Payload. */}
            <FormGroup title="Dimensions & Weight">
              {shows("trailerSize") && (
                <>
                  <Field
                    label="Trailer Size"
                    required
                    error={errors["trailerSize"]}
                    className={MASS}
                    info={t(
                      'Cỡ rơ-moóc (20 ft / 40 ft…), danh sách lấy từ Common Code "Vehicle - Trailer Size".',
                      'Trailer size (20 ft / 40 ft…), list from Common Code "Vehicle - Trailer Size".',
                    )}
                  >
                    <NativeSelect {...select("trailerSize", trailerSizes, "Chọn cỡ rơ-moóc")} />
                  </Field>
                  <Field
                    label="Trailer Axles"
                    error={errors["trailerAxles"]}
                    className={MASS}
                    info={t(
                      "Số trục của rơ-moóc (VD: 2, 3).",
                      "Number of axles of the trailer (e.g. 2, 3).",
                    )}
                  >
                    <Input
                      inputMode="numeric"
                      maxLength={1}
                      placeholder="VD: 3"
                      value={d.trailerAxles}
                      aria-invalid={!!errors["trailerAxles"] || undefined}
                      onChange={(e) => patch({ trailerAxles: e.target.value.replace(/\D/g, "") })}
                    />
                  </Field>
                  <div className="hidden lg:col-span-12 lg:block" />
                </>
              )}
              <Field
                label="Overall Dimension"
                className={DIM}
                info={t(
                  "Kích thước bao ngoài của cả xe (ghi trên giấy đăng kiểm): dùng kiểm tra xe qua cầu, hầm, đường hạn chế chiều cao / chiều dài.",
                  "Outer size of the whole vehicle (on the inspection certificate): checked against height / length limits of bridges, tunnels and roads.",
                )}
              >
                <DimensionInput
                  value={d.overallDimension}
                  onChange={(v) => patch({ overallDimension: v })}
                />
              </Field>
              {shows("kerbMass") && (
                <Field
                  label="Kerb Mass"
                  error={errors["kerbMass"]}
                  className={MASS}
                  info={t(
                    "Khối lượng bản thân: xe không chở hàng (kg). Cộng Authorized Payload ra khối lượng toàn bộ.",
                    "Unladen mass of the vehicle (kg). Plus Authorized Payload gives the gross mass.",
                  )}
                >
                  {unit("kerbMass", "kg", "VD: 4200")}
                </Field>
              )}
              {shows("containerDimension") && (
                <Field
                  label="Cargo / Container Dimensions"
                  className={DIM}
                  info={t(
                    "Kích thước lòng thùng chở hàng (bên trong): dùng kiểm tra hàng có xếp vừa xe.",
                    "Inner size of the cargo box: checks that a load fits.",
                  )}
                >
                  <DimensionInput
                    value={d.containerDimension}
                    onChange={(v) => patch({ containerDimension: v })}
                  />
                </Field>
              )}
              {shows("authorizedPayload") && (
                <Field
                  label="Authorized Payload"
                  error={errors["authorizedPayload"]}
                  // A head has no cargo box: Payload takes the left column so Towed Mass sits
                  // right under Kerb Mass, same width.
                  className={!shows("containerDimension") && shows("kerbMass") ? DIM : MASS}
                  info={t(
                    "Khối lượng hàng chuyên chở cho phép (CPLN) trên giấy kiểm định (kg), độc lập với Truck Type. Với đầu kéo là tải trọng đặt lên mâm kéo.",
                    "Authorized cargo pay mass on the inspection certificate (kg), independent of Truck Type. For a head: the load on the fifth wheel.",
                  )}
                >
                  {unit("authorizedPayload", "kg", "VD: 5000")}
                </Field>
              )}
              {shows("containerDimension") && (
                <Field
                  label="Cargo Volume"
                  className={DIM}
                  info={t(
                    "Số khối lòng thùng (m³), tự tính = Dài × Rộng × Cao của Cargo / Container Dimensions.",
                    "Cargo box volume (m³), calculated = Length × Width × Height of the cargo dimensions.",
                  )}
                >
                  <UnitInput
                    readOnly
                    unit="m³"
                    value={cargoVolume}
                    placeholder={t("Cần đủ Dài, Rộng, Cao lòng thùng", "Needs the cargo L, W, H")}
                  />
                </Field>
              )}
              {shows("authorizedTowedMass") && (
                <Field
                  label="Authorized Towed Mass"
                  error={errors["authorizedTowedMass"]}
                  className={MASS}
                  info={t(
                    "Khối lượng kéo theo cho phép của đầu kéo: moóc + container + hàng (kg).",
                    "Towed mass a head may pull: trailer + container + cargo (kg).",
                  )}
                >
                  {unit("authorizedTowedMass", "kg", "VD: 32000")}
                </Field>
              )}
            </FormGroup>
            <div className="space-y-6">
              <FormGroup title="Asset">
                <Field label="Buying Date" className={S6}>
                  {dateInput("buyingDate")}
                </Field>
                <Field label="Acquisition Cost" error={errors["acquisitionCost"]} className={S6}>
                  <div className="flex">
                    <Input
                      inputMode="decimal"
                      className="rounded-r-none"
                      placeholder="Nhập giá mua xe"
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
                <Field label="Contract Number" className={S6}>
                  <Input placeholder="Nhập số hợp đồng" {...text("contractNumber")} />
                </Field>
              </FormGroup>
            </div>
          </div>
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

      <ScanCertificateDialog
        open={scanOpen && !readOnly}
        onOpenChange={setScanOpen}
        current={d}
        onApply={applyScan}
      />
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
