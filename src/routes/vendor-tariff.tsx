import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/vendor-tariff")({
  head: () => ({ meta: [{ title: "Vendor Tariff — MoveX" }] }),
  component: () => (
    <OutOfScope
      title="Vendor Tariff"
      description="Bảng giá nhà cung cấp sẽ được làm ở giai đoạn sau."
    />
  ),
});
