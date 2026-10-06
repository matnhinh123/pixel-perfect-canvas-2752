import type { TemplateFieldDef, TemplateType } from "@/types";

const f = (
  key: string,
  label: string,
  coreMandatory: boolean,
  defaultVisible = true,
  defaultRequired = coreMandatory,
): TemplateFieldDef => ({ key, label, core: true, coreMandatory, defaultVisible, defaultRequired });

/** System-owned template structure. Tenants may only toggle Visible/Required on non-mandatory fields. */
export const TEMPLATE_FIELDS: Record<TemplateType, TemplateFieldDef[]> = {
  Trucking: [
    f("origin", "Origin", true),
    f("destination", "Destination", true),
    f("vehicleType", "Vehicle Type", false, true, true),
    f("containerSize", "Container Size", false),
    f("containerType", "Container Type", false),
  ],
  Customs: [
    f("customsDeclaration", "Customs Declaration", true),
    f("borderGate", "Border Gate", false),
    f("ieType", "Import / Export Type", true),
  ],
  Freight: [
    f("bl", "B/L", true),
    f("polPod", "POL / POD (or Airport Origin / Destination)", true),
    f("carrier", "Carrier / Airline", false),
  ],
};
