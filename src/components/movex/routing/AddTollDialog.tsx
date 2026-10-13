import { CC } from "@/mock-data/commonCodes";
import { useCodeOptions, withCurrent } from "@/services/commonCodeService";
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
import { FEE_TYPE_LABEL } from "./RouteSections";
import { useT } from "@/lib/i18n";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import { activeTollGates } from "@/services/routing/tollGates";
import { tollClassLabel } from "@/services/routing/RouteProvider";
import { uid } from "@/repositories";
import { FEE_TYPES, type FeeType, type TollStation } from "@/types";
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
  roundTrip,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Toll class index (0..4) of the route's vehicle. */
  tollClass: number;
  /** Tolls already on each direction — shown as added for the chosen direction. */
  existingIds: Record<TollLeg, Set<string>>;
  /** The Return direction exists only on a Round Trip. */
  roundTrip: boolean;
  onAdd: (toll: TollStation, leg: TollLeg) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {open && (
          <AddTollBody
            tollClass={tollClass}
            existingIds={existingIds}
            roundTrip={roundTrip}
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
  roundTrip,
  onAdd,
  onCancel,
}: {
  tollClass: number;
  existingIds: Record<TollLeg, Set<string>>;
  roundTrip: boolean;
  onAdd: (toll: TollStation, leg: TollLeg) => void;
  onCancel: () => void;
}) {
  const feeTypes = useCodeOptions(CC.ROUTE_FEE_TYPE, FEE_TYPES);
  const { t } = useT();
  const [tab, setTab] = useState<"list" | "new">("list");
  const [leg, setLeg] = useState<TollLeg>("Outbound");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [d, setD] = useState({ code: "", name: "", location: "" });
  // Fee Type and Price apply to this route only (a picked station is pre-filled from the master).
  const [fee, setFee] = useState<{ feeType: FeeType; price: string }>({
    feeType: "Toll",
    price: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gates = useMemo(() => activeTollGates(), []);
  const shown = gates.filter((g) => {
    const s = q.trim().toLowerCase();
    return !s || [g.code, g.name, g.road, g.province].some((x) => x.toLowerCase().includes(s));
  });

  const choose = (g: TollGateRecord) => {
    setPick(g.id);
    setFee({ feeType: g.feeType, price: String(g.prices[tollClass] ?? 0) });
    setErrors({});
  };
  const switchTab = (v: "list" | "new") => {
    setTab(v);
    setErrors({});
    // A new toll starts blank; going back to the list restores the picked station's values.
    const g = v === "list" ? gates.find((x) => x.id === pick) : undefined;
    setFee(
      g
        ? { feeType: g.feeType, price: String(g.prices[tollClass] ?? 0) }
        : { feeType: "Toll", price: "" },
    );
  };

  /** Price in VND: required, a whole number ≥ 0. Null (with the error set) when invalid. */
  const priceOf = (e: Record<string, string>): number | null => {
    const s = fee.price.trim().replace(/[\s,.]/g, "");
    const n = Number(s);
    if (!s) e["price"] = t("Nhập giá.", "Price is required.");
    else if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))
      e["price"] = t("Giá phải là số nguyên ≥ 0.", "Price must be a whole number ≥ 0.");
    return e["price"] ? null : n;
  };

  const addPicked = () => {
    const g = gates.find((x) => x.id === pick);
    if (!g) return;
    const e: Record<string, string> = {};
    const price = priceOf(e);
    setErrors(e);
    if (price === null) return;
    onAdd({ ...toRouteToll(g, tollClass), feeType: fee.feeType, price }, leg);
  };

  /** A manual toll lives on this route only — it is not added to Toll Station master. */
  const addNew = () => {
    const code = d.code.trim().toUpperCase();
    const name = d.name.trim();
    const e: Record<string, string> = {};
    if (code && !/^[A-Z0-9._-]{1,30}$/.test(code)) e["code"] = "Use A–Z, 0–9, . - _ (max 30).";
    if (!name) e["name"] = "Toll Name is required.";
    const price = priceOf(e);
    setErrors(e);
    if (Object.keys(e).length || price === null) return;
    onAdd(
      {
        id: uid("MT-"),
        ...(code ? { code } : {}),
        name,
        address: d.location.trim(),
        feeType: fee.feeType,
        price,
        vehicleTollGroup: tollClassLabel(tollClass),
        passCount: 1,
        source: "Manual",
        reconciled: false,
      },
      leg,
    );
  };

  const feeFields = (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Fee Type" required>
        <NativeSelect
          value={fee.feeType}
          onChange={(v) => setFee((f) => ({ ...f, feeType: v as FeeType }))}
          options={withCurrent(feeTypes, fee.feeType)}
          labels={FEE_TYPE_LABEL}
        />
      </Field>
      <Field label={t("Giá (₫)", "Price (₫)")} required error={errors["price"]}>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={fee.price}
            placeholder="0"
            className="pr-8 text-right"
            disabled={tab === "list" && !pick}
            onChange={(e) => {
              setFee((f) => ({ ...f, price: e.target.value }));
              if (errors["price"]) setErrors(({ price: _p, ...rest }) => rest);
            }}
            aria-invalid={!!errors["price"] || undefined}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            ₫
          </span>
        </div>
      </Field>
    </div>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Toll</DialogTitle>
        <DialogDescription>Pick a toll from Toll Station, or enter a new one.</DialogDescription>
      </DialogHeader>
      <Field label={t("Hướng đi", "Direction")} required>
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1" role="radiogroup">
          {(
            [
              ["Outbound", t("Chiều đi", "Outbound")],
              ["Return", t("Chiều về", "Return")],
            ] as [TollLeg, string][]
          ).map(([v, label]) => {
            const off = v === "Return" && !roundTrip;
            return (
              <label
                key={v}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  off ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                )}
                title={
                  off
                    ? t("Chỉ áp dụng cho Round Trip", "Only available for a Round Trip")
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="tollLeg"
                  checked={leg === v}
                  disabled={off}
                  onChange={() => {
                    setLeg(v);
                    // A station already on that direction can't be added there again.
                    setPick((p) => (p && existingIds[v].has(p) ? null : p));
                  }}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className={cn(leg === v && "font-medium text-primary")}>{label}</span>
              </label>
            );
          })}
        </div>
        {!roundTrip && (
          <span className="text-xs text-muted-foreground">
            {t(
              "Chiều về chỉ dùng được khi Route Type là Round Trip.",
              "Return is available only when the Route Type is Round Trip.",
            )}
          </span>
        )}
      </Field>
      <Tabs value={tab} onValueChange={(v) => switchTab(v as "list" | "new")}>
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
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No toll found. Use “New toll” to create one.
              </p>
            )}
            {shown.map((g) => {
              const added = existingIds[leg].has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={added}
                  onClick={() => choose(g)}
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
          <div className="mt-2">{feeFields}</div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Fee Type và Giá được lấy từ Toll Station theo nhóm xe của route; thay đổi ở đây chỉ áp dụng cho route này.",
              "Fee Type and Price come from Toll Station for the route's vehicle group; changes here apply to this route only.",
            )}
          </p>
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
          <div className="mt-4">{feeFields}</div>
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
