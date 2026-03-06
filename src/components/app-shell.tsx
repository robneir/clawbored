"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Menu, Loader2, Server } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./sidebar";
import { Toaster } from "sonner";
import { GatewayProvider, useGateway } from "./gateway-provider";
import { LiveProvider } from "./live-provider";
import { SetupWizard } from "./setup-wizard";
import { InstallStatusBar } from "./install-status-bar";
import { NotificationBell } from "./notification-bell";
import { DiagnoseButton } from "./diagnose-button";
import { InstanceDropdown } from "./instance-dropdown";

type OnboardingState = "loading" | "onboarding-gateway" | "onboarding-provider" | "ready";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { gateway, loading, pageTransition } = useGateway();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>("loading");
  const wizardActiveRef = useRef(false);

  useEffect(() => {
    if (loading) {
      setOnboardingState("loading");
      return;
    }

    // If the wizard is active, don't re-evaluate — the wizard controls
    // its own lifecycle and will call onComplete when done.
    // (Gateway status changes mid-deploy must not kick us to the dashboard.)
    if (wizardActiveRef.current) return;

    const completed = localStorage.getItem("mc-onboarding-complete");

    // Helper: check if any AI provider is configured
    async function hasProviderConfigured(): Promise<boolean> {
      try {
        const [keysRes, settingsRes] = await Promise.all([
          fetch("/api/provider-keys"),
          fetch("/api/settings"),
        ]);

        if (keysRes.ok) {
          const data = await keysRes.json();
          const keys = data.keys || (Array.isArray(data) ? data : []);
          if (keys.length > 0) return true;
        }

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.authMethod === "subscription") return true;
        }
      } catch {}
      return false;
    }

    // Gateway not set up
    if (gateway?.status === "not_setup") {
      if (!completed) {
        // First-time user — full wizard (appearance → provider → gateway)
        wizardActiveRef.current = true;
        setOnboardingState("onboarding-gateway");
        return;
      }

      // Returning user — check if they have providers
      hasProviderConfigured().then((hasProvider) => {
        if (hasProvider) {
          // Has providers, just no gateway — show app, user creates from dropdown
          setOnboardingState("ready");
        } else {
          // No providers — show wizard at provider step (skip appearance)
          wizardActiveRef.current = true;
          setOnboardingState("onboarding-provider");
        }
      });
      return;
    }

    // Gateway is set up and onboarding was completed — go straight to app
    if (completed) {
      setOnboardingState("ready");
      return;
    }

    // Gateway set up but no onboarding flag — check if provider keys exist
    hasProviderConfigured().then((hasProvider) => {
      if (hasProvider) {
        localStorage.setItem("mc-onboarding-complete", "true");
        setOnboardingState("ready");
      } else {
        wizardActiveRef.current = true;
        setOnboardingState("onboarding-provider");
      }
    });
  }, [loading, gateway?.status]);

  const handleOnboardingComplete = useCallback(() => {
    wizardActiveRef.current = false;
    localStorage.setItem("mc-onboarding-complete", "true");
    setOnboardingState("ready");
  }, []);

  // ── Loading ──
  if (onboardingState === "loading") {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: "var(--mc-bg)" }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--mc-muted)" }} />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              backgroundColor: "var(--mc-sidebar)",
              borderColor: "var(--mc-border)",
              color: "var(--mc-text)",
              border: "1px solid var(--mc-border)",
              fontSize: "13px",
            },
            classNames: {
              success: "!border-emerald-500/20",
              error: "!border-red-500/20",
            },
          }}
        />
      </div>
    );
  }

  // ── Onboarding ──
  if (onboardingState === "onboarding-gateway" || onboardingState === "onboarding-provider") {
    return (
      <div
        className="h-screen overflow-y-auto"
        style={{ backgroundColor: "var(--mc-bg)" }}
      >
        <SetupWizard
          initialStep={onboardingState === "onboarding-gateway" ? "appearance" : "provider"}
          onComplete={handleOnboardingComplete}
        />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              backgroundColor: "var(--mc-sidebar)",
              borderColor: "var(--mc-border)",
              color: "var(--mc-text)",
              border: "1px solid var(--mc-border)",
              fontSize: "13px",
            },
            classNames: {
              success: "!border-emerald-500/20",
              error: "!border-red-500/20",
            },
          }}
        />
      </div>
    );
  }

  // ── Full app ──
  return (
    <div
      className="flex h-screen overflow-hidden relative"
      style={{ backgroundColor: "var(--mc-bg)" }}
    >
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Top-right controls: notification bell + instance dropdown */}
      <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
        <DiagnoseButton />
        <NotificationBell />
        <InstanceDropdown />
      </div>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: "var(--mc-sidebar)",
          border: "1px solid var(--mc-border)",
          color: "var(--mc-text)",
        }}
      >
        <Menu className="w-4 h-4" />
      </button>

      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            backgroundColor: "var(--mc-sidebar)",
            borderColor: "var(--mc-border)",
            color: "var(--mc-text)",
            border: "1px solid var(--mc-border)",
            fontSize: "13px",
          },
          classNames: {
            success: "!border-emerald-500/20",
            error: "!border-red-500/20",
          },
        }}
      />
      <InstallStatusBar />

      {/* Page transition overlay */}
      <AnimatePresence>
        {pageTransition && (
          <motion.div
            key={pageTransition.title}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ backgroundColor: "var(--mc-bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.02, y: -5 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-center"
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  border: "1px solid var(--mc-border)",
                }}
              >
                {pageTransition.avatar ? (
                  <span className="text-2xl leading-none">{pageTransition.avatar}</span>
                ) : (
                  <Server className="w-6 h-6" style={{ color: "var(--mc-accent)" }} />
                )}
              </div>
              <h1
                className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-2"
                style={{ color: "var(--mc-text)" }}
              >
                {pageTransition.title}
              </h1>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                {pageTransition.subtitle}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LiveProvider>
      <GatewayProvider>
        <AppShellInner>{children}</AppShellInner>
      </GatewayProvider>
    </LiveProvider>
  );
}
