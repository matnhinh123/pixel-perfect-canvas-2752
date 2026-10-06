import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/business-partner")({
  head: () => ({ meta: [{ title: "Business Partner — MoveX" }] }),
  component: () => (
    <OutOfScope
      title="Business Partner"
      description="Danh mục khách hàng, nhà cung cấp, nhà xe… sẽ được làm ở giai đoạn sau."
    />
  ),
});
