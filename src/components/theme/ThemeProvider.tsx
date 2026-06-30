"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type ThemeMode = "light" | "dark";
export type ThemeAccent = "teal" | "blue" | "coral" | "amber" | "purple" | "green";
export type UiFontFamily = "inter" | "nunito" | "atkinson" | "open_sans" | "poppins";
export type UiFontScale = "small" | "default" | "large" | "extra_large";

type ThemeContextValue = {
  theme: ThemeMode;
  accent: ThemeAccent;
  fontFamily: UiFontFamily;
  fontScale: UiFontScale;
  saveAppearance: (theme: ThemeMode, accent: ThemeAccent) => Promise<void>;
  saveTypography: (fontFamily: UiFontFamily, fontScale: UiFontScale) => Promise<void>;
};

const storageKey = "projeto-escola-theme";
const accentStorageKey = "projeto-escola-theme-accent";
const fontFamilyStorageKey = "projeto-escola-ui-font-family";
const fontScaleStorageKey = "projeto-escola-ui-font-scale";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const accentPalettes: Record<ThemeAccent, { color: string; hover: string; lightTint: string; darkTint: string }> = {
  teal: { color: "0 179 175", hover: "0 157 153", lightTint: "220 247 244", darkTint: "16 58 61" },
  blue: { color: "47 128 237", hover: "35 105 202", lightTint: "226 238 255", darkTint: "20 43 78" },
  coral: { color: "255 79 100", hover: "224 58 79", lightTint: "255 230 234", darkTint: "75 30 43" },
  amber: { color: "201 129 23", hover: "172 105 12", lightTint: "255 241 215", darkTint: "69 47 20" },
  purple: { color: "126 87 194", hover: "102 69 163", lightTint: "239 232 252", darkTint: "49 35 76" },
  green: { color: "47 125 88", hover: "38 102 71", lightTint: "220 239 231", darkTint: "20 53 58" }
};
const fontFamilies: Record<UiFontFamily, string> = {
  inter: '"Inter", Arial, sans-serif',
  nunito: '"Nunito", Arial, sans-serif',
  atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
  open_sans: '"Open Sans", Arial, sans-serif',
  poppins: '"Poppins", Arial, sans-serif'
};
const fontScales: Record<UiFontScale, number> = {
  small: 0.95,
  default: 1,
  large: 1.1,
  extra_large: 1.2
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<ThemeAccent>("teal");
  const [fontFamily, setFontFamilyState] = useState<UiFontFamily>("inter");
  const [fontScale, setFontScaleState] = useState<UiFontScale>("default");
  const syncedProfileId = useRef<string | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    const savedAccent = window.localStorage.getItem(accentStorageKey);
    const savedFontFamily = window.localStorage.getItem(fontFamilyStorageKey);
    const savedFontScale = window.localStorage.getItem(fontScaleStorageKey);
    if (savedTheme === "dark" || savedTheme === "light") {
      setThemeState(savedTheme);
    }
    if (isThemeAccent(savedAccent)) {
      setAccentState(savedAccent);
    }
    if (isUiFontFamily(savedFontFamily)) setFontFamilyState(savedFontFamily);
    if (isUiFontScale(savedFontScale)) setFontScaleState(savedFontScale);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && isThemeMode(event.newValue)) {
        setThemeState(event.newValue);
      }
      if (event.key === accentStorageKey && isThemeAccent(event.newValue)) {
        setAccentState(event.newValue);
      }
      if (event.key === fontFamilyStorageKey && isUiFontFamily(event.newValue)) setFontFamilyState(event.newValue);
      if (event.key === fontScaleStorageKey && isUiFontScale(event.newValue)) setFontScaleState(event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const profileId = getProfileId(profile);
    if (!profileId) {
      syncedProfileId.current = null;
      return;
    }
    if (syncedProfileId.current === profileId) return;

    const profileTheme = getProfileThemePreference(profile);
    const profileAccent = getProfileThemeAccent(profile);
    const profileFontFamily = getProfileFontFamily(profile);
    const profileFontScale = getProfileFontScale(profile);
    if (profileTheme) {
      setThemeState((current) => (current === profileTheme ? current : profileTheme));
    }
    if (profileAccent) {
      setAccentState((current) => (current === profileAccent ? current : profileAccent));
    }
    if (profileFontFamily) setFontFamilyState(profileFontFamily);
    if (profileFontScale) setFontScaleState(profileFontScale);
    syncedProfileId.current = profileId;
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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontFamily = fontFamily;
    root.dataset.fontScale = fontScale;
    root.style.setProperty("--ui-font-family", fontFamilies[fontFamily]);
    root.style.setProperty("--ui-font-scale", String(fontScales[fontScale]));
    root.style.setProperty("--ui-root-font-size", `${16 * fontScales[fontScale]}px`);
    window.localStorage.setItem(fontFamilyStorageKey, fontFamily);
    window.localStorage.setItem(fontScaleStorageKey, fontScale);
  }, [fontFamily, fontScale]);

  const saveAppearance = useCallback(
    async (nextTheme: ThemeMode, nextAccent: ThemeAccent) => {
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ theme_preference: nextTheme, theme_accent: nextAccent })
          .eq("id", user.id);
        if (error) throw error;
      }

      setThemeState(nextTheme);
      setAccentState(nextAccent);
      window.localStorage.setItem(storageKey, nextTheme);
      window.localStorage.setItem(accentStorageKey, nextAccent);
    },
    [supabase, user]
  );

  const saveTypography = useCallback(
    async (nextFontFamily: UiFontFamily, nextFontScale: UiFontScale) => {
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ ui_font_family: nextFontFamily, ui_font_scale: nextFontScale })
          .eq("id", user.id);
        if (error) throw error;
      }

      setFontFamilyState(nextFontFamily);
      setFontScaleState(nextFontScale);
      window.localStorage.setItem(fontFamilyStorageKey, nextFontFamily);
      window.localStorage.setItem(fontScaleStorageKey, nextFontScale);
    },
    [supabase, user]
  );

  const value = useMemo(
    () => ({
      theme,
      accent,
      fontFamily,
      fontScale,
      saveAppearance,
      saveTypography
    }),
    [accent, fontFamily, fontScale, saveAppearance, saveTypography, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isThemeAccent(value: unknown): value is ThemeAccent {
  return value === "teal" || value === "blue" || value === "coral" || value === "amber" || value === "purple" || value === "green";
}

function isUiFontFamily(value: unknown): value is UiFontFamily {
  return value === "inter" || value === "nunito" || value === "atkinson" || value === "open_sans" || value === "poppins";
}

function isUiFontScale(value: unknown): value is UiFontScale {
  return value === "small" || value === "default" || value === "large" || value === "extra_large";
}

function getProfileThemePreference(profile: unknown): ThemeMode | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { theme_preference?: unknown }).theme_preference;
  return isThemeMode(value) ? value : null;
}

function getProfileId(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { id?: unknown }).id;
  return typeof value === "string" ? value : null;
}

function getProfileThemeAccent(profile: unknown): ThemeAccent | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { theme_accent?: unknown }).theme_accent;
  return isThemeAccent(value) ? value : null;
}

function getProfileFontFamily(profile: unknown): UiFontFamily | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { ui_font_family?: unknown }).ui_font_family;
  return isUiFontFamily(value) ? value : null;
}

function getProfileFontScale(profile: unknown): UiFontScale | null {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as { ui_font_scale?: unknown }).ui_font_scale;
  return isUiFontScale(value) ? value : null;
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
