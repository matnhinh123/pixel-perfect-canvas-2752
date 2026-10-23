// Variable Cost › Reference Trip: pick a route and a vehicle type to see what the trip costs — Trip
// Salary and Road Support Fee from the vehicle type's Salary Range, Fuel Cost from its Fuel Cost, Toll
// Fee from the Toll Stations of the route at its vehicle group. Nothing is saved; a COGS works it out
// the same way.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, Field, NativeSelect, Panel, thClass } from "@/components/movex/common";
import { SearchableSelect } from "@/components/movex/general/SearchableSelect";
import { VehicleTypePicker } from "@/components/movex/cost/VehicleTypePicker";
import { useVehicleTypes } from "@/components/movex/cost/useVehicleTypes";
import { useCollection } from "@/hooks/use-store";
import {
  fuelCostRepository,
  routeRepository,
  salaryRangeRepository,
  tollStationRepository,
} from "@/repositories";
import { setupsFor, tripVariable } from "@/services/cost/cogsBuild";
import { routeTotals } from "@/services/cost/costMath";
import { routeTollStations } from "@/services/cost/salaryRange";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const money = (n: number) => formatNumber(Math.round(n));
const num = "text-right tabular-nums";
const SOURCE = {
  "Trip Salary": "Salary Range",
  "Road Support Fee": "Salary Range",
  "Fuel Cost": "Fuel Cost",
  "Toll Fee": "Toll Station",
} as const;

export function ReferenceTripTab() {
  const routesAll = useCollection(routeRepository);
  const salaryAll = useCollection(salaryRangeRepository);
  const fuelAll = useCollection(fuelCostRepository);
  const tollAll = useCollection(tollStationRepository);
  const types = useVehicleTypes();
  const routes = useMemo(
    () =>
      routesAll
        .filter((r) => !r.deleted && routeTotals(r).calculated)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [routesAll],
  );
  const tollMasters = useMemo(() => tollAll.filter((t) => !t.deleted), [tollAll]);
  const [routeId, setRouteId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [salaryRangeId, setSalaryRangeId] = useState("");
  const [fuelCostId, setFuelCostId] = useState("");
  const route = routes.find((r) => r.id === routeId);
  const vt = types.find((t) => t.key === vehicleType);
  const salaryOptions = vt ? setupsFor(salaryAll, vt.key) : [];
  const fuelOptions = vt ? setupsFor(fuelAll, vt.key) : [];
  const trip =
    route && vt
      ? tripVariable(route, vt, {
          salaryRanges: salaryAll,
          fuelCosts: fuelAll,
          tollMasters,
          salaryRangeId,
          fuelCostId,
        })
      : null;
  const stations = route ? routeTollStations(route, tollMasters) : [];
  const km = route ? Math.round(routeTotals(route).distanceKm) : 0;

  return (
    <div className="space-y-4">
      <Panel title="Reference Trip">
        <p className="mb-4 text-sm text-muted-foreground">
          Pick a route and a vehicle type to see what one trip costs. Nothing is saved — a COGS of
          that route and vehicle type works it out the same way.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <Field label="Route" className="sm:col-span-5">
            <SearchableSelect
              value={routeId}
              onChange={setRouteId}
              options={["", ...routes.map((r) => r.id)]}
              labels={{
                "": "Select Route",
                ...Object.fromEntries(routes.map((r) => [r.id, `${r.code} - ${r.name}`])),
              }}
              searchPlaceholder="Search route…"
              emptyText="No matching route"
            />
          </Field>
          <Field
            label="Vehicle Type"
            className="sm:col-span-7"
            info="From Master Data › Vehicle: Truck → Truck Type, or Header → Container (+ Reefer), then Brand."
          >
            <VehicleTypePicker
              value={vehicleType}
              onChange={(k) => {
                setVehicleType(k);
                setSalaryRangeId("");
                setFuelCostId("");
              }}
              types={types}
            />
          </Field>
          {vt && (
            <>
              <Field label="Salary Range" className="sm:col-span-6">
                <NativeSelect
                  value={trip?.salaryRange?.id ?? salaryOptions[0]?.id ?? ""}
                  onChange={setSalaryRangeId}
                  options={salaryOptions.length ? salaryOptions.map((r) => r.id) : [""]}
                  labels={{
                    "": `No Salary Range for ${vt.key}`,
                    ...Object.fromEntries(
                      salaryOptions.map((r) => [r.id, `${r.code} · ${r.name} · ${r.vehicleType}`]),
                    ),
                  }}
                  disabled={salaryOptions.length < 2}
                  className="h-10 w-full"
                />
              </Field>
              <Field label="Fuel Cost" className="sm:col-span-6">
                <NativeSelect
                  value={trip?.fuelCost?.id ?? fuelOptions[0]?.id ?? ""}
                  onChange={setFuelCostId}
                  options={fuelOptions.length ? fuelOptions.map((r) => r.id) : [""]}
                  labels={{
                    "": `No Fuel Cost for ${vt.key}`,
                    ...Object.fromEntries(
                      fuelOptions.map((r) => [r.id, `${r.code} · ${r.name} · ${r.vehicleType}`]),
                    ),
                  }}
                  disabled={fuelOptions.length < 2}
                  className="h-10 w-full"
                />
              </Field>
            </>
          )}
        </div>
      </Panel>

      {!trip || !route || !vt ? (
        <EmptyState title="Select a route and a vehicle type to see the cost of the trip" />
      ) : (
        <Panel
          title="Variable Cost of the trip"
          bodyClassName="p-0"
          actions={
            <span className="text-sm text-muted-foreground">
              {route.code} · {formatNumber(km)} km · {route.terrain ?? "Plain"} · {vt.key} · Group{" "}
              {vt.group}
            </span>
          }
        >
          <Table className="table-fixed">
            <colgroup>
              <col className="w-48" />
              <col className="w-48" />
              <col />
              <col className="w-44" />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={thClass}>Cost</TableHead>
                <TableHead className={thClass}>Read From</TableHead>
                <TableHead className={thClass}>How it is worked out</TableHead>
                <TableHead className={cn(thClass, "text-right")}>Amount / Trip (₫)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trip.lines.map((l) => (
                <TableRow key={l.component}>
                  <TableCell className="py-2.5 align-top font-medium">{l.component}</TableCell>
                  <TableCell className="py-2.5 align-top">
                    <div className="text-xs text-muted-foreground">{SOURCE[l.component]}</div>
                    <div className="font-mono text-xs">{l.code}</div>
                  </TableCell>
                  <TableCell className="py-2.5 align-top text-xs leading-5 text-muted-foreground">
                    {l.basis}
                    {l.component === "Toll Fee" && stations.length > 0 && (
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="text-left">
                            <th className="py-1 font-medium">Leg</th>
                            <th className="py-1 font-medium">Station</th>
                            <th className="py-1 text-right font-medium">Group {vt.group}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stations.map((s, k) => (
                            <tr key={k} className="border-t">
                              <td className="py-1">{s.leg}</td>
                              <td className="py-1">
                                {s.code} · {s.name}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {money(s.fees[vt.group - 1] ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </TableCell>
                  <TableCell className={cn("py-2.5 align-top font-semibold", num)}>
                    {money(l.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {(!trip.salaryRange || !trip.fuelCost) && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-2 text-xs text-warning">
                    Not counted: no{" "}
                    {[!trip.salaryRange && "Salary Range", !trip.fuelCost && "Fuel Cost"]
                      .filter(Boolean)
                      .join(" or ")}{" "}
                    for {vt.key} yet — add it in the tab above.{" "}
                    <Link to="/variable-cost" className="text-primary hover:underline">
                      Variable Cost
                    </Link>
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="border-t-2 bg-primary/10 hover:bg-primary/10">
                <TableCell colSpan={3} className="py-3 font-semibold">
                  Variable Cost / Trip
                </TableCell>
                <TableCell className={cn("py-3 text-base font-bold", num)}>
                  {money(trip.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
