import { createFileRoute, redirect } from "@tanstack/react-router";

/** Cost Groups are now the Group Name of each Cost Detail: old links open the Cost list. */
export const Route = createFileRoute("/cost-group/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/cost" });
  },
});
