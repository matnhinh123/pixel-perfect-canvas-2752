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
import {
  locationService,
  newLocationDraft,
  validateLocation,
  type LocationDraft,
} from "@/services/locationService";
import type { LocationMasterRecord } from "@/mock-data/locations";
import type { Status } from "@/types";
import { useT } from "@/lib/i18n";

/** Add / edit a location (code, name, address, province, coordinates, status). */
export function LocationDrawer({
  open,
  location,
  onClose,
}: {
  open: boolean;
  location: LocationMasterRecord | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-[520px] flex-col overflow-y-auto sm:max-w-[520px]">
        {open && <LocationForm key={location?.id ?? "new"} location={location} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function LocationForm({
  location,
  onClose,
}: {
  location: LocationMasterRecord | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const [d, setD] = useState<LocationDraft>(() =>
    location
      ? {
          code: location.code ?? location.id.replace(/^LOC-/, ""),
          name: location.name,
          address: location.address,
          province: location.province,
          lat: location.lat,
          lng: location.lng,
          status: location.status === "Active" ? "Active" : "Inactive",
        }
      : newLocationDraft(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof LocationDraft>(k: K, v: LocationDraft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });
  };
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

  const save = () => {
    const e = validateLocation(d, location?.id);
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const saved = locationService.save(d, location?.id);
      toast.success(
        location
          ? t(`Đã lưu địa điểm ${saved.code}`, `Location ${saved.code} saved`)
          : t(`Đã thêm địa điểm ${saved.code}`, `Location ${saved.code} added`),
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
          {location ? t("Sửa địa điểm", "Edit Location") : t("Thêm địa điểm", "Add Location")}
        </SheetTitle>
        <SheetDescription>
          {t(
            "Địa điểm Active dùng được ngay ở Routing (điểm đi, điểm dừng, điểm đến).",
            "Active locations can be picked right away in Routing (departure, stops, destination).",
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 grid-cols-2 content-start gap-4 px-4">
        <Field label={t("Mã địa điểm", "Location code")} required error={errors["code"]}>
          <Input
            value={d.code}
            placeholder={t("VD: KHO-BD", "e.g. WH-BD")}
            aria-invalid={!!errors["code"] || undefined}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t("Trạng thái", "Status")}>
          <NativeSelect
            value={d.status}
            onChange={(v) => set("status", v as Status)}
            options={["Active", "Inactive"]}
          />
        </Field>
        <Field
          label={t("Tên địa điểm", "Location name")}
          required
          error={errors["name"]}
          className="col-span-2"
        >
          <Input
            value={d.name}
            aria-invalid={!!errors["name"] || undefined}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label={t("Địa chỉ", "Address")} className="col-span-2">
          <Input value={d.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field
          label={t("Tỉnh / Thành phố", "Province / City")}
          required
          error={errors["province"]}
          className="col-span-2"
        >
          <Input
            value={d.province}
            aria-invalid={!!errors["province"] || undefined}
            onChange={(e) => set("province", e.target.value)}
          />
        </Field>
        <Field label={t("Vĩ độ", "Latitude")} required error={errors["lat"]}>
          <Input
            type="number"
            step="any"
            placeholder="10.8231"
            value={Number.isFinite(d.lat) ? d.lat : ""}
            aria-invalid={!!errors["lat"] || undefined}
            onChange={(e) => set("lat", num(e.target.value))}
          />
        </Field>
        <Field label={t("Kinh độ", "Longitude")} required error={errors["lng"]}>
          <Input
            type="number"
            step="any"
            placeholder="106.6297"
            value={Number.isFinite(d.lng) ? d.lng : ""}
            aria-invalid={!!errors["lng"] || undefined}
            onChange={(e) => set("lng", num(e.target.value))}
          />
        </Field>
        <p className="col-span-2 text-xs text-muted-foreground">
          {t(
            "Lấy toạ độ từ Google Maps: nhấp chuột phải vào điểm trên bản đồ, chọn dòng số đầu tiên để copy (vĩ độ, kinh độ).",
            "Get coordinates from Google Maps: right-click the spot and click the first line to copy (latitude, longitude).",
          )}
        </p>
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
