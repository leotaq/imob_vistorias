"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "themePreference";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return null;
  } catch {
    return null;
  }
}

function readDocumentTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const current = document.documentElement.dataset.theme;
  if (current === "light" || current === "dark") return current;
  return null;
}

function resolveInitialTheme(): Theme {
  return readDocumentTheme() ?? readStoredTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.classList.toggle("dark", theme === "dark");
  html.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Intencional: segue funcionando mesmo sem storage.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setThemeSafe = useCallback((next: Theme) => {
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return () => {};

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = readStoredTheme();
      if (!next) return;
      setThemeSafe(next);
    };
    const onSystemChange = () => {
      const stored = readStoredTheme();
      if (stored) return;
      const next = getSystemTheme();
      setThemeSafe(next);
    };

    window.addEventListener("storage", onStorage);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemChange);
    } else {
      media.addListener(onSystemChange);
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onSystemChange);
      } else {
        media.removeListener(onSystemChange);
      }
    };
  }, [setThemeSafe]);

  const isDark = useMemo(() => theme === "dark", [theme]);

  return {
    theme,
    isDark,
    setTheme: setThemeSafe,
    toggleTheme: () => setThemeSafe(theme === "dark" ? "light" : "dark"),
  };
}
