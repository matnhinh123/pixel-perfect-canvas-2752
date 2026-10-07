import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { locationRepository, tollStationRepository } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import {
  FEE_TYPE_OPTIONS,
  feeTypeName,
  locationLabel,
  sourceOf,
  tollStationCrud,
  tollStationImportConfig,
} from "@/services/tollStationService";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/toll-station/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s["q"] === "string" ? { q: s["q"] } : {},
  head: () => ({
    meta: [
      { title: "Toll Station — MoveX" },
      { name: "description", content: "Toll stations and their rates per toll group." },
    ],
  }),
  component: TollStationList,
});

type Row = TollGateRecord;
const SOURCES = ["Manual", "Vietmap"];

function TollStationList() {
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  const all = useCollection(tollStationRepository);
  const locations = useCollection(locationRepository);
  const rows = useMemo(() => all.filter((g) => !g.deleted), [all]);
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const location = (g: Row) => (g.locationId ? locById.get(g.locationId) : undefined);
  /** Area used by the filter: the linked location's province, else the station's own. */
  const area = (g: Row) => location(g)?.province || g.province || "";
  const areas = useMemo(
    () => [...new Set(rows.map(area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [rows, locById], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const columns = useMemo<ListColumn<Row>[]>(
    () => [
      {
        key: "code",
        label: "Toll Station Code",
        type: "text",
        pinned: true,
        value: (g) => g.code,
        render: (g) => <span className="font-semibold text-primary">{g.code}</span>,
      },
      {
        key: "name",
        label: "Toll Station Name",
        type: "text",
        value: (g) => g.name,
        className: "font-medium",
      },
      {
        key: "feeType",
        label: "Fee Type",
        type: "enum",
        options: [...FEE_TYPE_OPTIONS],
        value: (g) => feeTypeName(g.feeType),
      },
      {
        key: "location",
        label: "Location",
        type: "text",
        value: (g) => locationLabel(g, location(g)?.name),
        className: "text-muted-foreground",
      },
      {
        key: "area",
        label: "Area",
        type: "enum",
        options: areas,
        value: area,
        defaultHidden: true,
      },
      {
        key: "status",
        label: "Status",
        type: "enum",
        options: ["Active", "Inactive"],
        value: (g) => g.status,
        render: (g) => <StatusBadge status={g.status} />,
      },
      {
        key: "source",
        label: "Source",
        type: "enum",
        options: SOURCES,
        value: (g) => sourceOf(g),
        render: (g) => <Tag tone={sourceOf(g)}>{sourceOf(g)}</Tag>,
      },
      {
        key: "vietmapId",
        label: "Vietmap ID",
        type: "text",
        value: (g) => g.vietmapId ?? "",
        defaultHidden: true,
        render: (g) => <span className="font-mono text-xs">{g.vietmapId || "—"}</span>,
      },
      {
        key: "lat",
        label: "Latitude",
        type: "number",
        value: (g) => (Number.isFinite(g.lat) ? g.lat : null),
        defaultHidden: true,
      },
      {
        key: "lng",
        label: "Longitude",
        type: "number",
        value: (g) => (Number.isFinite(g.lng) ? g.lng : null),
        defaultHidden: true,
      },
      {
        key: "updatedAt",
        label: "Updated At",
        type: "date",
        value: (g) => g.updatedAt,
        defaultHidden: true,
        render: (g) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(g.updatedAt)}</span>
        ),
      },
    ],
    [areas, locById], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const quickFilters: QuickFilter[] = [
    {
      key: "feeType",
      allLabel: "All fee types",
      options: FEE_TYPE_OPTIONS.map((f) => ({
        label: f,
        conditions: [{ field: "feeType", operator: "eq", value: f }],
      })),
    },
    {
      key: "area",
      allLabel: "All areas",
      options: areas.map((a) => ({
        label: a,
        conditions: [{ field: "area", operator: "eq", value: a }],
      })),
    },
    {
      key: "status",
      allLabel: "All statuses",
      options: ["Active", "Inactive"].map((s) => ({
        label: s,
        conditions: [{ field: "status", operator: "eq", value: s }],
      })),
    },
    {
      key: "source",
      allLabel: "All sources",
      options: SOURCES.map((s) => ({
        label: s,
        conditions: [{ field: "source", operator: "eq", value: s }],
      })),
    },
  ];

  return (
    <EntityListPage<Row>
      key={q ?? ""}
      lang="en"
      screen="toll-station.v2"
      entityType="Toll Station"
      entityLabel="Toll Station"
      title="Toll Station"
      subtitle="Toll stations and their rates for the 5 toll groups"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search code, name, Vietmap ID..."
      searchValues={(g) => [g.code, g.name, g.vietmapId ?? ""]}
      quickFilters={quickFilters}
      crud={tollStationCrud}
      allowDelete={false}
      addLabel="Add Toll Station"
      onAdd={() => void navigate({ to: "/toll-station/$id", params: { id: "new" } })}
      onView={(g) =>
        void navigate({ to: "/toll-station/$id", params: { id: g.id }, search: { mode: "view" } })
      }
      onEdit={(g) =>
        void navigate({ to: "/toll-station/$id", params: { id: g.id }, search: { mode: "edit" } })
      }
      importConfig={tollStationImportConfig}
      {...(q ? { initialSearch: q } : {})}
    />
  );
}
