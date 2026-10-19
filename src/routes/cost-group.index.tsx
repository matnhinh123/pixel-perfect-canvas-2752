import { createFileRoute, redirect } from "@tanstack/react-router";

/** Cost Groups now live on the Cost screen (groups and their Cost Details in one tree). */
export const Route = createFileRoute("/cost-group/")({
  beforeLoad: () => {
    throw redirect({ to: "/cost" });
  },
});
