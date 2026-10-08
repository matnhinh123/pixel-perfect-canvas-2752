import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { AlertDaysControl } from "@/components/movex/vehicle/VehicleAlerts";
import { useVehicleAlertDays, useVehicles } from "@/components/movex/vehicle/useVehicleData";
import { useCollection } from "@/hooks/use-store";
import { businessPartnerRepository } from "@/repositories";
import {
  expiryState,
  ownerLabel,
  VEHICLE_GROUP_OPTIONS,
  vehicleCrud,
  vehicleImportConfig,
} from "@/services/vehicleMasterService";
import { PRODUCTION_COUNTRIES, TRADE_MARKS, VEHICLE_TYPES } from "@/mock-data/vehicleMaster";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BusinessPartnerRecord, VehicleMasterRecord } from "@/types";

export const Route = createFileRoute("/vehicle/")({
  head: () => ({
    meta: [
      { title: "Vehicle — MoveX" },
      {
        name: "description",
        content: "Vehicle master data: plates, type, group, owner and document expiry.",
      },
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

/** An expiry date, flagged red when passed and amber when due within the alert threshold. */
function Expiry({ ymd, t, days }: { ymd: string; t: T; days: number }) {
  if (!ymd) return <span className="text-muted-foreground">-</span>;
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

const allColumns = (t: T, bps: BusinessPartnerRecord[], days: number): ListColumn<Row>[] => [
  {
    key: "plateNumber",
    label: t("Biển số", "Plate No."),
    type: "text",
    pinned: true,
    width: 130,
    value: (r) => r.plateNumber,
    render: (r) => <span className="font-semibold text-primary">{r.plateNumber}</span>,
  },
  {
    key: "vehicleType",
    label: t("Loại xe", "Type"),
    type: "enum",
    options: [...VEHICLE_TYPES],
    width: 110,
    value: (r) => r.vehicleType,
    render: (r) => (r.vehicleType ? <Tag>{r.vehicleType}</Tag> : dash),
  },
  {
    key: "vehicleGroup",
    label: t("Nhóm xe", "Group"),
    type: "enum",
    options: [...VEHICLE_GROUP_OPTIONS],
    width: 180,
    value: (r) => r.vehicleGroup,
    render: (r) => r.vehicleGroup || dash,
  },
  {
    key: "ownership",
    label: t("Sở hữu", "Ownership"),
    type: "enum",
    options: ["Own", "Outsourced"],
    width: 120,
    defaultHidden: true,
    value: (r) => r.ownership,
  },
  {
    key: "owner",
    label: t("Chủ xe", "Owner"),
    type: "text",
    width: 220,
    truncate: true,
    value: (r) => ownerLabel(r, bps),
    render: (r) =>
      r.ownership === "Outsourced" ? (
        ownerLabel(r, bps)
      ) : (
        <span className="text-muted-foreground">{t("Xe nhà", "Own")}</span>
      ),
  },
  {
    key: "authorizedPayload",
    label: t("Tải trọng (kg)", "Capacity (kg)"),
    type: "number",
    width: 130,
    value: (r) => (r.authorizedPayload ? Number(r.authorizedPayload) : null),
    render: (r) => (r.authorizedPayload ? Number(r.authorizedPayload).toLocaleString() : dash),
  },
  {
    key: "modelCode",
    label: "Model",
    type: "text",
    width: 160,
    truncate: true,
    defaultHidden: true,
    value: (r) => r.modelCode,
    render: (r) => r.modelCode || dash,
  },
  {
    key: "productionCountry",
    defaultHidden: true,
    label: t("Xuất xứ", "Origin"),
    type: "enum",
    options: PRODUCTION_COUNTRIES,
    width: 150,
    value: (r) => r.productionCountry,
    render: (r) => r.productionCountry || dash,
  },
  {
    key: "chassisNumber",
    defaultHidden: true,
    label: t("Số khung", "VIN"),
    type: "text",
    width: 190,
    value: (r) => r.chassisNumber,
  },
  {
    key: "engineNumber",
    defaultHidden: true,
    label: t("Số máy", "Engine No."),
    type: "text",
    width: 150,
    truncate: true,
    value: (r) => r.engineNumber,
    render: (r) => r.engineNumber || dash,
  },
  {
    key: "inspectionExpiry",
    label: t("Hạn đăng kiểm", "Registration Expiry"),
    type: "date",
    width: 175,
    value: (r) => r.inspectionExpiry,
    render: (r) => <Expiry ymd={r.inspectionExpiry} t={t} days={days} />,
  },
  {
    key: "insuranceExpiry",
    label: t("Hạn bảo hiểm", "Insurance Expiry"),
    type: "date",
    width: 165,
    value: (r) => r.insuranceExpiry,
    render: (r) => <Expiry ymd={r.insuranceExpiry} t={t} days={days} />,
  },
  {
    key: "badgeExpiry",
    label: t("Hạn phù hiệu", "Badge Expiry"),
    type: "date",
    width: 155,
    value: (r) => r.badgeExpiry,
    render: (r) => <Expiry ymd={r.badgeExpiry} t={t} days={days} />,
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

/** Default left-to-right order: what operations check daily (type, owner, expiry dates, status) comes first. */
const COLUMN_ORDER = [
  "plateNumber",
  "vehicleType",
  "vehicleGroup",
  "owner",
  "authorizedPayload",
  "inspectionExpiry",
  "insuranceExpiry",
  "badgeExpiry",
  "status",
];
const columnsFor = (t: T, bps: BusinessPartnerRecord[], days: number): ListColumn<Row>[] => {
  const rank = (k: string) => {
    const i = COLUMN_ORDER.indexOf(k);
    return i < 0 ? COLUMN_ORDER.length : i;
  };
  return allColumns(t, bps, days)
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c.key) - rank(y.c.key) || x.i - y.i)
    .map((x) => x.c);
};

function VehicleList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const rows = useVehicles();
  const bps = useCollection(businessPartnerRepository);
  const days = useVehicleAlertDays();
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, bps, days), [lang, bps, days]);
  /** Owners actually used by the vehicles, for the quick filter. */
  const owners = useMemo(
    () =>
      Array.from(
        new Set(rows.filter((r) => r.ownership === "Outsourced").map((r) => ownerLabel(r, bps))),
      ).sort(),
    [rows, bps],
  );
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/vehicle/$id", params: { id: r.id }, search: { mode } });

  return (
    <EntityListPage<Row>
      screen="vehicle-master"
      entityType="Vehicle"
      entityLabel="Vehicle"
      title="Vehicle"
      above={
        <div className="mb-2 flex justify-end">
          <AlertDaysControl />
        </div>
      }
      rows={rows}
      columns={columns}
      searchPlaceholder={t(
        "Tìm biển số, chủ xe, số khung, model...",
        "Search plate, owner, chassis, model...",
      )}
      searchValues={(r) => [
        r.plateNumber,
        r.ownership === "Outsourced" ? ownerLabel(r, bps) : "",
        r.chassisNumber,
        r.engineNumber,
        r.modelCode,
      ]}
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
        {
          key: "owner",
          allLabel: t("Chủ xe: Tất cả", "Owner: All"),
          options: [
            {
              label: `${t("Chủ xe", "Owner")}: ${t("Xe nhà", "Own")}`,
              conditions: [{ field: "ownership", operator: "eq", value: "Own" }],
            },
            {
              label: `${t("Chủ xe", "Owner")}: ${t("Thuê ngoài (tất cả)", "Outsourced (all)")}`,
              conditions: [{ field: "ownership", operator: "eq", value: "Outsourced" }],
            },
            ...owners.map((o) => ({
              label: `${t("Chủ xe", "Owner")}: ${o}`,
              conditions: [{ field: "owner", operator: "eq" as const, value: o }],
            })),
          ],
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
