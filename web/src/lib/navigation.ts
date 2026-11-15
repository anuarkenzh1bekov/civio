import { useMemo } from "react";
import { useNavigate, useSearchParams as useRouterSearchParams } from "react-router";

/** Imperative navigation between the app's pages. */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (href: string) => void navigate(href),
    replace: (href: string) => void navigate(href, { replace: true }),
  }), [navigate]);
}

/** The current URL's query string. */
export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}
