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
import { BusinessRuleError } from "@/services/crudService";
import { useT } from "@/lib/i18n";
import {
  feeTypeLabels,
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
  const { t } = useT();
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
      toast.success(
        station
          ? t(`Đã lưu trạm ${saved.code}`, `Saved station ${saved.code}`)
          : t(`Đã thêm trạm ${saved.code}`, `Added station ${saved.code}`),
      );
      onClose();
    } catch (err) {
      if (err instanceof BusinessRuleError) setErrors(err.fieldErrors);
      else toast.error(t("Lưu thất bại", "Save failed"));
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {station
            ? t("Sửa trạm thu phí", "Edit toll station")
            : t("Thêm trạm thu phí", "Add toll station")}
        </SheetTitle>
        <SheetDescription>
          {t(
            "Routing tự tính phí khi tuyến đi qua trạm (trong bán kính 1 km).",
            "Routing adds the fee automatically when a route passes the station (within 1 km).",
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 grid-cols-2 content-start gap-4 px-4">
        <Field label={t("Mã trạm", "Station code")} required error={errors["code"]}>
          <Input value={d.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label={t("Loại phí", "Fee type")}>
          <NativeSelect
            value={d.feeType}
            onChange={(v) => set("feeType", v as FeeType)}
            options={["Toll", "Bridge", "Ferry"]}
            labels={feeTypeLabels(t)}
          />
        </Field>
        <Field
          label={t("Tên trạm", "Station name")}
          required
          error={errors["name"]}
          className="col-span-2"
        >
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label={t("Tuyến đường", "Road")}>
          <Input value={d.road} onChange={(e) => set("road", e.target.value)} />
        </Field>
        <Field label={t("Tỉnh / Thành phố", "Province / City")}>
          <Input value={d.province} onChange={(e) => set("province", e.target.value)} />
        </Field>
        <Field label={t("Vĩ độ (lat)", "Latitude (lat)")} required error={errors["lat"]}>
          <Input
            type="number"
            step="any"
            value={Number.isFinite(d.lat) ? d.lat : ""}
            onChange={(e) => set("lat", num(e.target.value))}
          />
        </Field>
        <Field label={t("Kinh độ (lng)", "Longitude (lng)")} required error={errors["lng"]}>
          <Input
            type="number"
            step="any"
            value={Number.isFinite(d.lng) ? d.lng : ""}
            onChange={(e) => set("lng", num(e.target.value))}
          />
        </Field>
        <div className="col-span-2">
          <div className="mb-2 text-sm font-semibold">
            {t("Giá vé theo nhóm xe (₫)", "Price by vehicle class (₫)")}
            {errors["prices"] && (
              <span className="ml-2 text-xs font-medium text-destructive">{errors["prices"]}</span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {d.prices.map((p, i) => (
              <Field key={i} label={t(`Nhóm ${i + 1}`, `Class ${i + 1}`)}>
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
          {t("Huỷ", "Cancel")}
        </Button>
        <Button onClick={save}>
          <Save className="h-4 w-4" />
          {t("Lưu", "Save")}
        </Button>
      </SheetFooter>
    </>
  );
}
