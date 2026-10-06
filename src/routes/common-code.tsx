import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";

export const Route = createFileRoute("/common-code")({
  head: () => ({ meta: [{ title: "Common Code — MoveX" }] }),
  component: () => (
    <OutOfScope
      title="Common Code"
      description="Danh mục mã dùng chung sẽ được làm ở giai đoạn sau."
    />
  ),
});
