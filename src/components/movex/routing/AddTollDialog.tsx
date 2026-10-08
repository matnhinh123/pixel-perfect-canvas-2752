import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, NativeSelect } from "@/components/movex/common";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import { activeTollGates } from "@/services/routing/tollGates";
import { inferFeeType, tollClassLabel } from "@/services/routing/RouteProvider";
import { uid } from "@/repositories";
import type { TollStation } from "@/types";
import { cn } from "@/lib/utils";

export type TollLeg = "Outbound" | "Return";

/** Route toll built from a Toll Station master record, priced for the route's toll class. */
const toRouteToll = (g: TollGateRecord, cls: number): TollStation => ({
  id: g.id,
  code: g.code,
  name: g.name,
  address: g.province || g.address,
  feeType: g.feeType,
  price: g.prices[cls] ?? 0,
  vehicleTollGroup: tollClassLabel(cls),
  passCount: 1,
  source: "Manual",
  reconciled: true,
  ...(Number.isFinite(g.lat) && Number.isFinite(g.lng) ? { lat: g.lat, lng: g.lng } : {}),
});

/**
 * "Add Toll" on the route: pick a station from Toll Station master, or type a manual toll
 * that is kept on this route only (no Toll Station master record).
 */
export function AddTollDialog({
  open,
  onOpenChange,
  tollClass,
  existingIds,
  legs,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Toll class index (0..4) of the route's vehicle. */
  tollClass: number;
  /** Tolls already on the route — shown as added. */
  existingIds: Set<string>;
  /** More than one leg only for a round trip with a custom return route. */
  legs: TollLeg[];
  onAdd: (toll: TollStation, leg: TollLeg) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {open && (
          <AddTollBody
            tollClass={tollClass}
            existingIds={existingIds}
            legs={legs}
            onAdd={(t, leg) => {
              onAdd(t, leg);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddTollBody({
  tollClass,
  existingIds,
  legs,
  onAdd,
  onCancel,
}: {
  tollClass: number;
  existingIds: Set<string>;
  legs: TollLeg[];
  onAdd: (toll: TollStation, leg: TollLeg) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"list" | "new">("list");
  const [leg, setLeg] = useState<TollLeg>(legs[0] ?? "Outbound");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [d, setD] = useState({ code: "", name: "", location: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gates = useMemo(() => activeTollGates(), []);
  const shown = gates.filter((g) => {
    const s = q.trim().toLowerCase();
    return !s || [g.code, g.name, g.road, g.province].some((x) => x.toLowerCase().includes(s));
  });

  const addPicked = () => {
    const g = gates.find((x) => x.id === pick);
    if (g) onAdd(toRouteToll(g, tollClass), leg);
  };

  /** A manual toll lives on this route only — it is not added to Toll Station master. */
  const addNew = () => {
    const code = d.code.trim().toUpperCase();
    const name = d.name.trim();
    const e: Record<string, string> = {};
    if (code && !/^[A-Z0-9._-]{1,30}$/.test(code)) e["code"] = "Use A–Z, 0–9, . - _ (max 30).";
    if (!name) e["name"] = "Toll Name is required.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onAdd(
      {
        id: uid("MT-"),
        ...(code ? { code } : {}),
        name,
        address: d.location.trim(),
        feeType: inferFeeType(name),
        price: 0,
        vehicleTollGroup: tollClassLabel(tollClass),
        passCount: 1,
        source: "Manual",
        reconciled: false,
      },
      leg,
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Toll</DialogTitle>
        <DialogDescription>Pick a toll from Toll Station, or enter a new one.</DialogDescription>
      </DialogHeader>
      {legs.length > 1 && (
        <Field label="Add to">
          <NativeSelect
            value={leg}
            onChange={(v) => setLeg(v as TollLeg)}
            options={legs}
            labels={{ Outbound: "Outbound", Return: "Return Trip" }}
          />
        </Field>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "new")}>
        <TabsList>
          <TabsTrigger value="list">From Toll Station</TabsTrigger>
          <TabsTrigger value="new">New toll</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code, name, road..."
              className="pl-9"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No toll found. Use “New toll” to create one.
              </p>
            )}
            {shown.map((g) => {
              const added = existingIds.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={added}
                  onClick={() => setPick(g.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent disabled:cursor-default disabled:opacity-50",
                    pick === g.id && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-primary">{g.code}</span> · {g.name}
                    <span className="block truncate text-xs text-muted-foreground">
                      {[g.road, g.province].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  {added ? (
                    <span className="text-xs text-muted-foreground">Added</span>
                  ) : (
                    pick === g.id && <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={!pick} onClick={addPicked}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="new" className="mt-3">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Toll Code" error={errors["code"]}>
              <Input
                value={d.code}
                onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Location">
              <Input
                value={d.location}
                placeholder="e.g. Đồng Nai"
                onChange={(e) => setD({ ...d, location: e.target.value })}
              />
            </Field>
            <Field label="Toll Name" required error={errors["name"]} className="col-span-2">
              <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The new toll is added to this route only — it is not saved to Toll Station.
          </p>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={addNew}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </DialogFooter>
        </TabsContent>
      </Tabs>
    </>
  );
}
