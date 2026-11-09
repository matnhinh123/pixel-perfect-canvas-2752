// Variable Cost › Toll Fee: one Toll Fee per route, made with the route. Each row shows the route's toll
// fee per vehicle group (from Route › Toll Stations) and the Fare Code it is booked to in a COGS; pick
// rows to map one Fare Code to all of them, or open a Toll Fee to map its own.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/components/movex/general/EntityListPage";
import { VariableCostTabs } from "@/components/movex/cost/VariableCostTabs";
import { MapFareDialog } from "@/components/movex/cost/MapFareDialog";
import { updatedAtColumn } from "@/components/movex/cost/listParts";
import type { ListColumn, QuickFilter } from "@/components/movex/general/types";
import { Amount } from "@/components/movex/general/Amount";
import { useCollection } from "@/hooks/use-store";
import {
  costItemRepository,
  routeRepository,
  tollFeeRepository,
  tollStationRepository,
} from "@/repositories";
import { routeTotals } from "@/services/cost/costMath";
import { routeTollStations, TOLL_GROUPS, tollTotals } from "@/services/cost/salaryRange";
import { syncTollFees } from "@/services/cost/tollFee";
import type { TollFeeRecord } from "@/types";

type TollFeeRow = TollFeeRecord & {
  routeName: string;
  routeType: string;
  calculated: boolean;
  stationCount: number;
  /** Toll fee of the route per vehicle group 1..5. */
  fees: number[];
  fareCode: string;
  fareName: string;
};

const mappingFilter: QuickFilter = {
  key: "mapping",
  allLabel: "All Fare Codes",
  options: ["Mapped", "Not mapped"].map((v) => ({
    label: v,
    conditions: [{ field: "mapping", operator: "eq", value: v }],
  })),
};

/** The Toll Fees with their route's fees and Fare Code. */
function useTollFeeRows(): TollFeeRow[] {
  const fees = useCollection(tollFeeRepository);
  const routes = useCollection(routeRepository);
  const tolls = useCollection(tollStationRepository);
  const costs = useCollection(costItemRepository);
  // A route without its Toll Fee yet (just made) gets one.
  useEffect(() => syncTollFees(), [routes]);
  return useMemo(() => {
    const masters = tolls.filter((t) => !t.deleted);
    return fees
      .filter((f) => !f.deleted)
      .flatMap((f): TollFeeRow[] => {
        const r = routes.find((x) => x.id === f.routeId && !x.deleted);
        if (!r) return [];
        const calculated = routeTotals(r).calculated;
        const stations = calculated ? routeTollStations(r, masters) : [];
        const fare = f.fareCostId ? costs.find((c) => c.id === f.fareCostId) : undefined;
        return [
          {
            ...f,
            routeName: r.name,
            routeType: r.type,
            calculated,
            stationCount: stations.length,
            fees: tollTotals(stations),
            fareCode: fare?.code ?? "",
            fareName: fare?.name ?? "",
          },
        ];
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [fees, routes, tolls, costs]);
}

export function TollFeeTab() {
  const rows = useTollFeeRows();
  const navigate = useNavigate();
  const [mapping, setMapping] = useState<{ ids: string[]; initial: string; clear?: () => void }>();
  const open = (id: string, mode: "view" | "edit" = "view") =>
    void navigate({ to: "/toll-fee/$id", params: { id }, search: { mode } });

  const columns = useMemo<ListColumn<TollFeeRow>[]>(
    () => [
      {
        key: "code",
        width: 140,
        label: "Toll Fee Code",
        type: "text",
        pinned: true,
        value: (r) => r.code,
        render: (r) => <span className="font-semibold text-primary">{r.code}</span>,
      },
      {
        key: "routeName",
        width: 200,
        label: "Route Name",
        type: "text",
        truncate: true,
        value: (r) => r.routeName,
      },
      {
        key: "fareCode",
        width: 120,
        label: "Fare Code",
        type: "text",
        value: (r) => r.fareCode,
        render: (r) =>
          r.fareCode ? (
            <span className="font-semibold">{r.fareCode}</span>
          ) : (
            <span className="whitespace-nowrap text-xs font-medium text-warning">Not mapped</span>
          ),
      },
      {
        key: "fareName",
        width: 180,
        label: "Fare Name",
        type: "text",
        truncate: true,
        value: (r) => r.fareName,
      },
      {
        key: "routeType",
        width: 110,
        defaultHidden: true,
        label: "Route Type",
        type: "enum",
        options: ["Single Trip", "Round Trip"],
        value: (r) => r.routeType,
      },
      {
        key: "stations",
        width: 120,
        label: "Stations",
        type: "number",
        value: (r) => r.stationCount,
        render: (r) =>
          r.calculated ? (
            r.stationCount
          ) : (
            <span className="whitespace-nowrap text-xs text-muted-foreground">Not calculated</span>
          ),
        className: "text-right",
      },
      ...TOLL_GROUPS.map((g): ListColumn<TollFeeRow> => ({
        key: `g${g}`,
        width: 120,
        label: `Group ${g}`,
        type: "number",
        value: (r) => r.fees[g - 1] ?? 0,
        render: (r) => (r.calculated ? <Amount vnd={r.fees[g - 1] ?? 0} /> : "—"),
        className: "text-right",
      })),
      {
        key: "mapping",
        width: 120,
        defaultHidden: true,
        label: "Mapping",
        type: "enum",
        options: ["Mapped", "Not mapped"],
        value: (r) => (r.fareCode ? "Mapped" : "Not mapped"),
      },
      {
        key: "remark",
        width: 200,
        label: "Remark",
        type: "text",
        defaultHidden: true,
        value: (r) => r.remark,
      },
      { ...updatedAtColumn<TollFeeRow>(), defaultHidden: true },
    ],
    [],
  );

  return (
    <>
      <EntityListPage<TollFeeRow>
        fillHeight
        above={<VariableCostTabs active="toll" />}
        lang="en"
        screen="toll-fee.v3"
        hideAdd
        entityType="Toll Fee"
        entityLabel="Toll Fee"
        title="Variable Cost"
        subtitle="One Toll Fee per route, made with the route. Fees come from Route › Toll Stations."
        rows={rows}
        columns={columns}
        searchPlaceholder="Search route code, route name, Fare Code..."
        searchValues={(r) => [r.code, r.routeName, r.fareCode, r.fareName, r.remark]}
        quickFilters={[mappingFilter]}
        readOnlyReason="Toll Fees are made with their route"
        importExport={false}
        bordered
        onView={(r) => open(r.id)}
        onEdit={(r) => open(r.id, "edit")}
        extraRowActions={[
          {
            label: "Map Fare Code",
            icon: <Link2 className="h-4 w-4" />,
            onClick: (r) => setMapping({ ids: [r.id], initial: r.fareCode }),
          },
        ]}
        bulkActions={(picked, clear) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMapping({ ids: picked.map((r) => r.id), initial: "", clear })}
          >
            <Link2 className="h-4 w-4" />
            Map Fare Code
          </Button>
        )}
      />
      <MapFareDialog
        key={mapping?.ids.join("|") ?? "none"}
        ids={mapping?.ids ?? []}
        initial={mapping?.initial ?? ""}
        open={!!mapping}
        onOpenChange={(o) => !o && setMapping(undefined)}
        onDone={() => mapping?.clear?.()}
      />
    </>
  );
}
