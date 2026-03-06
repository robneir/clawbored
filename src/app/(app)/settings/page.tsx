"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Key,
  CheckCircle,
  Loader2,
  LogIn,
  ExternalLink,
  Palette,
  Trash2,
  Server,
  Type,
  Layout,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { useTheme } from "@/components/theme-provider";
import { ThemeCard, FontCard, StyleCard } from "@/components/appearance-cards";
import { AnthropicIcon, OpenAIIcon } from "@/components/provider-icons";
import { PROVIDERS as AI_PROVIDERS, type ProviderConfig } from "@/lib/providers";
import { toast } from "sonner";

interface ProviderKeyData {
  provider: string;
  displayName: string;
  validated: boolean;
  keyHint: string;
  configuredAt: string;
}

interface OAuthProviderStatus {
  connected: boolean;
  type?: string;
}

interface OAuthStatus {
  providers: Record<string, OAuthProviderStatus>;
}

// ── Provider icon lookup ─────────────────────────────────────

const PROVIDER_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
};

// ── Provider Card ───────────────────────────────────────────

function ProviderCard({
  provider,
  keyData,
  oauthStatus,
  onUpdate,
  index,
}: {
  provider: ProviderConfig;
  keyData: ProviderKeyData | null;
  oauthStatus: OAuthProviderStatus | null;
  onUpdate: () => void;
  index: number;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // OAuth connect state
  const [connecting, setConnecting] = useState(false);
  const [disconnectingOAuth, setDisconnectingOAuth] = useState(false);

  // Anthropic code paste (OAuth redirects to console.anthropic.com, user must paste code)
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);

  // Manual paste fallback
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [subToken, setSubToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Auth method toggle: "subscription" or "apikey"
  // Default to whichever method is currently connected, or "subscription" for providers that support it
  const [authMethod, setAuthMethod] = useState<"subscription" | "apikey">(
    keyData && !oauthStatus?.connected ? "apikey" : "subscription"
  );

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const Icon = PROVIDER_ICONS[provider.id];

  const isOAuthConnected = oauthStatus?.connected ?? false;
  const isApiKeyConnected = !!keyData;
  const isConnected = isOAuthConnected || isApiKeyConnected;

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/oauth");
        if (!res.ok) return;
        const data = await res.json();
        if (data.providers?.[provider.id]?.connected) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setConnecting(false);
          toast.success(`${provider.name} connected!`);
          onUpdate();
        }
      } catch {}
    }, 2000);

    // Auto-stop after 5 minutes
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setConnecting(false);
        setShowManualPaste(true);
        toast.error("Timed out waiting for auth. Use the manual paste option below.");
      }
    }, 5 * 60 * 1000);
  }, [provider.id, provider.name, onUpdate]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, action: "connect" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to start OAuth" }));
        throw new Error(data.error || "Failed to start OAuth");
      }
      const data = await res.json();
      if (data.awaitingCode) {
        // Anthropic OAuth: user must paste the code from the browser
        setAwaitingCode(true);
        setConnecting(false);
      } else {
        // OpenAI OAuth: automatic callback, poll for completion
        startPolling();
      }
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "Failed to start OAuth");
    }
  }

  async function handleSubmitAuthCode() {
    if (!authCode.trim()) return;
    setSubmittingCode(true);
    try {
      const res = await fetch("/api/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, authCode: authCode.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to exchange code" }));
        throw new Error(data.error || "Failed to exchange code");
      }
      toast.success(`${provider.name} connected!`);
      setAuthCode("");
      setAwaitingCode(false);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to exchange code");
    } finally {
      setSubmittingCode(false);
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey) return;
    setSaving(true);
    try {
      const res = await fetch("/api/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, apiKey }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save key");
      }
      toast.success(`${provider.name} API key saved`);
      setApiKey("");
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteApiKey() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/provider-keys/${provider.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove key");
      toast.success(`${provider.name} API key removed`);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove key");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveManualToken() {
    if (!subToken.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch("/api/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, token: subToken.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to save token" }));
        throw new Error(data.error || "Failed to save token");
      }
      toast.success(`${provider.name} connected!`);
      setSubToken("");
      setShowManualPaste(false);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save token");
    } finally {
      setSavingToken(false);
    }
  }

  async function handleDisconnectOAuth() {
    setDisconnectingOAuth(true);
    try {
      const res = await fetch("/api/oauth", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast.success(`${provider.name} disconnected`);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnectingOAuth(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="glass-card p-5"
    >
      {/* Header row: icon + name + status */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: isConnected
              ? "rgba(52, 211, 153, 0.1)"
              : "var(--mc-surface)",
            border: `1px solid ${isConnected ? "rgba(52, 211, 153, 0.2)" : "var(--mc-border)"}`,
          }}
        >
          {Icon && <Icon size={20} style={{ color: isConnected ? "#34d399" : "var(--mc-muted)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
              {provider.name}
            </span>
            {isConnected && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {isOAuthConnected && isApiKeyConnected
                  ? "Connected"
                  : isOAuthConnected
                  ? "Subscription"
                  : "API Key"}
              </span>
            )}
          </div>
          <span className="text-xs mt-0.5 block" style={{ color: "var(--mc-muted)" }}>
            {provider.description}
          </span>
        </div>
      </div>

      {/* Auth method toggle (for providers with subscription support) */}
      {provider.supportsSubscription && (
        <div
          className="flex rounded-lg p-0.5 mb-4"
          style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
        >
          <button
            onClick={() => setAuthMethod("subscription")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
            style={{
              backgroundColor: authMethod === "subscription" ? "var(--mc-accent)" : "transparent",
              color: authMethod === "subscription" ? "white" : "var(--mc-muted)",
            }}
          >
            <LogIn className="w-3 h-3" />
            Subscription
            {isOAuthConnected && authMethod !== "subscription" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            )}
          </button>
          <button
            onClick={() => setAuthMethod("apikey")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
            style={{
              backgroundColor: authMethod === "apikey" ? "var(--mc-accent)" : "transparent",
              color: authMethod === "apikey" ? "white" : "var(--mc-muted)",
            }}
          >
            <Key className="w-3 h-3" />
            API Key
            {isApiKeyConnected && authMethod !== "apikey" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            )}
          </button>
        </div>
      )}

      {/* Subscription / OAuth section */}
      {provider.supportsSubscription && authMethod === "subscription" && (
        <>
          {isOAuthConnected ? (
            /* Connected state */
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <LogIn className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                  {provider.subscriptionLabel}
                </span>
                <span className="text-[10px] block mt-0.5" style={{ color: "var(--mc-muted)" }}>
                  {provider.subscriptionConnectedLabel}
                </span>
              </div>
              <Button
                onClick={handleDisconnectOAuth}
                disabled={disconnectingOAuth}
                variant="ghost"
                size="sm"
                className="rounded-lg h-8 text-[11px] text-red-400/60 hover:text-red-400 border border-red-500/10 gap-1.5"
              >
                {disconnectingOAuth ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Disconnect
              </Button>
            </div>
          ) : awaitingCode ? (
            /* Anthropic: paste the auth code from the browser */
            <div
              className="p-3 rounded-xl space-y-2.5"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <div className="flex items-center gap-2">
                <LogIn className="w-3.5 h-3.5" style={{ color: "var(--mc-accent)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                  Paste Authorization Code
                </span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                Sign in on the page that opened, then copy the authorization code and paste it below.
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="code#state"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="rounded-lg h-9 text-xs font-mono flex-1"
                  style={{
                    backgroundColor: "var(--mc-bg)",
                    borderColor: "var(--mc-border)",
                    color: "var(--mc-text)",
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitAuthCode()}
                />
                <Button
                  onClick={handleSubmitAuthCode}
                  disabled={!authCode.trim() || submittingCode}
                  size="sm"
                  className="rounded-lg h-9 text-xs text-white gap-1.5"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  {submittingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Connect
                </Button>
              </div>
            </div>
          ) : connecting ? (
            /* Waiting for OAuth callback (OpenAI) */
            <div
              className="p-3 rounded-xl space-y-2"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-accent)" }}
                />
                <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                  Waiting for authorization...
                </span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                Complete the sign-in in the browser window that opened. This page will update automatically.
              </p>
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  pollRef.current = null;
                  setConnecting(false);
                  setShowManualPaste(true);
                }}
                className="text-[10px] underline underline-offset-2"
                style={{ color: "var(--mc-muted)" }}
              >
                Having trouble? Paste token manually
              </button>
            </div>
          ) : showManualPaste ? (
            /* Manual token paste fallback */
            <div
              className="p-3 rounded-xl space-y-2.5"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" style={{ color: "var(--mc-accent)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                  Paste Setup Token
                </span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                {provider.id === "openai"
                  ? "Paste your OpenAI API key or OAuth token below."
                  : <>Run{" "}
                    <code
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                      style={{ backgroundColor: "var(--mc-bg)", color: "var(--mc-accent)" }}
                    >
                      openclaw models auth setup-token
                    </code>
                    {" "}in your terminal, then paste the token below.</>}
              </p>
              <div className="flex gap-2">
                <PasswordInput
                  value={subToken}
                  onChange={setSubToken}
                  placeholder={provider.tokenPlaceholder}
                  className="rounded-lg h-9 text-xs font-mono"
                  style={{
                    backgroundColor: "var(--mc-bg)",
                    borderColor: "var(--mc-border)",
                    color: "var(--mc-text)",
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveManualToken()}
                />
                <Button
                  onClick={handleSaveManualToken}
                  disabled={!subToken.trim() || savingToken}
                  size="sm"
                  className="rounded-lg h-9 text-xs text-white gap-1.5"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  {savingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Save
                </Button>
              </div>
              <button
                onClick={() => { setShowManualPaste(false); setSubToken(""); }}
                className="text-[10px]"
                style={{ color: "var(--mc-muted)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Connect button */
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <LogIn className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                  {provider.subscriptionLabel}
                </span>
                <span className="text-[10px] block mt-0.5" style={{ color: "var(--mc-muted)" }}>
                  {provider.connectLabel}
                </span>
              </div>
              <Button
                onClick={handleConnect}
                size="sm"
                className="rounded-lg h-8 text-[11px] text-white gap-1.5"
                style={{ backgroundColor: "var(--mc-accent)" }}
              >
                <ExternalLink className="w-3 h-3" />
                Connect
              </Button>
            </div>
          )}
        </>
      )}

      {/* API Key section — shown when: no subscription support, or subscription-capable but apikey tab selected */}
      {(!provider.supportsSubscription || authMethod === "apikey") && (
        <>
          {isApiKeyConnected ? (
            <div className="flex items-center gap-3">
              <div
                className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-mono"
                style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)", color: "var(--mc-muted)" }}
              >
                <Key className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
                <span>...{keyData!.keyHint}</span>
                {keyData!.validated && (
                  <CheckCircle className="w-3 h-3 text-emerald-400 ml-1" />
                )}
              </div>
              <Button
                onClick={handleDeleteApiKey}
                disabled={deleting}
                variant="ghost"
                size="sm"
                className="rounded-lg h-9 text-xs text-red-400/60 hover:text-red-400 border border-red-500/10 gap-1.5"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <PasswordInput
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={provider.placeholder}
                  className="rounded-xl h-9 text-xs font-mono"
                  style={{
                    backgroundColor: "var(--mc-bg)",
                    borderColor: "var(--mc-border)",
                    color: "var(--mc-text)",
                  }}
                />
                <Button
                  onClick={handleSaveApiKey}
                  disabled={!apiKey || saving}
                  size="sm"
                  className="rounded-xl h-9 text-xs text-white gap-1.5"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                  Save Key
                </Button>
              </div>
              <p className="text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                Get your API key from{" "}
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                  style={{ color: "var(--mc-accent)" }}
                >
                  {provider.name} console
                </a>
              </p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── Settings Page ───────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyData[]>([]);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);

  const {
    currentTheme, setTheme, themes,
    currentFont, setFont, fontPresets,
    currentStyle, setStyle, stylePresets,
  } = useTheme();

  useEffect(() => {
    fetchAll();
    fontPresets.forEach((font) => {
      if (font.googleFontsUrl) {
        const existing = document.querySelector(`link[href="${font.googleFontsUrl}"]`);
        if (!existing) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = font.googleFontsUrl;
          document.head.appendChild(link);
        }
      }
    });
  }, []);

  async function fetchAll() {
    await Promise.all([fetchProviderKeys(), fetchOAuthStatus()]);
    setLoading(false);
  }

  async function fetchProviderKeys() {
    try {
      const res = await fetch("/api/provider-keys");
      if (res.ok) {
        const data = await res.json();
        setProviderKeys(data.keys || []);
      }
    } catch {}
  }

  async function fetchOAuthStatus() {
    try {
      const res = await fetch("/api/oauth");
      if (res.ok) {
        const data = await res.json();
        setOauthStatus(data);
      }
    } catch {}
  }

  function handleProviderUpdate() {
    fetchProviderKeys();
    fetchOAuthStatus();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }} />
      </div>
    );
  }

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
          Configure your AI providers and appearance
        </p>
      </motion.div>

      {/* ──────── AI Providers ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-1">
          <Server className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
          <h2 className="text-lg font-semibold tracking-tight">AI Providers</h2>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--mc-muted)" }}>
          Connect your AI providers to deploy agents and access models
        </p>

        <div className="space-y-3">
          {AI_PROVIDERS.map((provider, i) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              keyData={providerKeys.find((k) => k.provider === provider.id) || null}
              oauthStatus={oauthStatus?.providers?.[provider.id] || null}
              onUpdate={handleProviderUpdate}
              index={i}
            />
          ))}
        </div>
      </motion.div>

      {/* ──────── Appearance ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
          <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--mc-muted)" }}>
          Customize colors, fonts, and UI style
        </p>

        {/* Colors */}
        <div className="glass-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4" style={{ color: "var(--mc-muted)" }} />
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Colors
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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

        {/* Fonts */}
        <div className="glass-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-4 h-4" style={{ color: "var(--mc-muted)" }} />
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Font
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {fontPresets.map((font, i) => (
              <FontCard
                key={font.name}
                font={font}
                isSelected={currentFont.name === font.name}
                onClick={() => setFont(font)}
                index={i}
              />
            ))}
          </div>
        </div>

        {/* Style */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layout className="w-4 h-4" style={{ color: "var(--mc-muted)" }} />
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Style
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {stylePresets.map((style, i) => (
              <StyleCard
                key={style.name}
                style={style}
                isSelected={currentStyle.name === style.name}
                onClick={() => setStyle(style)}
                index={i}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
