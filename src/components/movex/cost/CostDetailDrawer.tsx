import { CheckCircle2, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/movex/common";
import { useEntityActions } from "@/components/movex/general/useEntityActions";
import { costItemCrud, groupName, serviceName } from "@/services/costMasterService";
import type { CostGroupRecord, CostItemRecord } from "@/types";
import { InfoRow } from "./CostGroupDrawer";

/** Cost Edit is not part of this demo yet; one place for the message. */
export const costEditComingSoon = () => toast.info("Cost Edit is coming soon.");

/** Read-only Cost detail: Basic Information + Default Settings. */
export function CostDetailDrawer({
  cost,
  groups,
  onClose,
}: {
  cost: CostItemRecord | null;
  groups: CostGroupRecord[];
  onClose: () => void;
}) {
  const actions = useEntityActions(costItemCrud, "en");
  return (
    <Sheet open={!!cost} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[520px] flex-col overflow-y-auto sm:max-w-[520px]">
        {cost && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {cost.name}
                <StatusBadge status={cost.status} />
              </SheetTitle>
              <SheetDescription>{cost.code}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-5 px-4">
              <section>
                <h3 className="mb-3 border-b pb-1.5 text-sm font-semibold text-card-title">
                  Basic Information
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <InfoRow label="Cost Group">{groupName(cost.groupId, groups)}</InfoRow>
                  <InfoRow label="Cost Code">
                    <span className="font-semibold">{cost.code}</span>
                  </InfoRow>
                  <InfoRow label="Cost Name">{cost.name}</InfoRow>
                  <InfoRow label="Local Name">{cost.localName}</InfoRow>
                  <InfoRow label="Service">{serviceName(cost.serviceId)}</InfoRow>
                  <InfoRow label="Status">
                    <StatusBadge status={cost.status} />
                  </InfoRow>
                </dl>
              </section>
              <section>
                <h3 className="mb-3 border-b pb-1.5 text-sm font-semibold text-card-title">
                  Default Settings
                </h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <InfoRow label="Tax Evidence">{cost.taxEvidence}</InfoRow>
                  <InfoRow label="Currency">{cost.currency}</InfoRow>
                  <InfoRow label="Tax Tariff">{cost.taxTariff}</InfoRow>
                  <InfoRow label="UoM">{cost.uom}</InfoRow>
                  <div className="col-span-2">
                    <InfoRow label="Remark">{cost.remark}</InfoRow>
                  </div>
                </dl>
              </section>
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {cost.status === "Inactive" ? (
                <Button variant="outline" onClick={() => void actions.setStatus([cost], "Active")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Activate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void actions.setStatus([cost], "Inactive")}
                >
                  <XCircle className="h-4 w-4" />
                  Deactivate
                </Button>
              )}
              <Button onClick={costEditComingSoon}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
