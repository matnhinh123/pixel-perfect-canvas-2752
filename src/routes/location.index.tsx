import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { StatusBadge, Tag } from "@/components/movex/common";
import {
  EntityListPage,
  type FilterChip,
  type ListState,
} from "@/components/movex/general/EntityListPage";
import type { ListColumn } from "@/components/movex/general/types";
import { LocationFilterBar } from "@/components/movex/location/LocationFilterBar";
import { useCollection } from "@/hooks/use-store";
import { locationRepository } from "@/repositories";
import { listLocations, locationCrud, locationImportConfig } from "@/services/locationService";
import {
  appliedConditions,
  EMPTY_LOCATION_FILTER,
  filterFromSearch,
  matchLocation,
  parseLocationSearch,
  sortFromSearch,
  toLocationSearch,
  withoutField,
  type LocationFilter,
} from "@/services/locationFilter";
import { LOCATION_COUNTRIES, LOCATION_TYPES, VN_PROVINCES } from "@/mock-data/locationCatalog";
import { locationOrigin, type LocationMasterRecord } from "@/mock-data/locations";
import { CODE_KINDS } from "@/mock-data/standardCodes";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DEFAULT_PAGE_SIZE } from "@/lib/paging";

export const Route = createFileRoute("/location/")({
  validateSearch: parseLocationSearch,
  head: () => ({
    meta: [
      { title: "Location — MoveX" },
      { name: "description", content: "Location (source) master data used by Routing." },
    ],
  }),
  component: LocationList,
});

type Row = LocationMasterRecord;
type T = (vi: string, en: string) => string;

/** Same fields, labels and order as the Location detail form. */
const columnsFor = (t: T, provinces: string[]): ListColumn<Row>[] => [
  {
    // The detail form names this field after its Code Type (UN/LOCODE / IATA Code / Local Code).
    key: "id",
    label: "Code",
    type: "text",
    pinned: true,
    width: 130,
    value: (r) => r.code ?? r.id,
    render: (r) => <span className="font-semibold text-primary">{r.code ?? r.id}</span>,
  },
  {
    key: "origin",
    label: "Code Type",
    type: "enum",
    options: [...CODE_KINDS],
    width: 130,
    value: (r) => locationOrigin(r),
    render: (r) => <Tag>{locationOrigin(r)}</Tag>,
  },
  {
    key: "name",
    label: "Location Name",
    type: "text",
    width: 220,
    truncate: true,
    value: (r) => r.name,
    className: "font-medium",
  },
  {
    key: "locationType",
    label: "Location Type",
    type: "enum",
    options: [...LOCATION_TYPES],
    width: 140,
    value: (r) => r.locationType ?? "",
    render: (r) => (r.locationType ? <Tag>{r.locationType}</Tag> : "—"),
  },
  {
    key: "coords",
    label: "Latitude, Longitude",
    type: "text",
    width: 170,
    value: (r) => (Number.isFinite(r.lat) && Number.isFinite(r.lng) ? `${r.lat}, ${r.lng}` : ""),
  },
  {
    key: "country",
    label: "Country",
    type: "enum",
    options: LOCATION_COUNTRIES,
    width: 110,
    value: (r) => r.country ?? "",
  },
  {
    key: "province",
    label: "Province/City",
    type: "enum",
    options: provinces,
    width: 160,
    truncate: true,
    value: (r) => r.province ?? "",
  },
  {
    key: "address",
    label: "Address",
    type: "text",
    width: 260,
    truncate: true,
    value: (r) => r.address,
    className: "text-muted-foreground",
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
    key: "remark",
    label: "Remark",
    type: "text",
    width: 220,
    truncate: true,
    defaultHidden: true,
    value: (r) => r.remark ?? "",
  },
  {
    key: "updatedAt",
    label: t("Cập nhật", "Updated At"),
    type: "date",
    width: 150,
    defaultHidden: true,
    value: (r) => r.updatedAt.slice(0, 10),
    render: (r) => formatDateTime(r.updatedAt),
  },
];

function LocationList() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const all = useCollection(locationRepository);
  const rows = useMemo(() => listLocations(all), [all]);
  const provinces = useMemo(
    () =>
      [...new Set([...VN_PROVINCES, ...rows.map((r) => r.province ?? "")])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    [rows],
  );
  // `t` is recreated every render; the language is the real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => columnsFor(t, provinces), [lang, provinces]);
  const open = (r: Row, mode: "view" | "edit") =>
    void navigate({ to: "/location/$id", params: { id: r.id }, search: { mode } });

  // BR4: filters, sort, page and rows per page live in the URL query.
  const search = Route.useSearch();
  const filter = useMemo(() => filterFromSearch(search), [search]);
  const listState: ListState = {
    q: search.q ?? "",
    sort: sortFromSearch(search),
    page: search.page ?? 1,
    pageSize: search.size ?? DEFAULT_PAGE_SIZE,
  };
  const go = (f: LocationFilter, l: ListState) =>
    void navigate({ to: "/location", search: toLocationSearch(f, l), replace: true });
  // A filter change shows the first page of the new result.
  const setFilter = (f: LocationFilter) => go(f, { ...listState, page: 1 });
  const match = useCallback((r: Row) => matchLocation(r, filter), [filter]);
  const chips: FilterChip[] = appliedConditions(filter, t).map((c) => ({
    key: c.field,
    label: c.text,
    onRemove: () => setFilter(withoutField(filter, c.field, rows)),
  }));

  return (
    <EntityListPage<Row>
      screen="location"
      entityType="Location"
      entityLabel="Location"
      title="Location"
      rows={rows}
      columns={columns}
      searchPlaceholder={t(
        "Tìm mã, tên, địa chỉ, tỉnh, UN/LOCODE, IATA...",
        "Search code, name, address, province, UN/LOCODE, IATA...",
      )}
      searchValues={(r) => [
        r.id,
        r.code ?? "",
        r.name,
        r.address,
        r.province ?? "",
        r.country ?? "",
        r.unLocode ?? "",
        r.iataCode ?? "",
      ]}
      listState={listState}
      onListStateChange={(l) => go(filter, l)}
      customFilters={{
        toolbar: <LocationFilterBar rows={rows} value={filter} onChange={setFilter} t={t} />,
        match,
        chips,
        onClearAll: (withSearch) =>
          go(EMPTY_LOCATION_FILTER, { ...listState, page: 1, ...(withSearch ? { q: "" } : {}) }),
      }}
      showRefresh={false}
      crud={locationCrud}
      importConfig={locationImportConfig}
      addLabel="Add Location"
      onAdd={() => void navigate({ to: "/location/$id", params: { id: "new" }, search: {} })}
      onView={(r) => open(r, "view")}
      onEdit={(r) => open(r, "edit")}
    />
  );
}
