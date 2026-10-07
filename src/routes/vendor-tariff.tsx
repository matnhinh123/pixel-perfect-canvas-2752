import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/vendor-tariff")({
  head: () => ({ meta: [{ title: "Vendor Tariff — MoveX" }] }),
  component: VendorTariffPage,
});

function VendorTariffPage() {
  const { t } = useT();
  return (
    <OutOfScope
      title="Vendor Tariff"
      description={t(
        "Bảng giá nhà cung cấp sẽ được làm ở giai đoạn sau.",
        "Vendor price lists will be built in a later phase.",
      )}
    />
  );
}
