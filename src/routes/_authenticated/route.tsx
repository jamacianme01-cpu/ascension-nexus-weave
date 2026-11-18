import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ascensionSession } from "@/lib/ascension/data/session.client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await ascensionSession.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
