"use client";

import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import Link from "next/link";

/** Astryx theme, router-aware links and the toast layer for the whole app. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Civio's own surfaces are light or explicitly dark per screen, so the theme does not follow the OS.
    <Theme theme={neutralTheme} mode="light">
      <LinkProvider component={Link}>
        <ToastViewport position="bottomStart">{children}</ToastViewport>
      </LinkProvider>
    </Theme>
  );
}
