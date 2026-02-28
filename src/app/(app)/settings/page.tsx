"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  Loader2,
  LogIn,
  User,
  ExternalLink,
  Check,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import { type Theme } from "@/lib/themes";

interface SettingsData {
  hasApiKey: boolean;
  authMethod: string | null;
  provider: string;
  configuredAt: string | null;
  keyHint: string | null;
}

function ThemeCard({
  theme,
  isSelected,
  onClick,
  index,
}: {
  theme: Theme;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl"
    >
      {/* Preview card */}
      <div
        className="relative w-[120px] h-[72px] rounded-xl overflow-hidden border-2 transition-all duration-200"
        style={{
          backgroundColor: theme.bg,
          borderColor: isSelected ? theme.accent : "transparent",
        }}
      >
        {/* Accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[6px]"
          style={{ backgroundColor: theme.accent }}
        />
        {/* Content preview lines */}
        <div className="absolute top-[14px] left-3 right-3 space-y-[6px]">
          <div
            className="h-[4px] rounded-full w-3/4"
            style={{ backgroundColor: theme.text, opacity: 0.6 }}
          />
          <div
            className="h-[4px] rounded-full w-1/2"
            style={{ backgroundColor: theme.text, opacity: 0.3 }}
          />
          <div
            className="h-[4px] rounded-full w-2/3"
            style={{ backgroundColor: theme.text, opacity: 0.15 }}
          />
        </div>
        {/* Surface preview */}
        <div
          className="absolute bottom-2 left-3 right-3 h-[14px] rounded-md"
          style={{
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
          }}
        />
        {/* Text color dot */}
        <div
          className="absolute top-[14px] right-3 w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: theme.text, opacity: 0.8 }}
        />
        {/* Selected checkmark */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ backgroundColor: theme.accent }}
            >
              <Check className="w-4 h-4" style={{ color: theme.bg }} />
            </div>
          </motion.div>
        )}
      </div>
      {/* Theme name */}
      <span
        className="text-xs font-medium transition-colors duration-200"
        style={{ color: isSelected ? "var(--mc-text)" : "var(--mc-muted)" }}
      >
        {theme.label}
      </span>
    </motion.button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [authTab, setAuthTab] = useState<"subscription" | "apikey">("subscription");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const { currentTheme, setTheme, themes } = useTheme();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, provider: "anthropic", authMethod: "api-key" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      setSaved(true);
      setApiKey("");
      await new Promise(r => setTimeout(r, 300));
      await fetchSettings();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectSubscription() {
    setConnectingOAuth(true);
    setError(null);

    try {
      // Check if Claude CLI is installed and authenticated
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authMethod: "subscription", provider: "anthropic" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to connect");
        return;
      }

      setSaved(true);
      // Small delay to ensure server has written the file
      await new Promise(r => setTimeout(r, 300));
      await fetchSettings();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnectingOAuth(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
          Configure your AI provider credentials
        </p>
      </motion.div>

            {/* ──────── Authentication ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="mb-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
          <h2 className="text-lg font-semibold tracking-tight">Authentication</h2>
        </div>
        <p className="text-sm mb-0" style={{ color: "var(--mc-muted)" }}>
          Connect your AI provider to deploy agents
        </p>
      </motion.div>

      {/* ──────── Connection Status ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card p-5 mb-6"
      >
        <div className="flex items-center gap-3">
          {settings?.hasApiKey ? (
            <>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Connected</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--mc-muted)" }}>
                  {settings.authMethod === "subscription" ? (
                    <>Claude subscription connected</>
                  ) : (
                    <>API key ending in{" "}
                    <span className="font-mono" style={{ opacity: 0.6 }}>
                      {settings.keyHint}
                    </span></>
                  )}
                  {settings.configuredAt && (
                    <>
                      {" "}&middot; configured{" "}
                      {new Date(settings.configuredAt).toLocaleDateString()}
                    </>
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Not Connected</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--mc-muted)" }}>
                  Connect your Claude subscription or add an API key to enable deployments
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Auth Method Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="glass-card overflow-hidden mb-6">
          {/* Tab headers */}
          <div className="flex" style={{ borderBottom: "1px solid var(--mc-border)" }}>
            <button
              onClick={() => setAuthTab("subscription")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all"
              style={{
                color: authTab === "subscription" ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: authTab === "subscription" ? "var(--mc-surface)" : "transparent",
                borderBottom: authTab === "subscription" ? `2px solid var(--mc-accent)` : "2px solid transparent",
              }}
            >
              <User className="w-4 h-4" />
              Claude Subscription
            </button>
            <button
              onClick={() => setAuthTab("apikey")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all"
              style={{
                color: authTab === "apikey" ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: authTab === "apikey" ? "var(--mc-surface)" : "transparent",
                borderBottom: authTab === "apikey" ? `2px solid var(--mc-accent)` : "2px solid transparent",
              }}
            >
              <Key className="w-4 h-4" />
              API Key
            </button>
          </div>

          {/* Tab content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              {authTab === "subscription" ? (
                <motion.div
                  key="subscription"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-5"
                >
                  <div
                    className="flex items-start gap-3 p-4 rounded-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--mc-accent) 8%, transparent)`,
                      border: `1px solid color-mix(in srgb, var(--mc-accent) 15%, transparent)`,
                    }}
                  >
                    <LogIn className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--mc-accent)" }} />
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: "var(--mc-accent)" }}>Use your existing Claude subscription</h3>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                        If you have a Claude Pro, Max, or Team subscription, you can authorize Mission Control
                        to use your subscription directly. No API key needed — we&apos;ll connect through your
                        existing Claude account.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>How it works</h4>
                    <div className="space-y-2">
                      {[
                        "Click connect below to authorize access",
                        "Sign in with your Anthropic account",
                        "Mission Control gets delegated access to your subscription",
                        "Your usage counts toward your existing plan limits",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: "var(--mc-surface)" }}>
                            <span className="text-[10px] font-medium" style={{ color: "var(--mc-muted)" }}>{i + 1}</span>
                          </div>
                          <span className="text-sm" style={{ color: "var(--mc-muted)" }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleConnectSubscription}
                    disabled={connectingOAuth}
                    className="w-full text-white rounded-xl h-11 text-sm font-medium gap-2"
                    style={{ backgroundColor: "var(--mc-accent)" }}
                  >
                    {connectingOAuth ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        Connect Claude Subscription
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                    Requires Claude Pro ($20/mo), Max ($100/mo), or Team plan
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="apikey"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <form onSubmit={handleSaveApiKey} className="space-y-5">
                    <div
                      className="flex items-start gap-3 p-4 rounded-xl"
                      style={{
                        backgroundColor: "var(--mc-surface)",
                        border: "1px solid var(--mc-border)",
                      }}
                    >
                      <Shield className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--mc-muted)" }} />
                      <div>
                        <h3 className="text-sm font-medium" style={{ color: "var(--mc-muted)" }}>Use an API key</h3>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                          Paste your Anthropic API key from{" "}
                          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                            className="underline underline-offset-2" style={{ color: "var(--mc-accent)" }}>
                            console.anthropic.com
                          </a>.
                          Usage is billed to your API account separately from any subscription.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="apiKey" className="text-xs uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                        API Key
                      </Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={showKey ? "text" : "password"}
                          placeholder="sk-ant-..."
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="rounded-xl h-11 text-sm font-mono pr-10"
                          style={{
                            backgroundColor: "var(--mc-surface)",
                            borderColor: "var(--mc-border)",
                            color: "var(--mc-text)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                          style={{ color: "var(--mc-muted)" }}
                        >
                          {showKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                        Stored locally in ~/.mission-control/auth.json — never sent to our servers
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={!apiKey || saving}
                      className="w-full rounded-xl h-11 text-sm font-medium gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          {settings?.hasApiKey ? "Update API Key" : "Save API Key"}
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Shared success/error messages */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">
                    Connected successfully
                  </span>
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 mt-4 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ──────── Appearance / Theme Section ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mb-8 mt-2"
      >
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
          <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--mc-muted)" }}>
          Choose your theme
        </p>

        <div className="glass-card p-5">
          <div className="grid grid-cols-5 gap-4 justify-items-center">
            {themes.map((theme, i) => (
              <ThemeCard
                key={theme.name}
                theme={theme}
                isSelected={currentTheme.name === theme.name}
                onClick={() => setTheme(theme)}
                index={i}
              />
            ))}
          </div>
        </div>
      </motion.div>

      
      
    </div>
  );
}
