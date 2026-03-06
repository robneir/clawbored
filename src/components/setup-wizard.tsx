"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  Key,
  CheckCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Plus,
  LogIn,
  ExternalLink,
  Palette,
  Terminal,
} from "lucide-react";
import type { ProviderConfig } from "@/lib/providers";
import { GatewayInstallProgress } from "@/components/gateway-install-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { AnthropicIcon, OpenAIIcon } from "@/components/provider-icons";
import { AppPreviewMock } from "@/components/app-preview-mock";
import { AppearancePickerPanel } from "@/components/appearance-picker-panel";
import { useGateway } from "@/components/gateway-provider";
import { useTheme } from "@/components/theme-provider";
import { PROVIDERS } from "@/lib/providers";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────

type WizardStep = "appearance" | "gateway" | "provider" | "success";

interface DetectedProfile {
  name: string;
  dir: string;
  port: number | null;
  hasToken: boolean;
  agentCount: number;
  isRunning: boolean;
  isDefault: boolean;
}

interface SetupWizardProps {
  initialStep?: WizardStep;
  onComplete: () => void;
}

// ── Provider icon lookup ───────────────────────────────────

const PROVIDER_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
};

// ── Step Indicator ─────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { key: "appearance" as const, label: "Appearance", icon: Palette },
    { key: "provider" as const, label: "AI Provider", icon: Key },
    { key: "gateway" as const, label: "Instance", icon: Server },
  ];
  const currentIdx = current === "success" ? 3 : steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center justify-center gap-3 mb-10">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className="w-12 h-px"
                style={{ backgroundColor: done ? "var(--mc-accent)" : "var(--mc-border)" }}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: done
                    ? "var(--mc-accent)"
                    : active
                    ? "var(--mc-surface)"
                    : "var(--mc-surface)",
                  border: active ? "1.5px solid var(--mc-accent)" : "1px solid var(--mc-border)",
                }}
              >
                {done ? (
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? "var(--mc-accent)" : "var(--mc-muted)" }}
                  />
                )}
              </div>
              <span
                className="text-xs font-medium hidden sm:inline"
                style={{ color: active ? "var(--mc-text)" : "var(--mc-muted)" }}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Wizard Provider Card ──────────────────────────────────
// Matches the settings ProviderCard layout but navigates to the
// next wizard step on success instead of refreshing in-place.

function WizardProviderCard({
  provider,
  onSuccess,
  index,
}: {
  provider: ProviderConfig;
  onSuccess: () => void;
  index: number;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  // OAuth connect state
  const [connecting, setConnecting] = useState(false);

  // Anthropic code paste (OAuth redirects to console.anthropic.com, user must paste code)
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);

  // Manual paste fallback
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [subToken, setSubToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const Icon = PROVIDER_ICONS[provider.id];

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
          onSuccess();
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
  }, [provider.id, provider.name, onSuccess]);

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
      onSuccess();
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
        const data = await res.json().catch(() => ({ error: "Failed to save key" }));
        throw new Error(data.error || "Failed to save key");
      }
      toast.success(`${provider.name} API key saved`);
      setApiKey("");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
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
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save token");
    } finally {
      setSavingToken(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="glass-card p-5"
    >
      {/* Header row: icon + name */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: "var(--mc-surface)",
            border: "1px solid var(--mc-border)",
          }}
        >
          {Icon && <Icon size={20} style={{ color: "var(--mc-muted)" }} />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
            {provider.name}
          </span>
          <span className="text-xs mt-0.5 block" style={{ color: "var(--mc-muted)" }}>
            {provider.description}
          </span>
        </div>
      </div>

      {/* Subscription / OAuth section */}
      {provider.supportsSubscription && (
        <>
          {awaitingCode ? (
            /* Anthropic: paste the auth code from the browser */
            <div
              className="p-3 rounded-xl mb-3 space-y-2.5"
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
              <button
                onClick={() => { setAwaitingCode(false); setAuthCode(""); setShowManualPaste(true); }}
                className="text-[10px]"
                style={{ color: "var(--mc-muted)" }}
              >
                Use API key instead
              </button>
            </div>
          ) : connecting ? (
            /* Waiting for OAuth callback */
            <div
              className="p-3 rounded-xl mb-3 space-y-2"
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
              className="p-3 rounded-xl mb-3 space-y-2.5"
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
            /* Connect button — subscription row matching settings */
            <div
              className="flex items-center gap-3 p-3 rounded-xl mb-3"
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
                disabled={connecting}
                size="sm"
                className="rounded-lg h-8 text-[11px] text-white gap-1.5"
                style={{ backgroundColor: "var(--mc-accent)" }}
              >
                <ExternalLink className="w-3 h-3" />
                Connect
              </Button>
            </div>
          )}

          {/* Divider with "or" */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--mc-border)" }} />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--mc-border)" }} />
          </div>
        </>
      )}

      {/* API Key section */}
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
            onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
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
    </motion.div>
  );
}

// ── Main Wizard ────────────────────────────────────────────

export function SetupWizard({ initialStep = "appearance", onComplete }: SetupWizardProps) {
  const { refresh } = useGateway();
  const { currentTheme, fontPresets } = useTheme();
  const [step, setStep] = useState<WizardStep>(initialStep);

  // Gateway state
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPort, setNewPort] = useState("19100");
  const [showPortEdit, setShowPortEdit] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null);

  // Preload Google Fonts for font previews
  useEffect(() => {
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
  }, [fontPresets]);

  // Load profiles on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/gateway/profiles");
        if (res.ok) {
          const data = await res.json();
          const profileList = data.profiles || data;
          setProfiles(profileList);
          if (profileList.length > 0) setSelectedProfile(profileList[0].dir);
          if (data.recommendedPort) setNewPort(String(data.recommendedPort));
        }
      } catch {}
      setLoadingProfiles(false);
    }
    load();
  }, []);

  // ── Gateway handlers ───────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (!selectedProfile) return;
    setConnecting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/gateway/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "connect", profileDir: selectedProfile }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Connection failed" }));
        throw new Error(data.error || "Connection failed");
      }
      toast.success("Instance connected");
      refresh();
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Connection failed");
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [selectedProfile, refresh]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setConnecting(true);
    setErrorMsg("");
    setActiveDeployId(null);
    try {
      const res = await fetch("/api/gateway/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          profileName: newName.trim(),
          port: parseInt(newPort) || 19100,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Creation failed" }));
        throw new Error(data.error || "Creation failed");
      }
      const result = await res.json();
      if (result.deployId) {
        // Show progress view — callbacks handle completion
        setActiveDeployId(result.deployId);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Creation failed");
      toast.error(err instanceof Error ? err.message : "Creation failed");
      setActiveDeployId(null);
    } finally {
      setConnecting(false);
    }
  }, [newName, newPort]);

  const handleInstallComplete = useCallback(() => {
    toast.success("Instance created");
    refresh();
    setActiveDeployId(null);
    setStep("success");
  }, [refresh]);

  const handleInstallError = useCallback((error: string) => {
    setErrorMsg(error || "Instance setup failed");
    toast.error(error || "Instance setup failed");
    setActiveDeployId(null);
  }, []);

  // Provider success → advance to gateway step
  const handleProviderSuccess = useCallback(() => {
    setStep("gateway");
  }, []);

  // ── Success auto-complete ──────────────────────────────

  useEffect(() => {
    if (step === "success") {
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [step, onComplete]);

  // ── Render ─────────────────────────────────────────────

  // Appearance step: full-screen mock app + floating picker
  if (step === "appearance") {
    return (
      <div className="relative w-full h-full min-h-screen overflow-hidden">
        {/* Mock app background */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <AppPreviewMock />
        </div>
        {/* Subtle darkening overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: currentTheme.isLight ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.15)",
          }}
        />
        {/* Floating picker */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
          <StepIndicator current={step} />
          <AppearancePickerPanel onContinue={() => setStep("provider")} />
        </div>
      </div>
    );
  }

  // Other steps: centered max-w-lg layout
  return (
    <div className="flex items-center justify-center min-h-full px-4 py-10">
      <div className="w-full max-w-lg">
        <StepIndicator current={step} />

        <AnimatePresence mode="wait">
          {/* ── Step 3: Instance ── */}
          {step === "gateway" && (
            <motion.div
              key="gateway"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AnimatePresence mode="wait">
                {activeDeployId ? (
                  <motion.div
                    key="progress"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.35 }}
                    className="py-4"
                  >
                    <GatewayInstallProgress
                      deployId={activeDeployId}
                      profileName={newName.trim() || "Gateway"}
                      onComplete={handleInstallComplete}
                      onError={handleInstallError}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.35 }}
                  >
                    <div className="text-center mb-8">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                        style={{
                          backgroundColor: "var(--mc-surface)",
                          border: "1px solid var(--mc-border)",
                        }}
                      >
                        <Server className="w-8 h-8" style={{ color: "var(--mc-accent)", opacity: 0.8 }} />
                      </motion.div>
                      <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mc-text)" }}>
                        Create Your Instance
                      </h2>
                      <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                        Connect to an existing OpenClaw instance or create a new one
                      </p>
                    </div>

                    {loadingProfiles ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mc-muted)" }} />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Existing profiles */}
                        {profiles.length > 0 && !showCreate && (
                          <>
                            {profiles.map((profile) => (
                              <button
                                key={profile.dir}
                                onClick={() => setSelectedProfile(profile.dir)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                                style={{
                                  backgroundColor: "var(--mc-surface)",
                                  border: `1.5px solid ${
                                    selectedProfile === profile.dir
                                      ? "var(--mc-accent)"
                                      : "var(--mc-border)"
                                  }`,
                                }}
                              >
                                <div
                                  className={
                                    profile.isRunning
                                      ? "status-dot-running"
                                      : "status-dot-stopped"
                                  }
                                />
                                <div className="flex-1 min-w-0">
                                  <div
                                    className="text-sm font-medium truncate"
                                    style={{ color: "var(--mc-text)" }}
                                  >
                                    {profile.name}
                                  </div>
                                  <div className="text-xs" style={{ color: "var(--mc-muted)" }}>
                                    {profile.agentCount} agent
                                    {profile.agentCount !== 1 ? "s" : ""}
                                    {profile.port && ` · port ${profile.port}`}
                                  </div>
                                </div>
                                {selectedProfile === profile.dir && (
                                  <CheckCircle
                                    className="w-4 h-4 flex-shrink-0"
                                    style={{ color: "var(--mc-accent)" }}
                                  />
                                )}
                              </button>
                            ))}

                            {errorMsg && (
                              <p className="text-xs text-red-400 text-center">{errorMsg}</p>
                            )}

                            <Button
                              onClick={handleConnect}
                              disabled={!selectedProfile || connecting}
                              className="w-full rounded-xl h-11 text-sm font-medium gap-2 text-white"
                              style={{ backgroundColor: "var(--mc-accent)" }}
                            >
                              {connecting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ArrowRight className="w-4 h-4" />
                              )}
                              {connecting ? "Connecting..." : "Connect"}
                            </Button>

                            <div className="flex items-center gap-3 py-1">
                              <div className="flex-1 h-px" style={{ backgroundColor: "var(--mc-border)" }} />
                              <span className="text-xs" style={{ color: "var(--mc-muted)" }}>or</span>
                              <div className="flex-1 h-px" style={{ backgroundColor: "var(--mc-border)" }} />
                            </div>

                            <button
                              onClick={() => setShowCreate(true)}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                              style={{
                                color: "var(--mc-muted)",
                                border: "1px solid var(--mc-border)",
                              }}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Create New Instance
                            </button>
                          </>
                        )}

                        {/* Create new form */}
                        {(profiles.length === 0 || showCreate) && (
                          <div className="space-y-4">
                            {showCreate && profiles.length > 0 && (
                              <button
                                onClick={() => setShowCreate(false)}
                                className="flex items-center gap-1.5 text-xs transition-colors"
                                style={{ color: "var(--mc-muted)" }}
                              >
                                <ArrowLeft className="w-3 h-3" />
                                Back to instances
                              </button>
                            )}
                            <div>
                              <label
                                className="text-xs font-medium mb-1.5 block"
                                style={{ color: "var(--mc-muted)" }}
                              >
                                Instance Name
                              </label>
                              <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. my-agents"
                                className="rounded-xl h-10 text-sm"
                                style={{
                                  backgroundColor: "var(--mc-surface)",
                                  borderColor: "var(--mc-border)",
                                  color: "var(--mc-text)",
                                }}
                              />
                            </div>
                            <p
                              className="text-xs"
                              style={{ color: "var(--mc-muted)", opacity: 0.5 }}
                            >
                              Creates ~/.openclaw-{newName || "name"}
                            </p>
                            <div>
                              {showPortEdit ? (
                                <>
                                  <label
                                    className="text-xs font-medium mb-1.5 block"
                                    style={{ color: "var(--mc-muted)" }}
                                  >
                                    Port
                                  </label>
                                  <Input
                                    value={newPort}
                                    onChange={(e) => setNewPort(e.target.value.replace(/[^0-9]/g, ""))}
                                    placeholder="19100"
                                    className="rounded-xl h-10 text-sm"
                                    style={{
                                      backgroundColor: "var(--mc-surface)",
                                      borderColor: "var(--mc-border)",
                                      color: "var(--mc-text)",
                                    }}
                                  />
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs" style={{ color: "var(--mc-muted)" }}>
                                    Port: <span style={{ color: "var(--mc-text)" }}>{newPort}</span>
                                  </span>
                                  <button
                                    onClick={() => setShowPortEdit(true)}
                                    className="text-[10px] underline underline-offset-2"
                                    style={{ color: "var(--mc-muted)" }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </div>

                            {errorMsg && (
                              <p className="text-xs text-red-400 text-center">{errorMsg}</p>
                            )}

                            <Button
                              onClick={handleCreate}
                              disabled={!newName.trim() || connecting}
                              className="w-full rounded-xl h-11 text-sm font-medium gap-2 text-white"
                              style={{ backgroundColor: "var(--mc-accent)" }}
                            >
                              {connecting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ArrowRight className="w-4 h-4" />
                              )}
                              {connecting ? "Creating instance..." : "Create Instance"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Back button */}
                    <button
                      onClick={() => setStep("provider")}
                      className="flex items-center gap-1.5 text-xs mt-6 mx-auto transition-colors"
                      style={{ color: "var(--mc-muted)" }}
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── Step 2: AI Provider ── */}
          {step === "provider" && (
            <motion.div
              key="provider"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--mc-surface)",
                    border: "1px solid var(--mc-border)",
                  }}
                >
                  <Key className="w-8 h-8" style={{ color: "var(--mc-accent)", opacity: 0.8 }} />
                </motion.div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--mc-text)" }}>
                  Connect an AI Provider
                </h2>
                <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                  Add at least one provider to power your agents
                </p>
              </div>

              <div className="space-y-4">
                {PROVIDERS.map((provider, i) => (
                  <WizardProviderCard
                    key={provider.id}
                    provider={provider}
                    onSuccess={handleProviderSuccess}
                    index={i}
                  />
                ))}
              </div>

              {/* Back button */}
              <button
                onClick={() => setStep("appearance")}
                className="flex items-center gap-1.5 text-xs mt-6 mx-auto transition-colors"
                style={{ color: "var(--mc-muted)" }}
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            </motion.div>
          )}

          {/* ── Step 4: Success ── */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20"
              >
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </motion.div>
              <h2
                className="text-xl font-semibold mb-2"
                style={{ color: "var(--mc-text)" }}
              >
                You&apos;re All Set
              </h2>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                Clawboard is ready. Loading your dashboard...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
