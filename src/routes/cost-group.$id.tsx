import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Cost Group links open the same record on the Cost screen. */
export const Route = createFileRoute("/cost-group/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/cost/$id", params: { id: params.id } });
  },
});
