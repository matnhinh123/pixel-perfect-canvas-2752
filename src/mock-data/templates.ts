import type { TemplateFieldDef, TemplateType } from "@/types";

const f = (
  key: string,
  label: string,
  labelEn: string,
  coreMandatory: boolean,
  defaultVisible = true,
  defaultRequired = coreMandatory,
): TemplateFieldDef => ({
  key,
  label,
  labelEn,
  core: true,
  coreMandatory,
  defaultVisible,
  defaultRequired,
});

/** System-owned form structure. Tenants may only toggle Visible/Required on fields that are not locked. */
export const TEMPLATE_FIELDS: Record<TemplateType, TemplateFieldDef[]> = {
  Trucking: [
    f("origin", "Điểm đi", "Origin", true),
    f("destination", "Điểm đến", "Destination", true),
    f("vehicleType", "Loại xe", "Vehicle Type", false, true, true),
    f("containerSize", "Kích thước container", "Container Size", false),
    f("containerType", "Loại container", "Container Type", false),
    f("note", "Ghi chú", "Notes", false),
  ],
  Customs: [
    f("customsDeclaration", "Tờ khai", "Customs Declaration", true),
    f("borderGate", "Cửa khẩu", "Border Gate", false),
    f("ieType", "Loại hình Xuất / Nhập", "Export / Import Type", true),
    f("note", "Ghi chú", "Notes", false),
  ],
  Freight: [
    f("bl", "B/L", "B/L", true),
    f("origin", "Điểm đi", "Origin", true),
    f("destination", "Điểm đến", "Destination", true),
    f("carrier", "Carrier / Airline", "Carrier / Airline", false),
    f("note", "Ghi chú", "Notes", false),
  ],
  Warehouse: [
    f("warehouse", "Kho", "Warehouse", true),
    f("ioType", "Loại Nhập / Xuất kho", "Inbound / Outbound", true),
    f("cargoType", "Loại hàng", "Cargo Type", false),
    f("quantity", "Số lượng", "Quantity", false, true, true),
    f("storageDays", "Số ngày lưu kho", "Storage Days", false),
    f("note", "Ghi chú", "Notes", false),
  ],
};

/** UI name of a form: "Trucking Form". */
export const formName = (t: TemplateType | null | undefined) => (t ? `${t} Form` : "—");
