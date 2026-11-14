"use client";

import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import Link from "next/link";
import { ThemeModeProvider, useThemeMode } from "@/components/ThemeMode";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeProvider>
      <AppProviders>{children}</AppProviders>
    </ThemeModeProvider>
  );
}

/** Astryx theme, router-aware links and the toast layer for the whole app. */
function AppProviders({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <LinkProvider component={Link}>
        <ToastViewport position="bottomStart">{children}</ToastViewport>
      </LinkProvider>
    </Theme>
  );
}
