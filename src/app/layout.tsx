import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clawboard",
  description: "AI Agent Operations Platform",
};

// Inline script to apply theme instantly before React hydrates (prevents flash)
const themeInitScript = `
(function() {
  try {
    var themes = {
      "midnight": { bg:"#09090b", text:"#fafafa", accent:"#6366f1", accentHover:"#818cf8", surface:"rgba(255,255,255,0.03)", surfaceHover:"rgba(255,255,255,0.05)", border:"rgba(255,255,255,0.06)", muted:"#71717a", sidebar:"#0a0a0c" },
      "obsidian": { bg:"#1a1a2e", text:"#e8e8f0", accent:"#7c3aed", accentHover:"#8b5cf6", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.08)", muted:"#8888a0", sidebar:"#141428" },
      "nord": { bg:"#2e3440", text:"#eceff4", accent:"#88c0d0", accentHover:"#8fbcbb", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.07)", border:"rgba(255,255,255,0.08)", muted:"#7b88a1", sidebar:"#272d38" },
      "monokai": { bg:"#272822", text:"#f8f8f2", accent:"#a6e22e", accentHover:"#b8f040", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.08)", muted:"#8f908a", sidebar:"#1e1f1a" },
      "solarized-dark": { bg:"#002b36", text:"#fdf6e3", accent:"#2aa198", accentHover:"#35bdb4", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.07)", muted:"#839496", sidebar:"#002028" },
      "rose-pine": { bg:"#191724", text:"#e0def4", accent:"#eb6f92", accentHover:"#f0849e", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.07)", muted:"#908caa", sidebar:"#13111e" },
      "catppuccin": { bg:"#1e1e2e", text:"#cdd6f4", accent:"#b4befe", accentHover:"#c4ccff", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.07)", muted:"#7f849c", sidebar:"#181825" },
      "ocean": { bg:"#0d1b2a", text:"#e0e7ef", accent:"#0ea5e9", accentHover:"#38bdf8", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.07)", muted:"#6b8299", sidebar:"#091522" },
      "ember": { bg:"#1c1917", text:"#fafaf9", accent:"#f97316", accentHover:"#fb923c", surface:"rgba(255,255,255,0.04)", surfaceHover:"rgba(255,255,255,0.06)", border:"rgba(255,255,255,0.07)", muted:"#87827d", sidebar:"#151210" },
      "frost": { bg:"#f8fafc", text:"#0f172a", accent:"#3b82f6", accentHover:"#2563eb", surface:"rgba(0,0,0,0.03)", surfaceHover:"rgba(0,0,0,0.05)", border:"rgba(0,0,0,0.08)", muted:"#64748b", sidebar:"#f1f5f9", isLight:true }
    };
    var saved = localStorage.getItem("mc-theme");
    var r = document.documentElement;
    if (saved && themes[saved]) {
      var t = themes[saved];
      r.style.setProperty("--mc-bg", t.bg);
      r.style.setProperty("--mc-text", t.text);
      r.style.setProperty("--mc-accent", t.accent);
      r.style.setProperty("--mc-accent-hover", t.accentHover);
      r.style.setProperty("--mc-surface", t.surface);
      r.style.setProperty("--mc-surface-hover", t.surfaceHover);
      r.style.setProperty("--mc-border", t.border);
      r.style.setProperty("--mc-muted", t.muted);
      r.style.setProperty("--mc-sidebar", t.sidebar);
      r.style.setProperty("--background", t.bg);
      r.style.setProperty("--foreground", t.text);
      r.style.setProperty("--card", t.surface);
      r.style.setProperty("--card-foreground", t.text);
      r.style.setProperty("--popover", t.sidebar);
      r.style.setProperty("--popover-foreground", t.text);
      r.style.setProperty("--primary", t.text);
      r.style.setProperty("--primary-foreground", t.bg);
      r.style.setProperty("--sidebar", t.sidebar);
      r.style.setProperty("--sidebar-foreground", t.text);
      r.style.setProperty("--border", t.border);
      r.style.setProperty("--input", t.border);
      document.body.style.backgroundColor = t.bg;
      document.body.style.color = t.text;
      if (t.isLight) {
        r.classList.remove("dark");
        r.classList.add("light");
      }
    }
    // Apply saved style preset (radius, blur, spacing)
    var styles = {
      "glass": { radius:"16px", blur:"24px", so:0.03, bo:0.06, sp:"comfortable" },
      "flat": { radius:"12px", blur:"0px", so:0.05, bo:0.08, sp:"comfortable" },
      "minimal": { radius:"12px", blur:"12px", so:0.02, bo:0.03, sp:"spacious" },
      "sharp": { radius:"0px", blur:"0px", so:0.05, bo:0.1, sp:"comfortable" },
      "rounded": { radius:"24px", blur:"20px", so:0.03, bo:0.05, sp:"comfortable" },
      "brutalist": { radius:"4px", blur:"0px", so:0.06, bo:0.15, sp:"compact" },
      "neon": { radius:"16px", blur:"32px", so:0.04, bo:0.12, sp:"comfortable" },
      "terminal": { radius:"4px", blur:"8px", so:0.04, bo:0.08, sp:"compact" },
      "soft": { radius:"20px", blur:"16px", so:0.02, bo:0.03, sp:"spacious" },
      "dense": { radius:"8px", blur:"12px", so:0.04, bo:0.07, sp:"compact" }
    };
    var savedStyle = localStorage.getItem("mc-style");
    if (savedStyle && styles[savedStyle]) {
      var s = styles[savedStyle];
      r.style.setProperty("--mc-radius", s.radius);
      r.style.setProperty("--mc-glass-blur", s.blur);
      r.style.setProperty("--radius", s.radius);
      var isLight = saved === "frost";
      var base = isLight ? "0,0,0" : "255,255,255";
      r.style.setProperty("--mc-surface", "rgba("+base+","+s.so+")");
      r.style.setProperty("--mc-surface-hover", "rgba("+base+","+(s.so+0.02)+")");
      r.style.setProperty("--mc-border", "rgba("+base+","+s.bo+")");
      r.style.setProperty("--border", "rgba("+base+","+s.bo+")");
      r.style.setProperty("--input", "rgba("+base+","+s.bo+")");
      document.body.classList.add("mc-"+s.sp);
    }
    // Apply saved font preset
    var fonts = {
      "jetbrains": "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap",
      "ibm-plex": "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      "space-grotesk": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
      "dm-sans": "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap",
      "jakarta": "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      "nunito": "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap",
      "source-sans": "https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap",
      "outfit": "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
      "fira-sans": "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Fira+Sans:wght@400;500;600;700&display=swap"
    };
    var fontBodies = {
      "system": '"Inter", system-ui, -apple-system, sans-serif',
      "jetbrains": '"JetBrains Mono", monospace',
      "ibm-plex": '"IBM Plex Sans", sans-serif',
      "space-grotesk": '"Space Grotesk", sans-serif',
      "dm-sans": '"DM Sans", sans-serif',
      "jakarta": '"Plus Jakarta Sans", sans-serif',
      "nunito": '"Nunito", sans-serif',
      "source-sans": '"Source Sans 3", sans-serif',
      "outfit": '"Outfit", sans-serif',
      "fira-sans": '"Fira Sans", sans-serif'
    };
    var savedFont = localStorage.getItem("mc-font");
    if (savedFont && fontBodies[savedFont]) {
      r.style.setProperty("--mc-font-body", fontBodies[savedFont]);
      if (fonts[savedFont]) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = fonts[savedFont];
        document.head.appendChild(link);
      }
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${lato.variable} ${geistMono.variable} antialiased`}
        style={{
          backgroundColor: "var(--mc-bg)",
          color: "var(--mc-text)",
          fontFamily: "var(--mc-font-body, var(--font-lato, 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif))",
        }}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
