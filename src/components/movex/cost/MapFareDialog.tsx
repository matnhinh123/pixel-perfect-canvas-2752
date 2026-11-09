// Map one Fare Code to one or more Toll Fees at once (Variable Cost › Toll Fee).
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FareCodeInput, FareNameInput } from "@/components/movex/cost/FareCodeInput";
import { useFarePair } from "@/components/movex/cost/useFarePair";
import { BusinessRuleError } from "@/services/crudService";
import { tollFeeService } from "@/services/cost/tollFee";

export function MapFareDialog({
  ids,
  initial = "",
  open,
  onOpenChange,
  onDone,
}: {
  /** Toll Fees to map. */
  ids: readonly string[];
  /** Fare Code shown first (a single Toll Fee: its own). */
  initial?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const fare = useFarePair(code, (v) => {
    setCode(v);
    setError(null);
  });
  const apply = () => {
    try {
      const n = tollFeeService.mapFare(ids, code);
      toast.success(
        code.trim()
          ? `Fare Code ${code.trim().toUpperCase()} mapped to ${n} Toll Fee${n === 1 ? "" : "s"}`
          : `Fare Code removed from ${n} Toll Fee${n === 1 ? "" : "s"}`,
      );
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof BusinessRuleError || e instanceof Error ? e.message : "Mapping failed");
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setCode(initial);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Map Fare Code</DialogTitle>
          <DialogDescription>
            {ids.length === 1
              ? "The Fare Code the toll stations of this route are booked to in a COGS."
              : `One Fare Code for the ${ids.length} Toll Fees picked. Left empty: their Fare Code is removed.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Fare Code</label>
            <FareCodeInput pair={fare} invalid={!!error} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Fare Name</label>
            <FareNameInput pair={fare} invalid={!!error} />
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
