import type { TemplateFieldDef, TemplateType } from "@/types";

const f = (
  key: string,
  label: string,
  coreMandatory: boolean,
  defaultVisible = true,
  defaultRequired = coreMandatory,
): TemplateFieldDef => ({ key, label, core: true, coreMandatory, defaultVisible, defaultRequired });

/** System-owned form structure. Tenants may only toggle Visible/Required on fields that are not locked. */
export const TEMPLATE_FIELDS: Record<TemplateType, TemplateFieldDef[]> = {
  Trucking: [
    f("origin", "Điểm đi", true),
    f("destination", "Điểm đến", true),
    f("vehicleType", "Loại xe", false, true, true),
    f("containerSize", "Kích thước container", false),
    f("containerType", "Loại container", false),
    f("note", "Ghi chú", false),
  ],
  Customs: [
    f("customsDeclaration", "Tờ khai", true),
    f("borderGate", "Cửa khẩu", false),
    f("ieType", "Loại hình Xuất / Nhập", true),
    f("note", "Ghi chú", false),
  ],
  Freight: [
    f("bl", "B/L", true),
    f("origin", "Điểm đi", true),
    f("destination", "Điểm đến", true),
    f("carrier", "Carrier / Airline", false),
    f("note", "Ghi chú", false),
  ],
};

/** UI name of a form: "Trucking Form". */
export const formName = (t: TemplateType | null | undefined) => (t ? `${t} Form` : "—");
