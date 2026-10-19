import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions } from "@/services/commonCodeService";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, Tag } from "@/components/movex/common";
import { EntityListPage, type ExtraRowAction } from "@/components/movex/general/EntityListPage";
import { useConfirm } from "@/components/movex/general/ConfirmDialog";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { useCollection } from "@/hooks/use-store";
import { locationRepository, tollStationRepository } from "@/repositories";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import {
  FEE_TYPE_OPTIONS,
  TOLL_GROUPS,
  TOLL_STATION_STATUSES,
  archiveTollStations,
  feeTypeName,
  locationLabel,
  sourceOf,
  tollGroupTokens,
  tollStationCrud,
  tollStationImportConfig,
  tollStationStatus,
} from "@/services/tollStationService";
import { formatDateTime, formatNumber } from "@/lib/format";

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
/** Toll fee of group index i (0..4); null when missing / not a number. */
const feeOf = (g: Row, i: number): number | null => {
  const v = g.prices?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

function TollStationList() {
  const navigate = useNavigate();
  const feeTypes = useCodeOptions(CC.TOLL_FEE_TYPE, FEE_TYPE_OPTIONS);
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
        options: [...TOLL_STATION_STATUSES],
        value: (g) => tollStationStatus(g),
        render: (g) => <StatusBadge status={tollStationStatus(g)} />,
      },
      // Toll Rates per group: hidden by default; can be shown, sorted, filtered and exported.
      ...TOLL_GROUPS.map(({ group }, i): ListColumn<Row> => ({
        key: `group${group}`,
        label: `Group ${group}`,
        type: "number",
        defaultHidden: true,
        className: "text-right",
        value: (g) => feeOf(g, i),
        render: (g) => {
          const fee = feeOf(g, i);
          return fee === null ? "—" : <span className="font-medium">{formatNumber(fee)}</span>;
        },
      })),
      {
        // Technical column behind the "Toll Group" quick filter ("G1 G2 …" = groups with a fee > 0).
        key: "tollGroups",
        label: "Toll Groups",
        type: "text",
        defaultHidden: true,
        value: (g) => tollGroupTokens(g),
      },
      {
        key: "source",
        label: "Source From",
        type: "enum",
        options: SOURCES,
        value: (g) => sourceOf(g),
        render: (g) => <Tag tone={sourceOf(g)}>{sourceOf(g)}</Tag>,
      },
      {
        key: "mapPosition",
        label: "Map Position",
        type: "text",
        value: (g) =>
          Number.isFinite(g.lat) && Number.isFinite(g.lng) ? `${g.lat}, ${g.lng}` : "",
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
      allLabel: "Fee Type: All",
      options: feeTypes.map((f) => ({
        label: f,
        conditions: [{ field: "feeType", operator: "eq", value: f }],
      })),
    },
    {
      key: "area",
      allLabel: "Area: All",
      options: areas.map((a) => ({
        label: a,
        conditions: [{ field: "area", operator: "eq", value: a }],
      })),
    },
    {
      key: "tollGroup",
      allLabel: "Toll Group: All",
      options: TOLL_GROUPS.map(({ group }) => ({
        label: `Group ${group}`,
        conditions: [{ field: "tollGroups", operator: "contains", value: `G${group}` }],
      })),
    },
    {
      key: "status",
      allLabel: "Status: All",
      options: TOLL_STATION_STATUSES.map((s) => ({
        label: s,
        conditions: [{ field: "status", operator: "eq", value: s }],
      })),
    },
    {
      key: "source",
      allLabel: "Source From: All",
      options: SOURCES.map((s) => ({
        label: s,
        conditions: [{ field: "source", operator: "eq", value: s }],
      })),
    },
  ];

  const confirm = useConfirm();
  const archive = async (g: Row, archived: boolean) => {
    if (!!g.archived === archived) {
      toast.info(`Toll station ${g.code} is already ${archived ? "archived" : "not archived"}.`);
      return;
    }
    const r = await confirm(
      archived
        ? {
            title: `Archive Toll Station ${g.code}?`,
            description:
              "The station is kept with its rates and history, set to Inactive and no longer used for route calculation. You can restore it later.",
            cancelLabel: "Cancel",
            confirmLabel: "Archive",
            tone: "danger",
          }
        : {
            title: `Restore Toll Station ${g.code}?`,
            description:
              "The station returns from the archive as Inactive. Activate it to use it for routing again.",
            cancelLabel: "Cancel",
            confirmLabel: "Restore",
          },
    );
    if (r !== "confirm") return;
    if (archiveTollStations([g.id], archived))
      toast.success(`Toll station ${g.code} ${archived ? "archived" : "restored"}`);
  };
  // `hidden` shows Archive only for non-archived rows and Restore only for archived ones.
  const extraRowActions: (ExtraRowAction<Row> & { hidden?: (g: Row) => boolean })[] = [
    {
      label: "Archive",
      icon: <Archive className="h-4 w-4" />,
      hidden: (g) => !!g.archived,
      onClick: (g) => void archive(g, true),
    },
    {
      label: "Restore",
      icon: <ArchiveRestore className="h-4 w-4" />,
      hidden: (g) => !g.archived,
      onClick: (g) => void archive(g, false),
    },
  ];

  return (
    <EntityListPage<Row>
      key={q ?? ""}
      lang="en"
      screen="toll-station.v3"
      entityType="Toll Station"
      entityLabel="Toll Station"
      title="Toll Station"
      rows={rows}
      columns={columns}
      searchPlaceholder="Search code, name..."
      searchValues={(g) => [g.code, g.name]}
      quickFilters={quickFilters}
      showRefresh={false}
      crud={tollStationCrud}
      allowDelete={false}
      extraRowActions={extraRowActions}
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
