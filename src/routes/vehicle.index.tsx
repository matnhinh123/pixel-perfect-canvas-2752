import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { AlertDaysControl } from "@/components/movex/vehicle/VehicleAlerts";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import {
  expiryState,
  VEHICLE_GROUP_OPTIONS,
  vehicleCrud,
  vehicleImportConfig,
} from "@/services/vehicleMasterService";
import { TRUCK_TYPES, VEHICLE_TYPES } from "@/mock-data/vehicleMaster";
import { formatDate } from "@/lib/format";
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

/** SMD.VH.01 columns, in the spec's order; the four audit columns are hidden by default. */
const columnsFor = (t: T, days: number): ListColumn<Row>[] => [
  {
    key: "plateNumber",
    label: "Plate Number",
    type: "text",
    pinned: true,
    width: 140,
    value: (r) => r.plateNumber,
    render: (r) => <span className="font-semibold text-primary">{r.plateNumber}</span>,
  },
  {
    key: "vehicleType",
    label: "Vehicle Type",
    type: "enum",
    options: [...VEHICLE_TYPES],
    width: 120,
    value: (r) => r.vehicleType,
    render: (r) => (r.vehicleType ? <Tag>{r.vehicleType}</Tag> : dash),
  },
  {
    key: "vehicleGroup",
    label: "Vehicle Group",
    type: "enum",
    options: [...VEHICLE_GROUP_OPTIONS],
    width: 130,
    value: (r) => r.vehicleGroup,
    render: (r) => r.vehicleGroup || dash,
  },
  {
    key: "truckType",
    label: "Truck Type",
    type: "enum",
    options: TRUCK_TYPES,
    width: 120,
    value: (r) => r.truckType,
    render: (r) => (r.truckType ? <Tag>{r.truckType}</Tag> : dash),
  },
  {
    key: "trailerType",
    label: "Trailer Type",
    type: "enum",
    options: [...TRAILER_TYPES],
    width: 120,
    value: (r) => r.trailerType,
    render: (r) => (r.trailerType ? <Tag>{r.trailerType}</Tag> : dash),
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
    truncate: true,
    value: (r) => r.engineNumber,
    render: (r) => r.engineNumber || dash,
  },
  {
    key: "registrationExpiry",
    label: "Registration Expiration Date",
    type: "date",
    width: 200,
    value: (r) => r.registrationExpiry,
    render: (r) => <Expiry ymd={r.registrationExpiry} t={t} days={days} />,
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
  const navigate = useNavigate();
  const rows = useVehicles();
  const days = useVehicleAlertDays();
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, days), [lang, days]);
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
      searchPlaceholder="Tìm theo biển số, số khung, số máy"
      searchValues={(r) => [r.plateNumber, r.chassisNumber, r.engineNumber]}
      quickFilters={[
        {
          key: "type",
          allLabel: "Vehicle Type: All",
          options: VEHICLE_TYPES.map((x) => ({
            label: x,
            conditions: [{ field: "vehicleType", operator: "eq", value: x }],
          })),
        },
        {
          key: "truckType",
          allLabel: "Truck Type: All",
          options: TRUCK_TYPES.map((x) => ({
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
