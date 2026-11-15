import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router";
import { Providers } from "@/app/providers";

function Root() {
  return (
    <Providers>
      <Outlet />
      <ScrollRestoration />
    </Providers>
  );
}

/** One file per page under `app/`, loaded when its route is first opened. */
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    Component: Root,
    children: [
      { path: "/", lazy: page(() => import("@/app/page")) },
      { path: "/onboarding", lazy: page(() => import("@/app/onboarding/page")) },
      { path: "/onboarding/details", lazy: page(() => import("@/app/onboarding/details/page")) },
      { path: "/dashboard", lazy: page(() => import("@/app/dashboard/page")) },
      { path: "/documents", lazy: page(() => import("@/app/documents/page")) },
      { path: "/compare", lazy: page(() => import("@/app/compare/page")) },
    ],
  },
]);
