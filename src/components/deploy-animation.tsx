"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Box,
  Settings,
  KeyRound,
  FolderOpen,
  Download,
  Play,
  Wifi,
  Check,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEPLOY_STEPS = [
  { label: "Checking environment", icon: Search },
  { label: "Creating instance", icon: Box },
  { label: "Configuring gateway", icon: Settings },
  { label: "Setting up credentials", icon: KeyRound },
  { label: "Building workspace", icon: FolderOpen },
  { label: "Installing services", icon: Download },
  { label: "Starting gateway", icon: Play },
  { label: "Verifying connection", icon: Wifi },
] as const;

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

function logToStep(msg: string): number | null {
  const lower = msg.toLowerCase();
  if (lower.includes("checking openclaw") || lower.includes("installing openclaw"))
    return 0;
  if (lower.includes("creating instance") || lower.includes("onboard"))
    return 1;
  if (lower.includes("configuring gateway") || lower.includes("config updated"))
    return 2;
  if (
    lower.includes("configuring agent") ||
    lower.includes("auth-profiles") ||
    lower.includes("auth configured")
  )
    return 3;
  if (lower.includes("creating workspace")) return 4;
  if (lower.includes("installing gateway") || lower.includes("doctor"))
    return 5;
  if (lower.includes("starting gateway")) return 6;
  if (
    lower.includes("verifying") ||
    lower.includes("gateway alive") ||
    lower.includes("gateway not responding")
  )
    return 7;
  return null;
}

interface DeployAnimationProps {
  deployId: string;
  instanceName: string;
  displayName: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onRetry?: () => void;
}

export function DeployAnimation({
  deployId,
  instanceName,
  displayName,
  onComplete,
  onError,
  onRetry,
}: DeployAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<"deploying" | "complete" | "failed">(
    "deploying"
  );
  const [error, setError] = useState<string | null>(null);
  const [quipIndex, setQuipIndex] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate quips
  useEffect(() => {
    if (phase !== "deploying") return;
    setQuipIndex(Math.floor(Math.random() * DEPLOY_QUIPS.length));
    const interval = setInterval(() => {
      setQuipIndex((prev) => (prev + 1) % DEPLOY_QUIPS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [phase]);

  // Poll deployment status
  useEffect(() => {
    if (!deployId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/deploy/${deployId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Map logs to highest step
        if (data.logs && Array.isArray(data.logs)) {
          let maxStep = 0;
          for (const log of data.logs) {
            const step = logToStep(log.message || "");
            if (step !== null && step > maxStep) maxStep = step;
          }
          setCurrentStep(maxStep);
        }

        // Check for error logs
        if (data.logs && Array.isArray(data.logs)) {
          const errorLog = data.logs.find(
            (l: { message: string }) =>
              l.message?.startsWith("Error:") ||
              l.message?.startsWith("Deploy failed:")
          );
          if (errorLog) setError(errorLog.message);
        }

        if (data.status === "complete") {
          setCurrentStep(DEPLOY_STEPS.length);
          setPhase("complete");
          onComplete?.();
        } else if (data.status === "failed") {
          setPhase("failed");
          setError(data.error || "Deployment failed");
          onError?.(data.error || "Deployment failed");
        }
      } catch {
        // Ignore poll errors
      }
    };

    poll(); // Initial fetch
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deployId, onComplete, onError]);

  // Stop polling when no longer deploying
  useEffect(() => {
    if (phase !== "deploying" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  return (
    <div className="glass-card p-8">
      {/* Orbital spinner */}
      <div className="flex justify-center mb-8">
        <div className="relative w-20 h-20">
          <div
            className="absolute inset-0 rounded-full orbit-ring-outer"
            style={{
              border: "2px solid transparent",
              borderTopColor: "var(--mc-accent)",
              borderRightColor: "var(--mc-accent)",
              opacity: phase === "failed" ? 0.2 : 0.6,
            }}
          />
          <div
            className="absolute inset-2 rounded-full orbit-ring-middle"
            style={{
              border: "2px solid transparent",
              borderTopColor: "var(--mc-accent)",
              opacity: phase === "failed" ? 0.15 : 0.4,
            }}
          />
          <div
            className="absolute inset-4 rounded-full orbit-ring-inner"
            style={{
              border: "2px solid transparent",
              borderTopColor: "var(--mc-accent)",
              borderBottomColor: "var(--mc-accent)",
              opacity: phase === "failed" ? 0.1 : 0.8,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {phase === "failed" ? (
              <XCircle className="w-6 h-6 text-red-400" />
            ) : phase === "complete" ? (
              <CheckCircle
                className="w-6 h-6"
                style={{ color: "var(--mc-accent)" }}
              />
            ) : (
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: "var(--mc-accent)" }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Instance name */}
      <div className="text-center mb-6">
        <h2 className="font-heading text-lg font-semibold">
          {phase === "failed"
            ? "Deployment Failed"
            : phase === "complete"
            ? "Deployment Complete"
            : `Deploying ${displayName || instanceName}`}
        </h2>
      </div>

      {/* Steps */}
      <div className="space-y-2.5 mb-6">
        {DEPLOY_STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isDone = i < currentStep;
          const isActive = i === currentStep && phase === "deploying";
          const isFailed = phase === "failed" && i === currentStep;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{
                opacity: isDone || isActive || isFailed ? 1 : 0.25,
                x: 0,
              }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="flex items-center gap-3"
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500",
                  isDone && "bg-[var(--mc-accent)]/15",
                  isActive &&
                    "border border-[var(--mc-accent)]/40 bg-[var(--mc-accent)]/5",
                  isFailed && "border border-red-500/40 bg-red-500/10",
                  !isDone && !isActive && !isFailed && "border"
                )}
                style={
                  isDone
                    ? { backgroundColor: "rgba(99, 102, 241, 0.15)" }
                    : isActive
                    ? {
                        backgroundColor: "rgba(99, 102, 241, 0.05)",
                        borderColor: "rgba(99, 102, 241, 0.4)",
                      }
                    : !isFailed
                    ? {
                        backgroundColor: "var(--mc-surface)",
                        borderColor: "var(--mc-border)",
                      }
                    : undefined
                }
              >
                {isDone ? (
                  <Check
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--mc-accent)" }}
                  />
                ) : isActive ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    style={{ color: "var(--mc-accent)" }}
                  />
                ) : isFailed ? (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <StepIcon
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--mc-muted)", opacity: 0.4 }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-sm transition-all duration-500",
                  isDone && "line-through opacity-50",
                  isActive && "font-medium",
                  isFailed && "text-red-400"
                )}
                style={
                  isDone
                    ? { color: "var(--mc-accent)" }
                    : isActive
                    ? { color: "var(--mc-text)" }
                    : !isFailed
                    ? { color: "var(--mc-muted)", opacity: 0.5 }
                    : undefined
                }
              >
                {step.label}
                {isActive && "..."}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Witty quip or error */}
      <div className="h-10">
        <AnimatePresence mode="wait">
          {phase === "deploying" && (
            <motion.div
              key={DEPLOY_QUIPS[quipIndex]}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <span
                className="text-xs font-medium"
                style={{ color: "var(--mc-muted)" }}
              >
                {DEPLOY_QUIPS[quipIndex]}
              </span>
            </motion.div>
          )}
          {phase === "failed" && error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="text-xs text-red-400/80 mb-3 leading-relaxed">
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Retry button */}
      {phase === "failed" && onRetry && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center gap-3 mt-2"
        >
          <Button
            variant="ghost"
            onClick={onRetry}
            className="rounded-xl gap-2 text-sm"
            style={{
              color: "var(--mc-muted)",
              border: "1px solid var(--mc-border)",
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </Button>
        </motion.div>
      )}
    </div>
  );
}

export { DEPLOY_STEPS };
