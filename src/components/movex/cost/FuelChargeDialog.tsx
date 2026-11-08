// COGS › Variable Cost › Fuel Charge: why the fuel of the trip costs what it does (Fuel Rate × distance
// = fuel used, × Fuel Price = amount), with the Fuel Price editable for this COGS only (the Fuel Cost
// keeps its price). Amounts are in VND (the form edits in VND).
import { useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/movex/general/MoneyInput";
import { CurrencyTag } from "@/components/movex/general/Amount";
import { fuelCostOf } from "@/services/cost/salaryRange";
import { formatNumber } from "@/lib/format";

export interface FuelChargeInfo {
  fareCode: string;
  /** The Fuel Cost the line reads: code, name, fuel type, unit (liter…) and its price. */
  code: string;
  name: string;
  fuelType: string;
  unit: string;
  price: number;
  /** Fuel Rate per 100 km: K1 empty, K2 loaded, Estimate (K1 + K2) ÷ 2. */
  k1: number;
  k2: number;
  rate: number;
  /** "set in Fuel Cost" or "average of N vehicles". */
  rateSource: string;
  /** Distance of the route (km). */
  km: number;
  /** Amount of the line now (edited or not), and as worked out from the Fuel Cost. */
  amount: number;
  calculated: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function Row({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_9rem_1fr] items-start gap-2 border-b py-2.5 last:border-b-0">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function FuelChargeDialog({
  info,
  onClose,
  onApply,
}: {
  info: FuelChargeInfo;
  onClose: () => void;
  /** The new amount of the line (its calculated amount: back to the Fuel Cost's price). */
  onApply: (amount: number) => void;
}) {
  const litres = (info.km * info.rate) / 100;
  // Edited before: the price that amount stands for; else the Fuel Cost's price.
  const [price, setPrice] = useState(() =>
    info.amount !== info.calculated && litres > 0 ? Math.round(info.amount / litres) : info.price,
  );
  const amount = fuelCostOf(info.km, info.rate, price);
  const changed = price !== info.price;
  const unit = info.unit;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Fuel Charge · {info.fareCode}</DialogTitle>
          <DialogDescription>
            How the fuel of this trip is worked out. The Fuel Price can be changed for this COGS.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border px-3">
          <Row n={1} label="Fuel Cost">
            <span className="font-medium">{info.code}</span> · {info.name}
            <div className="text-xs text-muted-foreground">Fuel Type {info.fuelType}</div>
          </Row>
          <Row n={2} label="Fuel Rate">
            {info.k1 === info.k2 ? (
              <span className="tabular-nums">
                {info.rate} {unit} / 100 km
              </span>
            ) : (
              <span className="tabular-nums">
                Estimate (K1 {info.k1} + K2 {info.k2}) ÷ 2 ={" "}
                <b>
                  {info.rate} {unit} / 100 km
                </b>
              </span>
            )}
            <div className="text-xs text-muted-foreground">
              K1 running empty · K2 running loaded · {info.rateSource}
            </div>
          </Row>
          <Row n={3} label="Distance">
            <span className="tabular-nums">{formatNumber(info.km)} km</span>
            <div className="text-xs text-muted-foreground">Of the route (Route Management)</div>
          </Row>
          <Row n={4} label="Fuel used">
            <span className="tabular-nums">
              {formatNumber(info.km)} km × {info.rate} ÷ 100 ={" "}
              <b>
                {formatNumber(round1(litres))} {unit}
              </b>
            </span>
          </Row>
          <Row n={5} label={`Fuel Price / ${unit}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <MoneyInput
                autoFocus
                value={price}
                suffix="VND"
                onChange={(v) => setPrice(Number.isFinite(v) && v > 0 ? v : 0)}
                className="h-9 w-36 text-right tabular-nums"
                aria-label={`Fuel Price per ${unit}`}
              />
              {changed && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={() => setPrice(info.price)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Back to {formatNumber(info.price)} VND
                </button>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {changed
                ? `This COGS only — Fuel Cost ${info.code} keeps ${formatNumber(info.price)} VND / ${unit}.`
                : `The price of Fuel Cost ${info.code}.`}
            </div>
          </Row>
        </div>

        {/* The result: what the line will hold. */}
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <div className="font-semibold text-primary">Fuel Charge / Trip</div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(round1(litres))} {unit} × {formatNumber(price)} VND
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums text-primary">
              {formatNumber(amount)}
              <CurrencyTag cur="VND" />
            </div>
            {amount !== info.calculated && (
              <div className="text-[11px] tabular-nums text-muted-foreground">
                at the Fuel Cost's price: {formatNumber(info.calculated)} VND
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!(price > 0)}
            onClick={() => {
              onApply(changed ? amount : info.calculated);
              onClose();
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
