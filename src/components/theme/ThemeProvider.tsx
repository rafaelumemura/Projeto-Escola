"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type ThemeMode = "light" | "dark";
export type ThemeAccent = "teal" | "blue" | "coral" | "amber" | "purple" | "green";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  accent: ThemeAccent;
  setAccent: (accent: ThemeAccent) => void;
};

const storageKey = "projeto-escola-theme";
const accentStorageKey = "projeto-escola-theme-accent";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const accentPalettes: Record<ThemeAccent, { color: string; hover: string; lightTint: string; darkTint: string }> = {
  teal: { color: "0 179 175", hover: "0 157 153", lightTint: "220 247 244", darkTint: "16 58 61" },
  blue: { color: "47 128 237", hover: "35 105 202", lightTint: "226 238 255", darkTint: "20 43 78" },
  coral: { color: "255 79 100", hover: "224 58 79", lightTint: "255 230 234", darkTint: "75 30 43" },
  amber: { color: "201 129 23", hover: "172 105 12", lightTint: "255 241 215", darkTint: "69 47 20" },
  purple: { color: "126 87 194", hover: "102 69 163", lightTint: "239 232 252", darkTint: "49 35 76" },
  green: { color: "47 125 88", hover: "38 102 71", lightTint: "220 239 231", darkTint: "20 53 58" }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user, refreshProfile } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<ThemeAccent>("teal");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    const savedAccent = window.localStorage.getItem(accentStorageKey);
    if (savedTheme === "dark" || savedTheme === "light") {
      setThemeState(savedTheme);
    }
    if (isThemeAccent(savedAccent)) {
      setAccentState(savedAccent);
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && isThemeMode(event.newValue)) {
        setThemeState(event.newValue);
      }
      if (event.key === accentStorageKey && isThemeAccent(event.newValue)) {
        setAccentState(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const profileTheme = getProfileThemePreference(profile);
    const profileAccent = getProfileThemeAccent(profile);
    if (profileTheme) {
      setThemeState((current) => (current === profileTheme ? current : profileTheme));
    }
    if (profileAccent) {
      setAccentState((current) => (current === profileAccent ? current : profileAccent));
    }
  }, [profile]);

  useEffect(() => {
    const palette = accentPalettes[accent];
    const root = document.documentElement;

    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.style.colorScheme = theme;
    root.style.setProperty("--color-leaf", palette.color);
    root.style.setProperty("--color-leaf-hover", palette.hover);
    root.style.setProperty("--color-mint", theme === "dark" ? palette.darkTint : palette.lightTint);
    window.localStorage.setItem(storageKey, theme);
    window.localStorage.setItem(accentStorageKey, accent);
    updateThemeAssets(theme, accent);
  }, [accent, theme]);

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

  const setAccent = useCallback(
    (nextAccent: ThemeAccent) => {
      setAccentState(nextAccent);
      window.localStorage.setItem(accentStorageKey, nextAccent);

      const profileAccent = getProfileThemeAccent(profile);
      if (user && profileAccent !== nextAccent) {
        void saveThemeAccent(supabase, user.id, nextAccent, refreshProfile);
      }
    },
    [profile, refreshProfile, supabase, user]
  );

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      accent,
      setAccent
    }),
    [accent, setAccent, setTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isThemeAccent(value: unknown): value is ThemeAccent {
  return value === "teal" || value === "blue" || value === "coral" || value === "amber" || value === "purple" || value === "green";
}

function getProfileThemePreference(profile: unknown): ThemeMode | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { theme_preference?: unknown }).theme_preference;
  return isThemeMode(value) ? value : null;
}

function getProfileThemeAccent(profile: unknown): ThemeAccent | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { theme_accent?: unknown }).theme_accent;
  return isThemeAccent(value) ? value : null;
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

async function saveThemeAccent(
  supabase: ReturnType<typeof useAuth>["supabase"],
  userId: string,
  accent: ThemeAccent,
  refreshProfile: () => Promise<void>
) {
  try {
    const { error } = await supabase.from("profiles").update({ theme_accent: accent }).eq("id", userId);
    if (!error) {
      await refreshProfile();
    }
  } catch {
    // The local accent still changes even if the remote preference is not available yet.
  }
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  }

  return context;
}

function updateThemeAssets(theme: ThemeMode, accent: ThemeAccent) {
  const faviconHref = "/simbolo.webp";
  const [red, green, blue] = accentPalettes[accent].color.split(" ");
  const themeColor = theme === "dark" ? "#070d1b" : `rgb(${red}, ${green}, ${blue})`;
  const icons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  icons.forEach((icon) => {
    icon.href = faviconHref;
  });

  if (metaTheme) {
    metaTheme.content = themeColor;
  }
}
