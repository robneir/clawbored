"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  Search,
  Box,
  Settings,
  KeyRound,
  Download,
  Stethoscope,
  Play,
  Wifi,
  Bot,
  CheckCircle,
  XCircle,
  Check,
  Loader2,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

// ── Deploy Step Definitions ──────────────────────────────────

interface DeployStep {
  label: string;
  icon: LucideIcon;
  match: (msg: string) => boolean;
  /** If true, this step is hidden from the visual list (merged into previous) */
  hidden?: boolean;
}

export const DEPLOY_STEPS: DeployStep[] = [
  {
    label: "Checking OpenClaw installation",
    icon: Search,
    match: (m) => m.toLowerCase().includes("checking openclaw"),
  },
  {
    label: "Installing OpenClaw CLI",
    icon: Download,
    match: (m) => m.toLowerCase().includes("installing openclaw"),
    hidden: true, // Only fires if CLI missing — merge into step 0 visually
  },
  {
    label: "Creating OpenClaw instance",
    icon: Box,
    match: (m) => {
      const l = m.toLowerCase();
      return (l.includes("creating") && l.includes("instance")) || l.includes("onboard");
    },
  },
  {
    label: "Configuring gateway",
    icon: Settings,
    match: (m) => {
      const l = m.toLowerCase();
      return l.includes("configuring gateway") || l.includes("config updated");
    },
  },
  {
    label: "Setting up credentials",
    icon: KeyRound,
    match: (m) => {
      const l = m.toLowerCase();
      return l.includes("configuring agent") || l.includes("auth-profiles") || l.includes("auth configured");
    },
  },
  {
    label: "Installing gateway service",
    icon: Download,
    match: (m) => m.toLowerCase().includes("installing gateway service"),
  },
  {
    label: "Running diagnostics",
    icon: Stethoscope,
    match: (m) => m.toLowerCase().includes("doctor"),
  },
  {
    label: "Starting gateway",
    icon: Play,
    match: (m) => m.toLowerCase().includes("starting gateway"),
  },
  {
    label: "Verifying connection",
    icon: Wifi,
    match: (m) => {
      const l = m.toLowerCase();
      return l.includes("verifying") || l.includes("alive on port") || l.includes("not responding");
    },
  },
  {
    label: "Creating default agent",
    icon: Bot,
    match: (m) => m.toLowerCase().includes("creating default agent"),
  },
  {
    label: "Finalizing setup",
    icon: CheckCircle,
    match: (m) => m.toLowerCase().includes("setup complete"),
  },
];

// Steps to display (filter out hidden steps)
const VISIBLE_STEPS = DEPLOY_STEPS.filter((s) => !s.hidden);

const DEPLOY_QUIPS = [
  "Convincing electrons to cooperate...",
  "Brewing digital consciousness...",
  "Asking politely for CPU cycles...",
  "Negotiating with the cloud gods...",
  "Downloading extra intelligence...",
  "Calibrating the sarcasm module...",
  "Untangling neural pathways...",
  "Warming up the AI hamster wheel...",
  "Feeding tokens to the model...",
  "Installing a sense of humor...",
  "Compiling personality traits...",
  "Loading existential awareness...",
  "Initializing witty comeback engine...",
  "Teaching the agent to think...",
  "Deploying the vibes...",
  "Spinning up some artificial feelings...",
];

// ── Shared Hook ──────────────────────────────────────────────

type Phase = "deploying" | "complete" | "failed";

function useDeployStream(
  deployId: string,
  onComplete?: () => void,
  onError?: (error: string) => void,
) {
  const [currentStep, setCurrentStep] = useState(0);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("deploying");
  const [elapsed, setElapsed] = useState(0);

  const completeCalled = useRef(false);
  const startTime = useRef(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gatewayPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Centralized cleanup
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (fallbackPollRef.current) {
      clearInterval(fallbackPollRef.current);
      fallbackPollRef.current = null;
    }
    if (gatewayPollRef.current) {
      clearInterval(gatewayPollRef.current);
      gatewayPollRef.current = null;
    }
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  // Shared completion handler
  const handleComplete = useCallback(() => {
    if (completeCalled.current) return;
    completeCalled.current = true;
    setPhase("complete");
    cleanup();
    onComplete?.();
  }, [onComplete, cleanup]);

  // Shared error handler
  const handleError = useCallback(
    (error: string) => {
      if (completeCalled.current) return;
      completeCalled.current = true;
      setPhase("failed");
      cleanup();
      onError?.(error);
    },
    [onError, cleanup],
  );

  // Helper: match log messages to steps
  const processLogMessage = useCallback((msg: string) => {
    if (msg.startsWith("$ ")) return; // skip raw commands

    setLogMessages((prev) => [...prev, msg]);

    for (let i = DEPLOY_STEPS.length - 1; i >= 0; i--) {
      if (DEPLOY_STEPS[i].match(msg)) {
        setCurrentStep((prev) => Math.max(prev, i));
        break;
      }
    }
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    if (phase !== "deploying") return;
    startTime.current = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [phase]);

  // Layer 1: SSE stream (primary)
  useEffect(() => {
    if (!deployId) return;
    completeCalled.current = false;

    const es = new EventSource(`/api/deploy/${deployId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msg: string = data.message || "";

        // Handle terminal status
        if (msg.startsWith("__STATUS__:")) {
          const status = msg.replace("__STATUS__:", "");
          if (status === "complete") {
            handleComplete();
          } else if (status === "failed") {
            handleError("Deploy failed");
          }
          return;
        }

        processLogMessage(msg);
      } catch {}
    };

    // Layer 2: Continuous fallback polling when SSE errors
    es.onerror = () => {
      if (completeCalled.current) return;
      es.close();
      eventSourceRef.current = null;

      // Start continuous polling instead of one-shot
      if (!fallbackPollRef.current) {
        fallbackPollRef.current = setInterval(async () => {
          if (completeCalled.current) {
            if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
            return;
          }
          try {
            const res = await fetch(`/api/deploy/${deployId}`);
            if (res.ok) {
              const deploy = await res.json();
              // Process logs we may have missed
              if (deploy.logs && Array.isArray(deploy.logs)) {
                for (const log of deploy.logs) {
                  const msg = log.message || "";
                  if (!msg.startsWith("$ ")) {
                    // Update step from each log
                    for (let i = DEPLOY_STEPS.length - 1; i >= 0; i--) {
                      if (DEPLOY_STEPS[i].match(msg)) {
                        setCurrentStep((prev) => Math.max(prev, i));
                        break;
                      }
                    }
                  }
                }
                setLogMessages(
                  deploy.logs
                    .map((l: { message?: string }) => l.message || "")
                    .filter((m: string) => !m.startsWith("$ ")),
                );
              }
              if (deploy.status === "complete") {
                handleComplete();
              } else if (deploy.status === "failed") {
                handleError(deploy.error || "Deploy failed");
              }
            }
            // 404 = server restarted, deploy state lost → Layer 3 will catch it
          } catch {}
        }, 3000);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployId]);

  // Layer 3: Gateway-status-based completion (catches HMR/restart)
  useEffect(() => {
    if (!deployId || phase !== "deploying") return;
    const deployStartedAt = Date.now();

    gatewayPollRef.current = setInterval(async () => {
      if (completeCalled.current) {
        if (gatewayPollRef.current) clearInterval(gatewayPollRef.current);
        return;
      }
      // Wait at least 10 seconds before checking gateway status
      // to avoid false positive from a previously-running gateway
      if (Date.now() - deployStartedAt < 10000) return;

      try {
        const res = await fetch("/api/gateway");
        if (!res.ok) return;
        const gw = await res.json();

        // Gateway running + deployId cleared = deploy completed
        if (
          (gw.status === "running" || gw.live) &&
          (gw.deployId === null || gw.deployId === undefined)
        ) {
          // Push step to the end so UI shows full progress
          setCurrentStep(DEPLOY_STEPS.length - 1);
          handleComplete();
        }
        // Gateway error + deployId cleared = deploy failed
        if (gw.status === "error" && (gw.deployId === null || gw.deployId === undefined)) {
          handleError("Gateway setup failed");
        }
      } catch {}
    }, 5000);

    return () => {
      if (gatewayPollRef.current) clearInterval(gatewayPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployId, phase]);

  // Map currentStep through DEPLOY_STEPS to a visible step index
  const visibleStepIndex = (() => {
    // Find which visible step corresponds to the current DEPLOY_STEPS index
    let visibleIdx = 0;
    let stepIdx = 0;
    for (let i = 0; i < DEPLOY_STEPS.length; i++) {
      if (!DEPLOY_STEPS[i].hidden) {
        if (i <= currentStep) visibleIdx = stepIdx;
        stepIdx++;
      } else if (i <= currentStep) {
        // Hidden step reached — map to previous visible step
      }
    }
    return visibleIdx;
  })();

  const progress = Math.min(((visibleStepIndex + 1) / VISIBLE_STEPS.length) * 100, 100);

  return { currentStep: visibleStepIndex, logMessages, progress, phase, elapsed };
}

// ── Full Variant (for Setup Wizard) ──────────────────────────

interface FullProps {
  deployId: string;
  profileName: string;
  variant?: "full";
  onComplete?: () => void;
  onError?: (error: string) => void;
  onRetry?: () => void;
}

function FullProgress({ deployId, profileName, onComplete, onError, onRetry }: FullProps) {
  const { currentStep, progress, phase, elapsed } = useDeployStream(deployId, onComplete, onError);
  const [quipIndex, setQuipIndex] = useState(() => Math.floor(Math.random() * DEPLOY_QUIPS.length));

  // Rotate quips every 4 seconds
  useEffect(() => {
    if (phase !== "deploying") return;
    const interval = setInterval(() => {
      setQuipIndex((prev) => (prev + 1) % DEPLOY_QUIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [phase]);

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s elapsed`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s elapsed`;
  };

  return (
    <div className="text-center max-w-sm mx-auto">
      {/* Orbital spinner */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        {/* Outer ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, ease: "linear", repeat: Infinity }}
          className="absolute inset-0 rounded-full"
          style={{
            border: "2px solid transparent",
            borderTopColor: "var(--mc-accent)",
            opacity: phase === "failed" ? 0.15 : 0.3,
          }}
        />
        {/* Middle ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 5, ease: "linear", repeat: Infinity }}
          className="absolute inset-2 rounded-full"
          style={{
            border: "2px solid transparent",
            borderTopColor: "var(--mc-accent)",
            borderBottomColor: "var(--mc-accent)",
            opacity: phase === "failed" ? 0.1 : 0.2,
          }}
        />
        {/* Inner ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, ease: "linear", repeat: Infinity }}
          className="absolute inset-4 rounded-full"
          style={{
            border: "2px solid transparent",
            borderTopColor: "var(--mc-accent)",
            opacity: phase === "failed" ? 0.1 : 0.4,
          }}
        />
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {phase === "complete" ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Check className="w-8 h-8 text-emerald-400" />
            </motion.div>
          ) : phase === "failed" ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Server className="w-7 h-7" style={{ color: "var(--mc-accent)", opacity: 0.8 }} />
            </motion.div>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--mc-text)" }}>
        {phase === "complete"
          ? `${profileName} is ready`
          : phase === "failed"
            ? "Setup failed"
            : `Setting up ${profileName}`}
      </h2>
      <p className="text-xs mb-6" style={{ color: "var(--mc-muted)" }}>
        {phase === "deploying" && "This may take a couple of minutes"}
        {phase === "complete" && "Your instance is up and running"}
        {phase === "failed" && "Something went wrong during setup"}
      </p>

      {/* Step list */}
      <div className="text-left space-y-1 mb-6">
        {VISIBLE_STEPS.map((step, i) => {
          const isDone = i < currentStep || phase === "complete";
          const isActive = i === currentStep && phase === "deploying";
          const isFailed = i === currentStep && phase === "failed";
          const isPending = i > currentStep;
          const Icon = step.icon;

          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex items-center gap-3 py-1.5 px-3 rounded-lg transition-all duration-300"
              style={{
                backgroundColor: isActive
                  ? "var(--mc-surface)"
                  : "transparent",
              }}
            >
              {/* Icon */}
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {isDone ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <Check className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                  </motion.div>
                ) : isActive ? (
                  <Loader2
                    className="w-4 h-4 animate-spin"
                    style={{ color: "var(--mc-accent)" }}
                  />
                ) : isFailed ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Icon
                    className="w-4 h-4"
                    style={{ color: "var(--mc-muted)", opacity: 0.4 }}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className="text-sm transition-all duration-300"
                style={{
                  color: isDone
                    ? "var(--mc-muted)"
                    : isActive
                      ? "var(--mc-text)"
                      : isFailed
                        ? "var(--mc-text)"
                        : "var(--mc-muted)",
                  opacity: isPending ? 0.4 : isDone ? 0.6 : 1,
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {step.label}
                {isActive && (
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ...
                  </motion.span>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full mb-5">
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--mc-surface)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: "var(--mc-accent)" }}
            initial={{ width: "0%" }}
            animate={{ width: phase === "complete" ? "100%" : `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Quip + elapsed */}
      {phase === "deploying" && (
        <div className="space-y-1.5">
          <div className="h-5 relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={quipIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-xs italic"
                style={{ color: "var(--mc-muted)", opacity: 0.7 }}
              >
                {DEPLOY_QUIPS[quipIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="text-[11px] font-mono" style={{ color: "var(--mc-muted)", opacity: 0.4 }}>
            {formatElapsed(elapsed)}
          </p>
        </div>
      )}

      {/* Retry button on failure */}
      {phase === "failed" && onRetry && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all mt-2 text-white"
          style={{ backgroundColor: "var(--mc-accent)" }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </motion.button>
      )}
    </div>
  );
}

// ── Compact Variant (for Status Bar) ─────────────────────────

interface CompactProps {
  deployId: string;
  profileName: string;
  variant: "compact";
  onComplete?: () => void;
  onError?: (error: string) => void;
}

function CompactProgress({ deployId, profileName, onComplete, onError }: CompactProps) {
  const { currentStep, progress, phase, elapsed } = useDeployStream(deployId, onComplete, onError);

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Spinning icon */}
      <div className="relative w-6 h-6 flex-shrink-0">
        {phase === "deploying" ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, ease: "linear", repeat: Infinity }}
              className="absolute inset-0 rounded-md"
              style={{
                border: "2px solid transparent",
                borderTopColor: "var(--mc-accent)",
                opacity: 0.6,
              }}
            />
            <Server
              className="w-3.5 h-3.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ color: "var(--mc-accent)" }}
            />
          </>
        ) : phase === "complete" ? (
          <Check
            className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-400"
          />
        ) : (
          <XCircle
            className="w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-400"
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium truncate" style={{ color: "var(--mc-text)" }}>
            Setting up {profileName}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={currentStep}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2 }}
              className="text-[11px] truncate"
              style={{ color: "var(--mc-muted)" }}
            >
              {VISIBLE_STEPS[currentStep]?.label || "Preparing..."}
            </motion.span>
          </AnimatePresence>
          {phase === "deploying" && (
            <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "var(--mc-muted)", opacity: 0.4 }}>
              {elapsed}s
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div
          className="w-full h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--mc-surface)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: "var(--mc-accent)" }}
            animate={{ width: phase === "complete" ? "100%" : `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Step dots */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {VISIBLE_STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === currentStep ? 10 : 3,
              height: 3,
              backgroundColor: i <= currentStep ? "var(--mc-accent)" : "var(--mc-border)",
              opacity: i <= currentStep ? 1 : 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Exported Component ───────────────────────────────────────

type GatewayInstallProgressProps = FullProps | CompactProps;

export function GatewayInstallProgress(props: GatewayInstallProgressProps) {
  if (props.variant === "compact") {
    return <CompactProgress {...props} />;
  }
  return <FullProgress {...props} />;
}
