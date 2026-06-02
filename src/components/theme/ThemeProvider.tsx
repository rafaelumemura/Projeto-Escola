"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

const storageKey = "projeto-escola-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user, refreshProfile } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (savedTheme === "dark" || savedTheme === "light") {
      setThemeState(savedTheme);
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && isThemeMode(event.newValue)) {
        setThemeState(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const profileTheme = getProfileThemePreference(profile);
    if (profileTheme) {
      setThemeState((current) => (current === profileTheme ? current : profileTheme));
    }
  }, [profile]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(storageKey, theme);
    updateThemeAssets(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      setThemeState(nextTheme);
      window.localStorage.setItem(storageKey, nextTheme);

      const profileTheme = getProfileThemePreference(profile);
      if (user && profileTheme !== nextTheme) {
        void saveThemePreference(supabase, user.id, nextTheme, refreshProfile);
      }
    },
    [profile, refreshProfile, supabase, user]
  );

  const value = useMemo(
    () => ({
      theme,
      setTheme
    }),
    [setTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getProfileThemePreference(profile: unknown): ThemeMode | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { theme_preference?: unknown }).theme_preference;
  return isThemeMode(value) ? value : null;
}

async function saveThemePreference(
  supabase: ReturnType<typeof useAuth>["supabase"],
  userId: string,
  theme: ThemeMode,
  refreshProfile: () => Promise<void>
) {
  try {
    const { error } = await supabase.from("profiles").update({ theme_preference: theme }).eq("id", userId);
    if (!error) {
      await refreshProfile();
    }
  } catch {
    // The local theme still changes even if the remote preference is not available yet.
  }
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  }

  return context;
}

function updateThemeAssets(theme: ThemeMode) {
  const faviconHref = "/simbolo.webp";
  const themeColor = theme === "dark" ? "#070d1b" : "#2f7d58";
  const icons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  icons.forEach((icon) => {
    icon.href = faviconHref;
  });

  if (metaTheme) {
    metaTheme.content = themeColor;
  }
}
