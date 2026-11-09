// Variable Cost › Toll Fee › a Toll Fee: its route, the toll stations with their fee per vehicle group
// (read from Route › Toll Stations; changed on the route) and the Fare Code it is booked to in a COGS.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  gridInBoxClass,
  InlineFields,
  Panel,
  StatusBadge,
  thClass,
} from "@/components/movex/common";
import { AuditHistoryDrawer } from "@/components/movex/AuditDrawer";
import {
  FormErrorBanner,
  FormPageHeader,
  useUnsavedChangesGuard,
} from "@/components/movex/general/FormPage";
import { Amount, CurrencySelect, EditLink } from "@/components/movex/general/Amount";
import { FareCodeInput, FareNameInput } from "@/components/movex/cost/FareCodeInput";
import { useFarePair } from "@/components/movex/cost/useFarePair";
import { useCollection } from "@/hooks/use-store";
import { routeRepository, tollStationRepository } from "@/repositories";
import { BusinessRuleError } from "@/services/crudService";
import { routeTotals } from "@/services/cost/costMath";
import { fareCodeOf } from "@/services/cost/fareCode";
import { routeTollStations, TOLL_GROUPS, tollTotals } from "@/services/cost/salaryRange";
import { tollFeeService } from "@/services/cost/tollFee";
import { useDisplayCurrency } from "@/lib/displayCurrency";
import { cn } from "@/lib/utils";
import type { TollFeeRecord } from "@/types";

export function TollFeeForm({ source, readOnly }: { source: TollFeeRecord; readOnly: boolean }) {
  const navigate = useNavigate();
  const routes = useCollection(routeRepository);
  const tolls = useCollection(tollStationRepository);
  const { usd } = useDisplayCurrency();
  const route = routes.find((r) => r.id === source.routeId && !r.deleted);
  const calculated = route ? routeTotals(route).calculated : false;
  const stations = useMemo(
    () =>
      route && calculated
        ? routeTollStations(
            route,
            tolls.filter((t) => !t.deleted),
          )
        : [],
    [route, calculated, tolls],
  );
  const totals = tollTotals(stations);

  const initial = useMemo(
    () => ({ fareCode: fareCodeOf(source.fareCostId), remark: source.remark ?? "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [d, setD] = useState(initial);
  const fare = useFarePair(d.fareCode, (fareCode) => {
    setD((x) => ({ ...x, fareCode }));
    setErrors((e) => ({ ...e, fareCode: "" }));
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = !readOnly && JSON.stringify(d) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);

  const toList = () => void navigate({ to: "/variable-cost", search: { tab: "toll" } });
  const back = () =>
    void navigate({ to: "/toll-fee/$id", params: { id: source.id }, search: { mode: "view" } });
  const save = () => {
    setFormError(null);
    try {
      const rec = tollFeeService.save(source.id, d);
      guard.allowNext();
      toast.success(`${rec.code} saved`);
      back();
    } catch (err) {
      if (err instanceof BusinessRuleError) {
        setErrors(err.fieldErrors);
        setFormError("Cannot save yet — please check:");
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const text = (v: string) => <div className="flex h-10 items-center text-sm">{v || "—"}</div>;
  const cell = "px-3 py-2";
  const head = (h: string, right = false) => (
    <th key={h} className={cn(thClass, cell, "whitespace-nowrap", right && "text-right")}>
      {h}
    </th>
  );

  return (
    <div>
      <FormPageHeader
        crumbs={[
          { label: "Variable Cost", to: "/variable-cost" },
          { label: "Toll Fee" },
          { label: source.code },
          { label: readOnly ? "Detail" : "Edit" },
        ]}
        title={readOnly ? `${source.code} · ${route?.name ?? ""}` : `Edit: ${source.code}`}
        subtitle="Toll Fee of the route, made with it"
        badge={<StatusBadge status={source.status} />}
        dirty={dirty}
        readOnly={readOnly}
        onBack={() => (readOnly ? toList() : back())}
        onCancel={back}
        onSave={save}
        extra={
          <>
            <CurrencySelect />
            <Button variant="outline" size="lg" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" />
              History
            </Button>
            {readOnly && (
              <EditLink usd={false}>
                <Link to="/toll-fee/$id" params={{ id: source.id }} search={{ mode: "edit" }}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </EditLink>
            )}
          </>
        }
      />
      <FormErrorBanner message={formError} errors={errors} />

      <div className="space-y-4">
        <Panel title="General Information" accent>
          <InlineFields labelWidth="8.5rem">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-3">
              <Field label="Toll Fee Code" info="The route's code (follows it).">
                {text(source.code)}
              </Field>
              <Field label="Route">
                {route ? (
                  <div className="flex h-10 items-center text-sm">
                    <Link
                      to="/routing/$id"
                      params={{ id: route.id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {route.code}
                    </Link>
                    <span className="ml-1.5 truncate text-muted-foreground">· {route.name}</span>
                  </div>
                ) : (
                  text("Route deleted")
                )}
              </Field>
              <Field label="Route Type">{text(route?.type ?? "")}</Field>
              <Field
                label="Fare Code"
                error={errors["fareCode"]}
                info="Fare Code Management: the Fare Code the toll stations of this route are booked to in a COGS. Type the code or the name: the other one is filled in. Empty: not mapped yet."
              >
                <FareCodeInput pair={fare} readOnly={readOnly} invalid={!!errors["fareCode"]} />
              </Field>
              <Field label="Fare Name">
                <FareNameInput pair={fare} readOnly={readOnly} invalid={!!errors["fareCode"]} />
              </Field>
              <div>
                <Field label="Remark">
                  {readOnly ? (
                    text(d.remark)
                  ) : (
                    <Textarea
                      value={d.remark}
                      maxLength={500}
                      rows={2}
                      placeholder="Enter Remark"
                      onChange={(e) => setD((x) => ({ ...x, remark: e.target.value }))}
                    />
                  )}
                </Field>
              </div>
            </div>
          </InlineFields>
        </Panel>

        <Panel
          title="Toll Stations"
          accent
          actions={
            route ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/routing/$id" params={{ id: route.id }}>
                  Open route
                </Link>
              </Button>
            ) : undefined
          }
        >
          <p className="mb-3 text-xs text-muted-foreground">
            Fee of each toll station per vehicle group, from Route › Toll Stations: stations and
            prices are changed on the route. A COGS takes the column of its vehicle group.
          </p>
          {!calculated ? (
            <p className="text-sm text-muted-foreground">
              The route is not calculated yet: no toll stations.
            </p>
          ) : stations.length === 0 ? (
            <p className="text-sm text-muted-foreground">The route has no toll stations.</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className={cn("w-full text-sm", gridInBoxClass)}>
                <thead>
                  <tr className="bg-muted">
                    {head("Leg")}
                    {head("Station Code")}
                    {head("Station Name")}
                    {TOLL_GROUPS.map((g) => head(`Group ${g}`, true))}
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s, i) => (
                    <tr key={`${s.leg}-${s.code}-${i}`} className="border-t">
                      <td className={cn(cell, "text-muted-foreground")}>{s.leg}</td>
                      <td className={cn(cell, "font-medium")}>{s.code}</td>
                      <td className={cell}>{s.name}</td>
                      {TOLL_GROUPS.map((g) => (
                        <td key={g} className={cn(cell, "text-right")}>
                          <Amount vnd={s.fees[g - 1] ?? 0} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/50 font-semibold">
                    <td className={cell} colSpan={3}>
                      Total
                    </td>
                    {TOLL_GROUPS.map((g) => (
                      <td key={g} className={cn(cell, "text-right")}>
                        <Amount vnd={totals[g - 1] ?? 0} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <AuditHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entityType="Toll Fee"
        entityId={source.id}
        title={source.code}
      />
    </div>
  );
}
