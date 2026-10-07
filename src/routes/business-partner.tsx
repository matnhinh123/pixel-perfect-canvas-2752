import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/business-partner")({
  head: () => ({ meta: [{ title: "Business Partner — MoveX" }] }),
  component: BusinessPartnerPage,
});

function BusinessPartnerPage() {
  const { t } = useT();
  return (
    <OutOfScope
      title="Business Partner"
      description={t(
        "Danh mục khách hàng, nhà cung cấp, nhà xe… sẽ được làm ở giai đoạn sau.",
        "Customers, suppliers, carriers… will be built in a later phase.",
      )}
    />
  );
}
