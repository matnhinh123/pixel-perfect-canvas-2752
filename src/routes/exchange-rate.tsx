import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/exchange-rate")({
  head: () => ({ meta: [{ title: "Exchange Rate / UoM — MoveX" }] }),
  component: () => (
    <OutOfScope
      title="Exchange Rate / UoM"
      description="Tỷ giá và đơn vị tính sẽ được làm ở giai đoạn sau."
    />
  ),
});
