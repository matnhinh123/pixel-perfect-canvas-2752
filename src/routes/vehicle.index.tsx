import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { AlertDaysControl } from "@/components/movex/vehicle/VehicleAlerts";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import {
  expiryState,
  fuelUnitOf,
  cargoVolumeM3,
  VEHICLE_GROUP_OPTIONS,
  vehicleCrud,
  vehicleImportConfig,
} from "@/services/vehicleMasterService";
import {
  FUEL_TYPES,
  TRAILER_BODY_TYPES,
  TRUCK_TYPES,
  VEHICLE_TYPES,
} from "@/mock-data/vehicleMaster";
import { formatDate } from "@/lib/format";
import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TRAILER_TYPES, type VehicleMasterRecord } from "@/types";

export const Route = createFileRoute("/vehicle/")({
  head: () => ({
    meta: [
      { title: "Vehicle — MoveX" },
      {
        name: "description",
        content:
          "Vehicle master data: trucks, heads and trailers with registration and inspection.",
      },
    ],
  }),
  component: VehicleList,
});

type Row = VehicleMasterRecord;
type T = (vi: string, en: string) => string;

const dash = "—";
const pad = (n: number) => String(n).padStart(2, "0");
/** dd/mm/yyyy hh:mm */
const stamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** An expiry date, flagged red when passed and amber when due within the alert threshold. */
function Expiry({ ymd, t, days }: { ymd: string; t: T; days: number }) {
  if (!ymd) return <span className="text-muted-foreground">{dash}</span>;
  const s = expiryState(ymd, new Date(), days);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        s === "expired" && "font-semibold text-destructive",
        s === "soon" && "font-semibold text-warning",
      )}
      title={
        s === "expired"
          ? t("Đã hết hạn", "Expired")
          : s === "soon"
            ? t(`Sắp hết hạn (≤ ${days} ngày)`, `Expiring soon (≤ ${days} days)`)
            : undefined
      }
    >
      {formatDate(ymd)}
      {s === "expired" && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
      {s === "soon" && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
    </span>
  );
}

/** Thousands separators for a stored number ("—" when empty). */
const num = (v: string, unit = "") =>
  v ? `${Number(v).toLocaleString()}${unit ? ` ${unit}` : ""}` : dash;

/**
 * Same fields, labels and order as the Vehicle detail form (Plate Number pinned first). The main
 * columns show by default; every other field of the form can be turned on in the column settings.
 */
interface Lists {
  types: string[];
  trailerSizes: string[];
  trailerTypes: string[];
  groups: string[];
  truckTypes: string[];
  brands: string[];
  fuelTypes: string[];
}

const columnsFor = (t: T, days: number, o: Lists): ListColumn<Row>[] => [
  {
    key: "plateNumber",
    label: "Plate Number",
    type: "text",
    pinned: true,
    width: 140,
    value: (r) => r.plateNumber,
    render: (r) => <span className="font-semibold text-primary">{r.plateNumber}</span>,
  },
  // ---------------------------------------------------------------- Vehicle Identification
  {
    key: "vehicleType",
    label: "Vehicle Type",
    type: "enum",
    options: o.types,
    width: 120,
    value: (r) => r.vehicleType,
    render: (r) => (r.vehicleType ? <Tag>{r.vehicleType}</Tag> : dash),
  },
  {
    key: "trailerType",
    label: "Trailer Type",
    type: "enum",
    options: o.trailerTypes,
    width: 120,
    value: (r) => r.trailerType,
    render: (r) => (r.trailerType ? <Tag>{r.trailerType}</Tag> : dash),
  },
  {
    key: "truckType",
    label: "Truck Type",
    type: "enum",
    options: o.truckTypes,
    width: 120,
    value: (r) => r.truckType,
    render: (r) => (r.truckType ? <Tag>{r.truckType}</Tag> : dash),
  },
  {
    key: "vehicleGroup",
    label: "Vehicle Group",
    type: "enum",
    options: o.groups,
    width: 130,
    value: (r) => r.vehicleGroup,
    render: (r) => r.vehicleGroup || dash,
  },
  {
    key: "tradeMark",
    label: "Brand Name",
    type: "enum",
    options: o.brands,
    width: 120,
    value: (r) => r.tradeMark,
    render: (r) => r.tradeMark || dash,
  },
  {
    key: "modelCode",
    label: "Model Name",
    type: "text",
    width: 150,
    defaultHidden: true,
    value: (r) => r.modelCode,
    render: (r) => r.modelCode || dash,
  },
  {
    key: "productionYear",
    label: "Production Year",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.productionYear,
    render: (r) => r.productionYear || dash,
  },
  {
    key: "chassisNumber",
    label: "Chassis Number (VIN)",
    type: "text",
    width: 190,
    value: (r) => r.chassisNumber,
  },
  {
    key: "engineNumber",
    label: "Engine Number",
    type: "text",
    width: 150,
    defaultHidden: true,
    value: (r) => r.engineNumber,
    render: (r) => r.engineNumber || dash,
  },
  // ---------------------------------------------------------------- Registration & Inspection
  {
    key: "registrationExpiry",
    label: "Registration Expiration Date",
    type: "date",
    width: 200,
    value: (r) => r.registrationExpiry,
    render: (r) => <Expiry ymd={r.registrationExpiry} t={t} days={days} />,
  },
  {
    key: "inspectionNo",
    label: "Vehicle Inspection No",
    type: "text",
    width: 170,
    defaultHidden: true,
    value: (r) => r.inspectionNo,
    render: (r) => r.inspectionNo || dash,
  },
  {
    key: "inspectionReportNo",
    label: "Inspection Report No",
    type: "text",
    width: 170,
    value: (r) => r.inspectionReportNo,
    render: (r) => r.inspectionReportNo || dash,
  },
  {
    key: "inspectionExpiry",
    label: "Inspection Expiration Date",
    type: "date",
    width: 190,
    value: (r) => r.inspectionExpiry,
    render: (r) => <Expiry ymd={r.inspectionExpiry} t={t} days={days} />,
  },
  {
    key: "lifetimeLimit",
    label: "Lifetime Limit",
    type: "date",
    width: 140,
    defaultHidden: true,
    value: (r) => r.lifetimeLimit,
    render: (r) => <Expiry ymd={r.lifetimeLimit} t={t} days={days} />,
  },
  // ---------------------------------------------------------------- Fuel
  {
    key: "fuelType",
    label: "Fuel Type",
    type: "enum",
    options: o.fuelTypes,
    width: 110,
    defaultHidden: true,
    value: (r) => r.fuelType,
    render: (r) => r.fuelType || dash,
  },
  {
    key: "fuelRate",
    label: "Fuel Rate",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.fuelRate,
    render: (r) => num(r.fuelRate, fuelUnitOf(r.fuelType).rate),
  },
  {
    key: "fuelCapacity",
    label: "Fuel Capacity",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.fuelCapacity,
    render: (r) => num(r.fuelCapacity, fuelUnitOf(r.fuelType).capacity),
  },
  // ---------------------------------------------------------------- Insurance
  {
    key: "liabilityInsuranceNumber",
    label: "Liability Insurance Number",
    type: "text",
    width: 200,
    defaultHidden: true,
    value: (r) => r.liabilityInsuranceNumber,
    render: (r) => r.liabilityInsuranceNumber || dash,
  },
  {
    key: "policyNumber",
    label: "Comprehensive Policy Number",
    type: "text",
    width: 210,
    defaultHidden: true,
    value: (r) => r.policyNumber,
    render: (r) => r.policyNumber || dash,
  },
  // ---------------------------------------------------------------- Dimensions & Weight
  {
    key: "trailerSize",
    label: "Trailer Size",
    type: "enum",
    options: o.trailerSizes,
    width: 120,
    value: (r) => r.trailerSize,
    render: (r) => r.trailerSize || dash,
  },
  {
    key: "trailerAxles",
    label: "Trailer Axles",
    type: "text",
    width: 120,
    defaultHidden: true,
    value: (r) => r.trailerAxles,
    render: (r) => r.trailerAxles || dash,
  },
  {
    key: "overallDimension",
    label: "Overall Dimension (mm)",
    type: "text",
    width: 180,
    defaultHidden: true,
    value: (r) => r.overallDimension,
    render: (r) => r.overallDimension || dash,
  },
  {
    key: "containerDimension",
    label: "Cargo / Container Dimensions (mm)",
    type: "text",
    width: 230,
    defaultHidden: true,
    value: (r) => r.containerDimension,
    render: (r) => r.containerDimension || dash,
  },
  {
    key: "cargoVolume",
    label: "Cargo Volume (m³)",
    type: "text",
    width: 150,
    defaultHidden: true,
    value: (r) => cargoVolumeM3(r.containerDimension),
    render: (r) => cargoVolumeM3(r.containerDimension) || dash,
  },
  {
    key: "kerbMass",
    label: "Kerb Mass (kg)",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.kerbMass,
    render: (r) => num(r.kerbMass),
  },
  {
    key: "authorizedPayload",
    label: "Authorized Payload (kg)",
    type: "text",
    width: 170,
    value: (r) => r.authorizedPayload,
    render: (r) => num(r.authorizedPayload),
  },
  {
    key: "authorizedTowedMass",
    label: "Authorized Towed Mass (kg)",
    type: "text",
    width: 190,
    defaultHidden: true,
    value: (r) => r.authorizedTowedMass,
    render: (r) => num(r.authorizedTowedMass),
  },
  // ---------------------------------------------------------------- Asset
  {
    key: "buyingDate",
    label: "Buying Date",
    type: "date",
    width: 130,
    defaultHidden: true,
    value: (r) => r.buyingDate,
    render: (r) => (r.buyingDate ? formatDate(r.buyingDate) : dash),
  },
  {
    key: "acquisitionCost",
    label: "Acquisition Cost",
    type: "text",
    width: 170,
    defaultHidden: true,
    value: (r) => r.acquisitionCost,
    render: (r) => num(r.acquisitionCost, r.acquisitionCost ? r.acquisitionCurrency : ""),
  },
  {
    key: "contractNumber",
    label: "Contract Number",
    type: "text",
    width: 160,
    defaultHidden: true,
    value: (r) => r.contractNumber,
    render: (r) => r.contractNumber || dash,
  },
  {
    key: "status",
    label: "Status",
    type: "enum",
    options: ["Active", "Inactive"],
    width: 110,
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "createdBy",
    label: "Creator",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.createdBy,
  },
  {
    key: "createdAt",
    label: "Create Date",
    type: "date",
    width: 160,
    defaultHidden: true,
    value: (r) => r.createdAt.slice(0, 10),
    render: (r) => stamp(r.createdAt),
  },
  {
    key: "updatedBy",
    label: "Update By",
    type: "text",
    width: 130,
    defaultHidden: true,
    value: (r) => r.updatedBy,
  },
  {
    key: "updatedAt",
    label: "Update Date",
    type: "date",
    width: 160,
    defaultHidden: true,
    value: (r) => r.updatedAt.slice(0, 10),
    render: (r) => stamp(r.updatedAt),
  },
];

function VehicleList() {
  const { t, lang } = useT();
  const vehicleTypes = useCodeOptions(CC.VEHICLE_TYPE, VEHICLE_TYPES);
  const truckTypes = useCodeOptions(CC.TRUCK_TYPE, TRUCK_TYPES);
  const navigate = useNavigate();
  const rows = useVehicles();
  const days = useVehicleAlertDays();
  const trailerSizes = useCodeOptions(CC.TRAILER_SIZE, TRAILER_TYPES);
  const trailerTypes = useCodeOptions(CC.TRAILER_TYPE, TRAILER_BODY_TYPES);
  const groups = useCodeOptions(CC.VEHICLE_GROUP, VEHICLE_GROUP_OPTIONS);
  // Brand is free text: the filter offers the brands found in the data.
  const brands = useMemo(
    () =>
      [...new Set(rows.map((r) => r.tradeMark.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );
  const fuelTypes = useCodeOptions(CC.FUEL_TYPE, FUEL_TYPES);
  const columns = useMemo(
    () =>
      columnsFor(t, days, {
        types: vehicleTypes,
        trailerSizes,
        trailerTypes,
        groups,
        truckTypes,
        brands,
        fuelTypes,
      }),
    // `t` is recreated every render; the language is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, days, vehicleTypes, trailerSizes, trailerTypes, groups, truckTypes, brands, fuelTypes],
  );
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/vehicle/$id", params: { id: r.id }, search: { mode } });

  return (
    <EntityListPage<Row>
      screen="vehicle-master"
      entityType="Vehicle"
      entityLabel="Vehicle"
      title="Vehicle List"
      above={
        <div className="mb-2 flex justify-end">
          <AlertDaysControl />
        </div>
      }
      rows={rows}
      columns={columns}
      searchPlaceholder="Tìm theo biển số, số khung, số máy, số đăng kiểm"
      searchValues={(r) => [
        r.plateNumber,
        r.chassisNumber,
        r.engineNumber,
        r.inspectionNo,
        r.inspectionReportNo,
      ]}
      quickFilters={[
        {
          key: "type",
          allLabel: "Vehicle Type: All",
          options: vehicleTypes.map((x) => ({
            label: x,
            conditions: [{ field: "vehicleType", operator: "eq", value: x }],
          })),
        },
        {
          key: "truckType",
          allLabel: "Truck Type: All",
          options: truckTypes.map((x) => ({
            label: x,
            conditions: [{ field: "truckType", operator: "eq", value: x }],
          })),
        },
        {
          key: "status",
          allLabel: "Status: All",
          options: ["Active", "Inactive"].map((s) => ({
            label: s,
            conditions: [{ field: "status", operator: "eq", value: s }],
          })),
        },
      ]}
      showRefresh={false}
      crud={vehicleCrud}
      importConfig={vehicleImportConfig}
      addLabel="Add Vehicle"
      onAdd={() => void navigate({ to: "/vehicle/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
