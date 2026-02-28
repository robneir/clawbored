export interface Theme {
  name: string;
  label: string;
  bg: string;
  text: string;
  accent: string;
  accentHover: string;
  surface: string;
  surfaceHover: string;
  border: string;
  muted: string;
  sidebar: string;
  isLight?: boolean;
}

export const themes: Theme[] = [
  {
    name: "midnight",
    label: "Midnight",
    bg: "#09090b",
    text: "#fafafa",
    accent: "#6366f1",
    accentHover: "#818cf8",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.06)",
    muted: "#71717a",
    sidebar: "#0a0a0c",
  },
  {
    name: "obsidian",
    label: "Obsidian",
    bg: "#1a1a2e",
    text: "#e8e8f0",
    accent: "#7c3aed",
    accentHover: "#8b5cf6",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.08)",
    muted: "#8888a0",
    sidebar: "#141428",
  },
  {
    name: "nord",
    label: "Nord",
    bg: "#2e3440",
    text: "#eceff4",
    accent: "#88c0d0",
    accentHover: "#8fbcbb",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.07)",
    border: "rgba(255, 255, 255, 0.08)",
    muted: "#7b88a1",
    sidebar: "#272d38",
  },
  {
    name: "monokai",
    label: "Monokai",
    bg: "#272822",
    text: "#f8f8f2",
    accent: "#a6e22e",
    accentHover: "#b8f040",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.08)",
    muted: "#8f908a",
    sidebar: "#1e1f1a",
  },
  {
    name: "solarized-dark",
    label: "Solarized Dark",
    bg: "#002b36",
    text: "#fdf6e3",
    accent: "#2aa198",
    accentHover: "#35bdb4",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#839496",
    sidebar: "#002028",
  },
  {
    name: "rose-pine",
    label: "Rose Pine",
    bg: "#191724",
    text: "#e0def4",
    accent: "#eb6f92",
    accentHover: "#f0849e",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#908caa",
    sidebar: "#13111e",
  },
  {
    name: "catppuccin",
    label: "Catppuccin",
    bg: "#1e1e2e",
    text: "#cdd6f4",
    accent: "#b4befe",
    accentHover: "#c4ccff",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#7f849c",
    sidebar: "#181825",
  },
  {
    name: "ocean",
    label: "Ocean",
    bg: "#0d1b2a",
    text: "#e0e7ef",
    accent: "#0ea5e9",
    accentHover: "#38bdf8",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#6b8299",
    sidebar: "#091522",
  },
  {
    name: "ember",
    label: "Ember",
    bg: "#1c1917",
    text: "#fafaf9",
    accent: "#f97316",
    accentHover: "#fb923c",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#87827d",
    sidebar: "#151210",
  },
  {
    name: "frost",
    label: "Frost",
    bg: "#f8fafc",
    text: "#0f172a",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    surface: "rgba(0, 0, 0, 0.03)",
    surfaceHover: "rgba(0, 0, 0, 0.05)",
    border: "rgba(0, 0, 0, 0.08)",
    muted: "#64748b",
    sidebar: "#f1f5f9",
    isLight: true,
  },
];

export function getThemeByName(name: string): Theme {
  return themes.find((t) => t.name === name) || themes[0];
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--mc-bg", theme.bg);
  root.style.setProperty("--mc-text", theme.text);
  root.style.setProperty("--mc-accent", theme.accent);
  root.style.setProperty("--mc-accent-hover", theme.accentHover);
  root.style.setProperty("--mc-surface", theme.surface);
  root.style.setProperty("--mc-surface-hover", theme.surfaceHover);
  root.style.setProperty("--mc-border", theme.border);
  root.style.setProperty("--mc-muted", theme.muted);
  root.style.setProperty("--mc-sidebar", theme.sidebar);

  // Update shadcn CSS variables to match
  root.style.setProperty("--background", theme.bg);
  root.style.setProperty("--foreground", theme.text);
  root.style.setProperty("--card", theme.surface);
  root.style.setProperty("--card-foreground", theme.text);
  root.style.setProperty("--popover", theme.sidebar);
  root.style.setProperty("--popover-foreground", theme.text);
  root.style.setProperty("--primary", theme.text);
  root.style.setProperty("--primary-foreground", theme.bg);
  root.style.setProperty("--secondary", theme.surface);
  root.style.setProperty("--secondary-foreground", theme.text);
  root.style.setProperty("--muted", theme.surface);
  root.style.setProperty("--muted-foreground", theme.muted);
  root.style.setProperty("--accent", theme.surfaceHover);
  root.style.setProperty("--accent-foreground", theme.text);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--input", theme.border);
  root.style.setProperty("--sidebar", theme.sidebar);
  root.style.setProperty("--sidebar-foreground", theme.text);
  root.style.setProperty("--sidebar-primary", theme.text);
  root.style.setProperty("--sidebar-primary-foreground", theme.bg);
  root.style.setProperty("--sidebar-accent", theme.surface);
  root.style.setProperty("--sidebar-accent-foreground", theme.text);
  root.style.setProperty("--sidebar-border", theme.border);

  // Toggle light/dark class
  if (theme.isLight) {
    root.classList.remove("dark");
    root.classList.add("light");
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
  }
}

export function loadSavedTheme(): Theme {
  if (typeof window === "undefined") return themes[0];
  const saved = localStorage.getItem("mc-theme");
  if (saved) {
    const theme = themes.find((t) => t.name === saved);
    if (theme) return theme;
  }
  return themes[0];
}

export function saveTheme(theme: Theme) {
  localStorage.setItem("mc-theme", theme.name);
  // Also persist to API (fire-and-forget)
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: theme.name }),
  }).catch(() => {});
}
