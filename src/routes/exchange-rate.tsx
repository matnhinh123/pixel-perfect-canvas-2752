import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/exchange-rate")({
  head: () => ({ meta: [{ title: "Exchange Rate / UoM — MoveX" }] }),
  component: ExchangeRatePage,
});

function ExchangeRatePage() {
  const { t } = useT();
  return (
    <OutOfScope
      title="Exchange Rate / UoM"
      description={t(
        "Tỷ giá và đơn vị tính sẽ được làm ở giai đoạn sau.",
        "Exchange rates and units of measure will be built in a later phase.",
      )}
    />
  );
}
