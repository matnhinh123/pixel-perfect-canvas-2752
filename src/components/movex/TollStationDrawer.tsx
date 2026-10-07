import { useState } from "react";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field, NativeSelect } from "@/components/movex/common";
import { FEE_TYPE_LABEL } from "@/components/movex/routing/RouteSections";
import { BusinessRuleError } from "@/services/crudService";
import {
  newTollStationDraft,
  tollStationService,
  validateTollStation,
  type TollStationDraft,
} from "@/services/tollStationService";
import type { TollGateRecord } from "@/mock-data/tollCatalog";
import type { FeeType } from "@/types";

/** Add / edit a toll station: location (for route matching) and price per vehicle class. */
export function TollStationDrawer({
  open,
  station,
  onClose,
}: {
  open: boolean;
  station: TollGateRecord | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[520px] flex-col overflow-y-auto sm:max-w-[520px]">
        {open && <StationForm key={station?.id ?? "new"} station={station} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function StationForm({
  station,
  onClose,
}: {
  station: TollGateRecord | null;
  onClose: () => void;
}) {
  const [d, setD] = useState<TollStationDraft>(() => {
    if (!station) return newTollStationDraft();
    const {
      id: _id,
      status: _s,
      deleted: _d,
      createdAt: _ca,
      createdBy: _cb,
      updatedAt: _ua,
      updatedBy: _ub,
      ...rest
    } = station;
    return rest;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof TollStationDraft>(k: K, v: TollStationDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

  const save = () => {
    const e = validateTollStation(d, station?.id);
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const saved = tollStationService.save(d, station?.id);
      toast.success(station ? `Đã lưu trạm ${saved.code}` : `Đã thêm trạm ${saved.code}`);
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      else toast.error("Lưu thất bại");
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{station ? "Sửa trạm thu phí" : "Thêm trạm thu phí"}</SheetTitle>
        <SheetDescription>
          Routing tự tính phí khi tuyến đi qua trạm (trong bán kính 1 km).
        </SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 grid-cols-2 content-start gap-4 px-4">
        <Field label="Mã trạm" required error={errors["code"]}>
          <Input value={d.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Loại phí">
          <NativeSelect
            value={d.feeType}
            onChange={(v) => set("feeType", v as FeeType)}
            options={["Toll", "Bridge", "Ferry"]}
            labels={FEE_TYPE_LABEL}
          />
        </Field>
        <Field label="Tên trạm" required error={errors["name"]} className="col-span-2">
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Tuyến đường">
          <Input value={d.road} onChange={(e) => set("road", e.target.value)} />
        </Field>
        <Field label="Tỉnh / Thành phố">
          <Input value={d.province} onChange={(e) => set("province", e.target.value)} />
        </Field>
        <Field label="Vĩ độ (lat)" required error={errors["lat"]}>
          <Input
            type="number"
            step="any"
            value={Number.isFinite(d.lat) ? d.lat : ""}
            onChange={(e) => set("lat", num(e.target.value))}
          />
        </Field>
        <Field label="Kinh độ (lng)" required error={errors["lng"]}>
          <Input
            type="number"
            step="any"
            value={Number.isFinite(d.lng) ? d.lng : ""}
            onChange={(e) => set("lng", num(e.target.value))}
          />
        </Field>
        <div className="col-span-2">
          <div className="mb-2 text-sm font-semibold">
            Giá vé theo nhóm xe (₫)
            {errors["prices"] && (
              <span className="ml-2 text-xs font-medium text-destructive">{errors["prices"]}</span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {d.prices.map((p, i) => (
              <Field key={i} label={`Nhóm ${i + 1}`}>
                <Input
                  type="number"
                  min={0}
                  value={Number.isFinite(p) ? p : ""}
                  onChange={(e) =>
                    set(
                      "prices",
                      d.prices.map((x, j) =>
                        j === i ? num(e.target.value) : x,
                      ) as TollStationDraft["prices"],
                    )
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button variant="outline" onClick={onClose}>
          <X className="h-4 w-4" />
          Huỷ
        </Button>
        <Button onClick={save}>
          <Save className="h-4 w-4" />
          Lưu
        </Button>
      </SheetFooter>
    </>
  );
}
