import { Moon, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type ThemeMode = "light" | "dark";

type ThemeModeValue = { mode: ThemeMode; toggleMode: () => void };
const ThemeModeContext = createContext<ThemeModeValue | null>(null);
const STORAGE_KEY = "civio-theme";

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initialMode = saved === "light" || saved === "dark" ? saved : "light";
    setMode(initialMode);
    document.documentElement.dataset.theme = initialMode;
    document.documentElement.style.colorScheme = initialMode;
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [loaded, mode]);

  const toggleMode = () => {
    const nextMode = mode === "light" ? "dark" : "light";
    const root = document.documentElement;
    const applyMode = () => {
      root.dataset.theme = nextMode;
      root.style.colorScheme = nextMode;
      flushSync(() => setMode(nextMode));
    };

    if (document.startViewTransition) {
      root.classList.add("theme-view-transition");
      const transition = document.startViewTransition(applyMode);
      const cleanup = () => root.classList.remove("theme-view-transition");
      void transition.finished.then(cleanup, cleanup);
    } else {
      applyMode();
    }
  };

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const value = useContext(ThemeModeContext);
  if (!value) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return value;
}

export function ThemeToggle() {
  const { mode, toggleMode } = useThemeMode();
  const nextMode = mode === "light" ? "dark" : "light";
  const Icon = mode === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleMode}
      aria-label={`Switch to ${nextMode} mode`}
      title={`Switch to ${nextMode} mode`}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
