import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Power, Save, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  Field,
  NativeSelect,
  Panel,
  StatusBadge,
  Tag,
} from "@/components/movex/common";
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
  S3,
  S6,
} from "@/components/movex/general/FormParts";
import { DimensionInput, UnitInput } from "@/components/movex/vehicle/VehicleInputs";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import { BusinessRuleError } from "@/services/crudService";
import {
  blankMapping,
  daysUntil,
  draftOfVehicle,
  expiryState,
  fieldsLostOnTypeChange,
  maxDistanceKm,
  newVehicleDraft,
  showsField,
  SPEC_FIELDS,
  VEHICLE_GROUP_OPTIONS,
  vehicleCrud,
  vehicleService,
  type VehicleDraft,
} from "@/services/vehicleMasterService";
import {
  ACQUISITION_CURRENCIES,
  FUEL_TYPES,
  PRODUCTION_COUNTRIES,
  TRADE_MARKS,
  TRUCK_TYPES,
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPES,
} from "@/mock-data/vehicleMaster";
import {
  TRAILER_TYPES,
  type ContainerSizeMapping,
  type VehicleMasterRecord,
  type VehicleMasterType,
} from "@/types";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";

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

/** Specifications has data worth showing unfolded when editing. */
const SPEC_DATA: (keyof VehicleDraft)[] = [
  "policyNumber",
  "tradeMark",
  "modelCode",
  "buyingDate",
  "overallDimension",
  "containerDimension",
  "kerbMass",
  "authorizedPayload",
  "rfidTag",
  "acquisitionCost",
  "contractNumber",
  "liabilityInsuranceNumber",
  "fuelType",
  "engineDisplacement",
  "authorizedTowedMass",
  "productionCountry",
];

function VehicleForm({
  source,
  readOnly,
}: {
  source: VehicleMasterRecord | null;
  readOnly: boolean;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const confirm = useConfirm();
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
    options: ["", ...options],
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
  const changeType = async (next: VehicleMasterType | "") => {
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
    // Choosing HEAD with no mapping yet starts the table with one empty row (SR-VEH-15).
    patch({
      vehicleType: next,
      ...(next === "HEAD" && d.containerMappings.length === 0
        ? { containerMappings: [blankMapping()] }
        : {}),
    });
  };

  const setMappings = (containerMappings: ContainerSizeMapping[]) => patch({ containerMappings });
  const setMapping = (rid: string, p: Partial<ContainerSizeMapping>) =>
    setMappings(d.containerMappings.map((m) => (m.rid === rid ? { ...m, ...p } : m)));

  const maxDistance = maxDistanceKm(d.fuelRate, d.fuelCapacity);
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
          source && (
            <>
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
          )
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <ReadOnlyScope readOnly={readOnly} className="space-y-4">
        <Panel title="General Information" bodyClassName="space-y-6">
          <FormGroup title="Vehicle Identification">
            <Field label="Vehicle Type" required error={errors["vehicleType"]} className={S3}>
              <NativeSelect
                value={d.vehicleType}
                onChange={(v) => void changeType(v as VehicleMasterType | "")}
                options={["", ...VEHICLE_TYPES]}
                labels={{ "": readOnly ? "—" : "Chọn loại phương tiện", ...VEHICLE_TYPE_LABELS }}
                className="w-full"
                invalid={!!errors["vehicleType"]}
              />
            </Field>
            {shows("trailerType") && (
              <Field label="Trailer Type" error={errors["trailerType"]} className={S3}>
                <NativeSelect {...select("trailerType", TRAILER_TYPES, "Chọn cỡ rơ-moóc")} />
              </Field>
            )}
            {shows("vehicleGroup") && (
              <Field label="Vehicle Group" error={errors["vehicleGroup"]} className={S3}>
                <NativeSelect {...select("vehicleGroup", VEHICLE_GROUP_OPTIONS, "Chọn nhóm xe")} />
              </Field>
            )}
            {shows("truckType") && (
              <Field label="Truck Type" required error={errors["truckType"]} className={S3}>
                <NativeSelect {...select("truckType", TRUCK_TYPES, "Chọn hạng tải xe")} />
              </Field>
            )}
            {/* Keep the next fields on a new row. */}
            <div className="hidden lg:col-span-12 lg:block" />

            <Field
              label="Plate Number"
              required
              error={errors["plateNumber"]}
              className={S3}
              info={t(
                "Biển số Việt Nam, duy nhất. VD: 51C-123.45, 30A-12345, 29LD-123.45",
                "Vietnamese plate, unique. e.g. 51C-123.45, 30A-12345, 29LD-123.45",
              )}
            >
              <Input placeholder="VD: 51C-123.45" maxLength={12} {...text("plateNumber", true)} />
            </Field>
            <Field
              label="Chassis Number (VIN)"
              required
              error={errors["chassisNumber"]}
              className={S3}
              info={t(
                "Số khung, chỉ chữ và số, duy nhất.",
                "Chassis number: letters and digits only, unique.",
              )}
            >
              <Input
                placeholder="Nhập số khung (chỉ chữ và số)"
                maxLength={17}
                {...text("chassisNumber", true)}
              />
            </Field>
            {shows("engineNumber") && (
              <Field label="Engine Number" className={S3}>
                <Input placeholder="Nhập số máy" {...text("engineNumber")} />
              </Field>
            )}
            <Field label="Production Year" error={errors["productionYear"]} className={S3}>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                value={d.productionYear}
                aria-invalid={!!errors["productionYear"] || undefined}
                onChange={(e) => patch({ productionYear: e.target.value.replace(/\D/g, "") })}
              />
            </Field>

            {shows("fuelRate") && (
              <>
                <Field label="Fuel Rate" error={errors["fuelRate"]} className={S3}>
                  {unit("fuelRate", "l/100km", "Nhập định mức tiêu hao")}
                </Field>
                <Field label="Fuel Capacity" error={errors["fuelCapacity"]} className={S3}>
                  {unit("fuelCapacity", "liter", "Nhập dung tích bình dầu")}
                </Field>
                <Field
                  label="Quãng đường tối đa"
                  className={S3}
                  info={
                    maxDistance
                      ? "Fuel Capacity ÷ Fuel Rate × 100"
                      : "Cần Fuel Rate và Fuel Capacity"
                  }
                >
                  <UnitInput
                    readOnly
                    unit="km"
                    value={maxDistance}
                    placeholder="Cần Fuel Rate và Fuel Capacity"
                  />
                </Field>
              </>
            )}
          </FormGroup>

          <FormGroup title="Registration & Inspection Information">
            <Field
              label="Registration Expiration Date"
              className={S3}
              hint={<ExpiryHint ymd={d.registrationExpiry} />}
            >
              {dateInput("registrationExpiry")}
            </Field>
            <Field
              label="Vehicle Inspection No"
              error={errors["inspectionNo"]}
              className={S3}
              info={t(
                "Số quản lý phương tiện: chữ, số, gạch nối.",
                "Vehicle inspection number: letters, digits, hyphens.",
              )}
            >
              <Input placeholder="Nhập số quản lý phương tiện" {...text("inspectionNo")} />
            </Field>
            <Field
              label="Inspection Expiration Date"
              className={S3}
              hint={<ExpiryHint ymd={d.inspectionExpiry} />}
            >
              {dateInput("inspectionExpiry")}
            </Field>
            <Field label="Lifetime Limit" className={S3}>
              {dateInput("lifetimeLimit")}
            </Field>
          </FormGroup>
        </Panel>

        <CollapsiblePanel
          title="Specifications"
          defaultOpen={readOnly || (!isNew && specHasData)}
          forceOpen={specError}
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-12">
            <Field label="Comprehensive Policy Number" className={S3}>
              <Input placeholder="Nhập số bảo hiểm vật chất" {...text("policyNumber")} />
            </Field>
            <Field label="Trade Mark" className={S3}>
              <NativeSelect {...select("tradeMark", TRADE_MARKS, "Chọn hãng sản xuất")} />
            </Field>
            <Field
              label="Model Code"
              error={errors["modelCode"]}
              className={S3}
              info={t(
                "Chữ, số và gạch nối. VD: HD210-2018",
                "Letters, digits, hyphens. e.g. HD210-2018",
              )}
            >
              <Input placeholder="VD: HD210-2018" {...text("modelCode")} />
            </Field>
            <Field label="Buying Date" className={S3}>
              {dateInput("buyingDate")}
            </Field>

            <Field label="Overall Dimension" className={S6}>
              <DimensionInput
                value={d.overallDimension}
                onChange={(v) => patch({ overallDimension: v })}
              />
            </Field>
            <Field label="Cargo / Container Dimensions" className={S6}>
              <DimensionInput
                value={d.containerDimension}
                onChange={(v) => patch({ containerDimension: v })}
              />
            </Field>

            <Field label="Kerb Mass" error={errors["kerbMass"]} className={S3}>
              {unit("kerbMass", "kg", "Nhập khối lượng bản thân")}
            </Field>
            <Field
              label="Authorized Payload"
              error={errors["authorizedPayload"]}
              className={S3}
              info={t(
                "Tải trọng cho phép theo đăng kiểm (kg), độc lập với Truck Type.",
                "Legal payload per inspection (kg), independent of Truck Type.",
              )}
            >
              {unit("authorizedPayload", "kg", "Nhập tải trọng cho phép")}
            </Field>
            <Field label="RFID / Barcode Tag" className={S3}>
              <Input placeholder="Nhập mã định danh điện tử" {...text("rfidTag")} />
            </Field>
            <Field label="Acquisition Cost" error={errors["acquisitionCost"]} className={S3}>
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

            <Field label="Contract Number" className={S3}>
              <Input placeholder="Nhập số hợp đồng" {...text("contractNumber")} />
            </Field>
            <Field
              label="Inspection Report No"
              required
              error={errors["inspectionReportNo"]}
              className={S3}
              info={t(
                "Số chứng nhận kiểm định: chữ, số, gạch nối.",
                "Inspection report number: letters, digits, hyphens.",
              )}
            >
              <Input placeholder="Nhập số chứng nhận kiểm định" {...text("inspectionReportNo")} />
            </Field>
            <Field label="Liability Insurance Number" className={S3}>
              <Input placeholder="Nhập số bảo hiểm TNDS" {...text("liabilityInsuranceNumber")} />
            </Field>
            {shows("fuelType") && (
              <Field label="Fuel Type" className={S3}>
                <NativeSelect {...select("fuelType", FUEL_TYPES, "Chọn loại nhiên liệu")} />
              </Field>
            )}
            {shows("engineDisplacement") && (
              <Field
                label="Engine Displacement"
                error={errors["engineDisplacement"]}
                className={S3}
              >
                {unit("engineDisplacement", "cm3", "Nhập dung tích xi lanh")}
              </Field>
            )}
            {shows("authorizedTowedMass") && (
              <Field
                label="Authorized Towed Mass"
                error={errors["authorizedTowedMass"]}
                className={S3}
              >
                {unit("authorizedTowedMass", "kg", "Nhập khối lượng kéo theo cho phép")}
              </Field>
            )}
            <Field label="Production Country" className={S3}>
              <NativeSelect
                {...select("productionCountry", PRODUCTION_COUNTRIES, "Chọn nước sản xuất")}
              />
            </Field>

            <Field label="Modification" className={S3}>
              <SwitchRow
                checked={d.renovated}
                onChange={(v) => patch({ renovated: v })}
                on="Renovated"
                off="Unrenovated"
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
            <Field label="Equipped with Tachograph" className={S3}>
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
          </div>
        </CollapsiblePanel>

        {shows("containerMappings") && (
          <Panel
            title="Container Size Mapping"
            actions={
              !readOnly && (
                <Button
                  size="sm"
                  type="button"
                  disabled={d.containerMappings.length >= TRAILER_TYPES.length}
                  title={
                    d.containerMappings.length >= TRAILER_TYPES.length
                      ? t("Đã khai đủ các Trailer Type.", "Every Trailer Type is already mapped.")
                      : undefined
                  }
                  onClick={() => setMappings([...d.containerMappings, blankMapping()])}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )
            }
          >
            {d.containerMappings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {readOnly ? "Chưa khai tổ hợp nào" : "Chưa khai tổ hợp nào. Bấm Add để thêm."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-left text-xs font-semibold">
                      <th className="w-12 px-3 py-2">No.</th>
                      <th className="px-3 py-2">Head</th>
                      <th className="px-3 py-2">
                        Trailer Type<span className="ml-0.5 text-destructive">*</span>
                      </th>
                      <th className="px-3 py-2">
                        Vehicle Group<span className="ml-0.5 text-destructive">*</span>
                      </th>
                      {!readOnly && <th className="w-12 px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {d.containerMappings.map((m, i) => (
                      <tr key={m.rid} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Input disabled value={d.plateNumber} placeholder="Head" />
                        </td>
                        <td className="px-3 py-2">
                          <NativeSelect
                            value={m.trailerType}
                            onChange={(v) =>
                              setMapping(m.rid, {
                                trailerType: v as ContainerSizeMapping["trailerType"],
                              })
                            }
                            options={["", ...TRAILER_TYPES]}
                            labels={{ "": readOnly ? "—" : "Chọn cỡ rơ-moóc" }}
                            className="w-full"
                            invalid={!!errors["containerMappings"] && !m.trailerType}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NativeSelect
                            value={m.vehicleGroup}
                            onChange={(v) => setMapping(m.rid, { vehicleGroup: v })}
                            options={["", ...VEHICLE_GROUP_OPTIONS]}
                            labels={{ "": readOnly ? "—" : "Chọn nhóm xe" }}
                            className="w-full"
                            invalid={!!errors["containerMappings"] && !m.vehicleGroup}
                          />
                        </td>
                        {!readOnly && (
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              aria-label={t("Xoá dòng", "Delete row")}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                              onClick={() =>
                                setMappings(d.containerMappings.filter((x) => x.rid !== m.rid))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {errors["containerMappings"] && (
              <p className="mt-2 text-xs font-medium text-destructive">
                {errors["containerMappings"]}
              </p>
            )}
          </Panel>
        )}
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
    </div>
  );
}
