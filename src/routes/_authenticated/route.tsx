import { createFileRoute, Outlet } from "@tanstack/react-router";

// V1 public experience: do not depend on the removed external authentication client.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
