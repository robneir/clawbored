"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  type Theme,
  type FontPreset,
  type StylePreset,
  themes,
  fontPresets,
  stylePresets,
  applyTheme,
  loadSavedTheme,
  saveTheme,
  applyFontPreset,
  loadSavedFont,
  saveFontPreset,
  applyStylePreset,
  loadSavedStyle,
  saveStylePreset,
} from "@/lib/themes";

interface ThemeContextValue {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
  themes: Theme[];
  currentFont: FontPreset;
  setFont: (font: FontPreset) => void;
  fontPresets: FontPreset[];
  currentStyle: StylePreset;
  setStyle: (style: StylePreset) => void;
  stylePresets: StylePreset[];
}

const ThemeContext = createContext<ThemeContextValue>({
  currentTheme: themes[0],
  setTheme: () => {},
  themes,
  currentFont: fontPresets[0],
  setFont: () => {},
  fontPresets,
  currentStyle: stylePresets[0],
  setStyle: () => {},
  stylePresets,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]);
  const [currentFont, setCurrentFont] = useState<FontPreset>(fontPresets[0]);
  const [currentStyle, setCurrentStyle] = useState<StylePreset>(stylePresets[0]);

  useEffect(() => {
    const savedTheme = loadSavedTheme();
    setCurrentTheme(savedTheme);
    applyTheme(savedTheme);

    const savedFont = loadSavedFont();
    setCurrentFont(savedFont);
    applyFontPreset(savedFont);

    const savedStyle = loadSavedStyle();
    setCurrentStyle(savedStyle);
    // Apply style with theme context so surface/border opacity is correct
    applyStylePreset(savedStyle, savedTheme);
  }, []);

  const handleSetTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    applyTheme(theme);
    saveTheme(theme);
    // Re-apply style preset so surface/border opacity stays correct for new theme
    applyStylePreset(currentStyle, theme);
  }, [currentStyle]);

  const handleSetFont = useCallback((font: FontPreset) => {
    setCurrentFont(font);
    applyFontPreset(font);
    saveFontPreset(font);
  }, []);

  const handleSetStyle = useCallback((style: StylePreset) => {
    setCurrentStyle(style);
    applyStylePreset(style, currentTheme);
    saveStylePreset(style);
  }, [currentTheme]);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme: handleSetTheme,
        themes,
        currentFont,
        setFont: handleSetFont,
        fontPresets,
        currentStyle,
        setStyle: handleSetStyle,
        stylePresets,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
