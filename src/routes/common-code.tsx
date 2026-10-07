import { createFileRoute } from "@tanstack/react-router";
import { OutOfScope } from "@/components/movex/OutOfScope";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/common-code")({
  head: () => ({ meta: [{ title: "Common Code — MoveX" }] }),
  component: CommonCodePage,
});

function CommonCodePage() {
  const { t } = useT();
  return (
    <OutOfScope
      title="Common Code"
      description={t(
        "Danh mục mã dùng chung sẽ được làm ở giai đoạn sau.",
        "Shared code lists will be built in a later phase.",
      )}
    />
  );
}
