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

export interface FontPreset {
  name: string;
  label: string;
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  googleFontsUrl?: string;
}

export interface StylePreset {
  name: string;
  label: string;
  radius: string;
  glassBlur: string;
  surfaceOpacity: number;
  borderOpacity: number;
  spacing: "compact" | "comfortable" | "spacious";
}

export const themes: Theme[] = [
  // ── Dark Themes ────────────────────────────────────────
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
    name: "dracula",
    label: "Dracula",
    bg: "#282a36",
    text: "#f8f8f2",
    accent: "#bd93f9",
    accentHover: "#caa8fc",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.08)",
    muted: "#6272a4",
    sidebar: "#21222c",
  },
  {
    name: "tokyo-night",
    label: "Tokyo Night",
    bg: "#1a1b26",
    text: "#c0caf5",
    accent: "#7aa2f7",
    accentHover: "#89b4fa",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.06)",
    muted: "#565f89",
    sidebar: "#16161e",
  },
  {
    name: "gruvbox",
    label: "Gruvbox",
    bg: "#1d2021",
    text: "#ebdbb2",
    accent: "#fabd2f",
    accentHover: "#fcd34d",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#928374",
    sidebar: "#171819",
  },
  {
    name: "synthwave",
    label: "Synthwave",
    bg: "#1b1025",
    text: "#f0e6ff",
    accent: "#ff7edb",
    accentHover: "#ff9ee5",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.08)",
    muted: "#8a6fad",
    sidebar: "#150c1e",
  },
  {
    name: "ayu-dark",
    label: "Ayu Dark",
    bg: "#0b0e14",
    text: "#bfbdb6",
    accent: "#e6b450",
    accentHover: "#f0c566",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.06)",
    muted: "#565b66",
    sidebar: "#080a0e",
  },
  {
    name: "evergreen",
    label: "Evergreen",
    bg: "#0f1a14",
    text: "#e0efe6",
    accent: "#34d399",
    accentHover: "#4ade80",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.06)",
    muted: "#6b8f7d",
    sidebar: "#0b140f",
  },
  {
    name: "slate",
    label: "Slate",
    bg: "#161b22",
    text: "#e6edf3",
    accent: "#58a6ff",
    accentHover: "#79c0ff",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#7d8590",
    sidebar: "#0d1117",
  },
  {
    name: "copper",
    label: "Copper",
    bg: "#1a1512",
    text: "#f5ede4",
    accent: "#d97706",
    accentHover: "#e69a2e",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    border: "rgba(255, 255, 255, 0.07)",
    muted: "#9c8b7a",
    sidebar: "#14100d",
  },
  // ── Light Themes ───────────────────────────────────────
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
  {
    name: "ivory",
    label: "Ivory",
    bg: "#fefcf7",
    text: "#1c1917",
    accent: "#b45309",
    accentHover: "#d97706",
    surface: "rgba(0, 0, 0, 0.03)",
    surfaceHover: "rgba(0, 0, 0, 0.05)",
    border: "rgba(0, 0, 0, 0.08)",
    muted: "#78716c",
    sidebar: "#f7f3ec",
    isLight: true,
  },
  {
    name: "paper",
    label: "Paper",
    bg: "#ffffff",
    text: "#18181b",
    accent: "#18181b",
    accentHover: "#3f3f46",
    surface: "rgba(0, 0, 0, 0.02)",
    surfaceHover: "rgba(0, 0, 0, 0.04)",
    border: "rgba(0, 0, 0, 0.06)",
    muted: "#71717a",
    sidebar: "#fafafa",
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

// ── Font Presets ───────────────────────────────────────────

export const fontPresets: FontPreset[] = [
  // ── Sans-Serif ─────────────────────────────────────────
  {
    name: "system",
    label: "System Default",
    bodyFont: '"Inter", system-ui, -apple-system, sans-serif',
    headingFont: '"Inter", system-ui, -apple-system, sans-serif',
    monoFont: '"Geist Mono", "SF Mono", "Fira Code", monospace',
  },
  {
    name: "geist",
    label: "Geist",
    bodyFont: '"Geist", system-ui, sans-serif',
    headingFont: '"Geist", system-ui, sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
  },
  {
    name: "ibm-plex",
    label: "IBM Plex",
    bodyFont: '"IBM Plex Sans", sans-serif',
    headingFont: '"IBM Plex Sans", sans-serif',
    monoFont: '"IBM Plex Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  },
  {
    name: "dm-sans",
    label: "DM Sans",
    bodyFont: '"DM Sans", sans-serif',
    headingFont: '"DM Sans", sans-serif',
    monoFont: '"DM Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap",
  },
  {
    name: "jakarta",
    label: "Jakarta",
    bodyFont: '"Plus Jakarta Sans", sans-serif',
    headingFont: '"Plus Jakarta Sans", sans-serif',
    monoFont: '"Geist Mono", "SF Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
  },
  {
    name: "satoshi",
    label: "Satoshi",
    bodyFont: '"Satoshi", "Inter", sans-serif',
    headingFont: '"Satoshi", "Inter", sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap",
  },
  {
    name: "manrope",
    label: "Manrope",
    bodyFont: '"Manrope", sans-serif',
    headingFont: '"Manrope", sans-serif',
    monoFont: '"Geist Mono", "SF Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap",
  },
  {
    name: "outfit",
    label: "Outfit",
    bodyFont: '"Outfit", sans-serif',
    headingFont: '"Outfit", sans-serif',
    monoFont: '"Geist Mono", "SF Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
  },
  {
    name: "sora",
    label: "Sora",
    bodyFont: '"Sora", sans-serif',
    headingFont: '"Sora", sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
  },
  {
    name: "work-sans",
    label: "Work Sans",
    bodyFont: '"Work Sans", sans-serif',
    headingFont: '"Work Sans", sans-serif',
    monoFont: '"Geist Mono", "SF Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap",
  },
  {
    name: "rubik",
    label: "Rubik",
    bodyFont: '"Rubik", sans-serif',
    headingFont: '"Rubik", sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap",
  },
  {
    name: "nunito",
    label: "Nunito",
    bodyFont: '"Nunito", sans-serif',
    headingFont: '"Nunito", sans-serif',
    monoFont: '"Geist Mono", "SF Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap",
  },
  {
    name: "archivo",
    label: "Archivo",
    bodyFont: '"Archivo", sans-serif',
    headingFont: '"Archivo", sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap",
  },
  {
    name: "lexend",
    label: "Lexend",
    bodyFont: '"Lexend", sans-serif',
    headingFont: '"Lexend", sans-serif',
    monoFont: '"Geist Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap",
  },
  {
    name: "red-hat",
    label: "Red Hat",
    bodyFont: '"Red Hat Display", sans-serif',
    headingFont: '"Red Hat Display", sans-serif',
    monoFont: '"Red Hat Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;500;600;700&family=Red+Hat+Mono:wght@400;500&display=swap",
  },
  {
    name: "source-sans",
    label: "Source Sans",
    bodyFont: '"Source Sans 3", sans-serif',
    headingFont: '"Source Sans 3", sans-serif',
    monoFont: '"Source Code Pro", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap",
  },
  {
    name: "fira-sans",
    label: "Fira Sans",
    bodyFont: '"Fira Sans", sans-serif',
    headingFont: '"Fira Sans", sans-serif',
    monoFont: '"Fira Code", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Fira+Sans:wght@400;500;600;700&display=swap",
  },
  // ── Geometric & Display ────────────────────────────────
  {
    name: "space-grotesk",
    label: "Space Grotesk",
    bodyFont: '"Space Grotesk", sans-serif',
    headingFont: '"Space Grotesk", sans-serif',
    monoFont: '"Space Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
  },
  // ── Monospace ──────────────────────────────────────────
  {
    name: "jetbrains",
    label: "JetBrains Mono",
    bodyFont: '"JetBrains Mono", monospace',
    headingFont: '"JetBrains Mono", monospace',
    monoFont: '"JetBrains Mono", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap",
  },
  {
    name: "inconsolata",
    label: "Inconsolata",
    bodyFont: '"Inconsolata", monospace',
    headingFont: '"Inconsolata", monospace',
    monoFont: '"Inconsolata", monospace',
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600;700&display=swap",
  },
];

// ── Style Presets ──────────────────────────────────────────

export const stylePresets: StylePreset[] = [
  // ── Core styles ────────────────────────────────────────
  {
    name: "glass",
    label: "Glass",
    radius: "16px",
    glassBlur: "24px",
    surfaceOpacity: 0.03,
    borderOpacity: 0.06,
    spacing: "comfortable",
  },
  {
    name: "flat",
    label: "Flat",
    radius: "12px",
    glassBlur: "0px",
    surfaceOpacity: 0.05,
    borderOpacity: 0.08,
    spacing: "comfortable",
  },
  {
    name: "minimal",
    label: "Minimal",
    radius: "12px",
    glassBlur: "12px",
    surfaceOpacity: 0.02,
    borderOpacity: 0.03,
    spacing: "spacious",
  },
  {
    name: "sharp",
    label: "Sharp",
    radius: "0px",
    glassBlur: "0px",
    surfaceOpacity: 0.05,
    borderOpacity: 0.1,
    spacing: "comfortable",
  },
  {
    name: "rounded",
    label: "Rounded",
    radius: "24px",
    glassBlur: "20px",
    surfaceOpacity: 0.03,
    borderOpacity: 0.05,
    spacing: "comfortable",
  },
  {
    name: "brutalist",
    label: "Brutalist",
    radius: "4px",
    glassBlur: "0px",
    surfaceOpacity: 0.06,
    borderOpacity: 0.15,
    spacing: "compact",
  },
  {
    name: "neon",
    label: "Neon",
    radius: "16px",
    glassBlur: "32px",
    surfaceOpacity: 0.04,
    borderOpacity: 0.12,
    spacing: "comfortable",
  },
  {
    name: "terminal",
    label: "Terminal",
    radius: "4px",
    glassBlur: "8px",
    surfaceOpacity: 0.04,
    borderOpacity: 0.08,
    spacing: "compact",
  },
  {
    name: "soft",
    label: "Soft",
    radius: "20px",
    glassBlur: "16px",
    surfaceOpacity: 0.02,
    borderOpacity: 0.03,
    spacing: "spacious",
  },
  {
    name: "dense",
    label: "Dense",
    radius: "8px",
    glassBlur: "12px",
    surfaceOpacity: 0.04,
    borderOpacity: 0.07,
    spacing: "compact",
  },
  // ── New styles ─────────────────────────────────────────
  {
    name: "frosted",
    label: "Frosted",
    radius: "20px",
    glassBlur: "40px",
    surfaceOpacity: 0.05,
    borderOpacity: 0.04,
    spacing: "comfortable",
  },
  {
    name: "editorial",
    label: "Editorial",
    radius: "10px",
    glassBlur: "0px",
    surfaceOpacity: 0.03,
    borderOpacity: 0.06,
    spacing: "spacious",
  },
  {
    name: "retro",
    label: "Retro",
    radius: "6px",
    glassBlur: "0px",
    surfaceOpacity: 0.06,
    borderOpacity: 0.12,
    spacing: "comfortable",
  },
  {
    name: "floating",
    label: "Floating",
    radius: "20px",
    glassBlur: "16px",
    surfaceOpacity: 0.04,
    borderOpacity: 0.01,
    spacing: "comfortable",
  },
  {
    name: "notebook",
    label: "Notebook",
    radius: "8px",
    glassBlur: "4px",
    surfaceOpacity: 0.03,
    borderOpacity: 0.07,
    spacing: "comfortable",
  },
  {
    name: "vapor",
    label: "Vapor",
    radius: "28px",
    glassBlur: "48px",
    surfaceOpacity: 0.02,
    borderOpacity: 0.02,
    spacing: "spacious",
  },
  {
    name: "industrial",
    label: "Industrial",
    radius: "2px",
    glassBlur: "0px",
    surfaceOpacity: 0.06,
    borderOpacity: 0.1,
    spacing: "compact",
  },
  {
    name: "zen",
    label: "Zen",
    radius: "16px",
    glassBlur: "8px",
    surfaceOpacity: 0.015,
    borderOpacity: 0.025,
    spacing: "spacious",
  },
  {
    name: "matrix",
    label: "Matrix",
    radius: "0px",
    glassBlur: "4px",
    surfaceOpacity: 0.05,
    borderOpacity: 0.08,
    spacing: "compact",
  },
  {
    name: "sleek",
    label: "Sleek",
    radius: "14px",
    glassBlur: "20px",
    surfaceOpacity: 0.03,
    borderOpacity: 0.04,
    spacing: "comfortable",
  },
];

// ── Font preset helpers ────────────────────────────────────

const loadedFontUrls = new Set<string>();

function loadGoogleFont(url: string) {
  if (typeof document === "undefined" || loadedFontUrls.has(url)) return;
  loadedFontUrls.add(url);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}

export function applyFontPreset(preset: FontPreset) {
  if (typeof document === "undefined") return;
  if (preset.googleFontsUrl) loadGoogleFont(preset.googleFontsUrl);
  const root = document.documentElement;
  root.style.setProperty("--mc-font-body", preset.bodyFont);
  root.style.setProperty("--mc-font-heading", preset.headingFont);
  root.style.setProperty("--mc-font-mono", preset.monoFont);
}

export function loadSavedFont(): FontPreset {
  if (typeof window === "undefined") return fontPresets[0];
  const saved = localStorage.getItem("mc-font");
  if (saved) {
    const preset = fontPresets.find((f) => f.name === saved);
    if (preset) return preset;
  }
  return fontPresets[0];
}

export function saveFontPreset(preset: FontPreset) {
  localStorage.setItem("mc-font", preset.name);
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ font: preset.name }),
  }).catch(() => {});
}

// ── Style preset helpers ───────────────────────────────────

export function applyStylePreset(preset: StylePreset, theme?: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--mc-radius", preset.radius);
  root.style.setProperty("--mc-glass-blur", preset.glassBlur);

  // Sync with Tailwind/shadcn --radius so rounded-* classes respond
  root.style.setProperty("--radius", preset.radius);

  // Reconstruct surface/border colors using style opacity + theme context
  const activeTheme = theme ?? getCurrentThemeFromDOM();
  if (activeTheme) {
    const base = activeTheme.isLight ? "0, 0, 0" : "255, 255, 255";
    const surface = `rgba(${base}, ${preset.surfaceOpacity})`;
    const surfaceHover = `rgba(${base}, ${Math.min(preset.surfaceOpacity + 0.02, 1)})`;
    const border = `rgba(${base}, ${preset.borderOpacity})`;

    root.style.setProperty("--mc-surface", surface);
    root.style.setProperty("--mc-surface-hover", surfaceHover);
    root.style.setProperty("--mc-border", border);

    // Also update shadcn variables that derive from surface/border
    root.style.setProperty("--card", surface);
    root.style.setProperty("--secondary", surface);
    root.style.setProperty("--muted", surface);
    root.style.setProperty("--accent", surfaceHover);
    root.style.setProperty("--border", border);
    root.style.setProperty("--input", border);
    root.style.setProperty("--sidebar-accent", surface);
    root.style.setProperty("--sidebar-border", border);
  }

  // Update spacing class on body
  document.body.classList.remove("mc-compact", "mc-comfortable", "mc-spacious");
  document.body.classList.add(`mc-${preset.spacing}`);
}

function getCurrentThemeFromDOM(): Theme | null {
  if (typeof document === "undefined") return null;
  const isLight = document.documentElement.classList.contains("light");
  // Return a minimal theme object with just the isLight flag
  return { isLight } as Theme;
}

export function loadSavedStyle(): StylePreset {
  if (typeof window === "undefined") return stylePresets[0];
  const saved = localStorage.getItem("mc-style");
  if (saved) {
    const preset = stylePresets.find((s) => s.name === saved);
    if (preset) return preset;
  }
  return stylePresets[0];
}

export function saveStylePreset(preset: StylePreset) {
  localStorage.setItem("mc-style", preset.name);
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style: preset.name }),
  }).catch(() => {});
}
