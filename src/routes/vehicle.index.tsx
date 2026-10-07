import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { vehicleMasterRepository } from "@/repositories";
import { expiryState, vehicleCrud } from "@/services/vehicleMasterService";
import { PRODUCTION_COUNTRIES, TRADE_MARKS, VEHICLE_TYPES } from "@/mock-data/vehicleMaster";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { VehicleMasterRecord } from "@/types";

export const Route = createFileRoute("/vehicle/")({
  head: () => ({
    meta: [
      { title: "Vehicle — MoveX" },
      { name: "description", content: "Vehicle master data: plates, registration and inspection." },
    ],
  }),
  component: VehicleList,
});

type Row = VehicleMasterRecord;
type T = (vi: string, en: string) => string;

const dash = "--";
const pad = (n: number) => String(n).padStart(2, "0");
/** yyyy/mm/dd hh:mm:ss, as in the design. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** An expiry date, flagged red when passed and amber when due within 30 days. */
function Expiry({ ymd, t }: { ymd: string; t: T }) {
  if (!ymd) return <span className="text-muted-foreground">-</span>;
  const s = expiryState(ymd);
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
            ? t("Sắp hết hạn (≤ 30 ngày)", "Expiring soon (≤ 30 days)")
            : undefined
      }
    >
      {formatDate(ymd)}
      {s === "expired" && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
      {s === "soon" && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
    </span>
  );
}

const allColumns = (t: T): ListColumn<Row>[] => [
  {
    key: "plateNumber",
    label: "Plate Number",
    type: "text",
    pinned: true,
    width: 130,
    value: (r) => r.plateNumber,
    render: (r) => <span className="font-semibold text-primary">{r.plateNumber}</span>,
  },
  {
    key: "vehicleType",
    label: "Vehicle Type",
    type: "enum",
    options: VEHICLE_TYPES,
    width: 120,
    value: (r) => r.vehicleType,
    render: (r) => (r.vehicleType ? <Tag>{r.vehicleType}</Tag> : dash),
  },
  {
    key: "vehicleGroup",
    label: "Vehicle Group",
    type: "text",
    width: 130,
    value: (r) => r.vehicleGroup,
    render: (r) => r.vehicleGroup || dash,
  },
  {
    key: "modelCode",
    label: "Model Code",
    type: "text",
    width: 160,
    truncate: true,
    value: (r) => r.modelCode,
    render: (r) => r.modelCode || dash,
  },
  {
    key: "productionCountry",
    defaultHidden: true,
    label: "Production Country",
    type: "enum",
    options: PRODUCTION_COUNTRIES,
    width: 150,
    value: (r) => r.productionCountry,
    render: (r) => r.productionCountry || dash,
  },
  {
    key: "chassisNumber",
    defaultHidden: true,
    label: "Chassis Number (VIN)",
    type: "text",
    width: 190,
    value: (r) => r.chassisNumber,
  },
  {
    key: "engineNumber",
    defaultHidden: true,
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
    width: 175,
    value: (r) => r.registrationExpiry,
    render: (r) => <Expiry ymd={r.registrationExpiry} t={t} />,
  },
  {
    key: "inspectionExpiry",
    label: "Inspection Expiration Date",
    type: "date",
    width: 170,
    value: (r) => r.inspectionExpiry,
    render: (r) => <Expiry ymd={r.inspectionExpiry} t={t} />,
  },
  {
    key: "tradeMark",
    label: "Trade Mark",
    type: "enum",
    options: TRADE_MARKS,
    width: 120,
    defaultHidden: true,
    value: (r) => r.tradeMark,
    render: (r) => r.tradeMark || dash,
  },
  {
    key: "status",
    label: t("Trạng thái", "Status"),
    type: "enum",
    options: ["Active", "Inactive"],
    width: 110,
    value: (r) => r.status,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "createdBy",
    label: "Created By",
    type: "text",
    width: 120,
    defaultHidden: true,
    value: (r) => r.createdBy,
  },
  {
    key: "createdAt",
    label: "Created At",
    type: "date",
    width: 170,
    defaultHidden: true,
    value: (r) => r.createdAt.slice(0, 10),
    render: (r) => stamp(r.createdAt),
  },
  {
    key: "updatedBy",
    label: "Updated By",
    type: "text",
    width: 120,
    defaultHidden: true,
    value: (r) => r.updatedBy,
  },
  {
    key: "updatedAt",
    label: "Updated At",
    type: "date",
    width: 170,
    defaultHidden: true,
    value: (r) => r.updatedAt.slice(0, 10),
    render: (r) => stamp(r.updatedAt),
  },
];

/** Default left-to-right order: what operations check daily (type, expiry dates, status) comes first. */
const COLUMN_ORDER = [
  "plateNumber",
  "vehicleType",
  "vehicleGroup",
  "modelCode",
  "registrationExpiry",
  "inspectionExpiry",
  "status",
];
const columnsFor = (t: T): ListColumn<Row>[] => {
  const rank = (k: string) => {
    const i = COLUMN_ORDER.indexOf(k);
    return i < 0 ? COLUMN_ORDER.length : i;
  };
  return allColumns(t)
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c.key) - rank(y.c.key) || x.i - y.i)
    .map((x) => x.c);
};

function VehicleList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(vehicleMasterRepository);
  const rows = useMemo(() => all.filter((r) => !r.deleted), [all]);
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t), [lang]);
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/vehicle/$id", params: { id: r.id }, search: { mode } });

  return (
    <EntityListPage<Row>
      screen="vehicle-master"
      entityType="Vehicle"
      entityLabel="Vehicle"
      title="Vehicle"
      rows={rows}
      columns={columns}
      searchPlaceholder={t(
        "Tìm biển số, số khung, số máy, model...",
        "Search plate, chassis, engine, model...",
      )}
      searchValues={(r) => [r.plateNumber, r.chassisNumber, r.engineNumber, r.modelCode]}
      quickFilters={[
        {
          key: "status",
          allLabel: t("Trạng thái: Tất cả", "Status: All"),
          options: ["Active", "Inactive"].map((s) => ({
            label: `${t("Trạng thái", "Status")}: ${s}`,
            conditions: [{ field: "status", operator: "eq", value: s }],
          })),
        },
        {
          key: "type",
          allLabel: t("Loại xe: Tất cả", "Type: All"),
          options: VEHICLE_TYPES.map((x) => ({
            label: `${t("Loại xe", "Type")}: ${x}`,
            conditions: [{ field: "vehicleType", operator: "eq", value: x }],
          })),
        },
      ]}
      creationDate={(r) => r.createdAt}
      crud={vehicleCrud}
      addLabel="Add Vehicle"
      onAdd={() => void navigate({ to: "/vehicle/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
