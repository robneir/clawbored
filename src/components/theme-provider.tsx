"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { type Theme, themes, applyTheme, loadSavedTheme, saveTheme } from "@/lib/themes";

interface ThemeContextValue {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue>({
  currentTheme: themes[0],
  setTheme: () => {},
  themes,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]);

  useEffect(() => {
    const saved = loadSavedTheme();
    setCurrentTheme(saved);
    applyTheme(saved);
  }, []);

  const handleSetTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
    applyTheme(theme);
    saveTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme: handleSetTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}
