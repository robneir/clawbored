"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  CheckCircle,
  XCircle,
  Server,
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type DeployPhase = "checking" | "idle" | "deploying" | "complete" | "failed";

export default function DeployPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<DeployPhase>("checking");
  const [instanceName, setInstanceName] = useState("");
  const [instancePort, setInstancePort] = useState("19100");
  const [showPortEdit, setShowPortEdit] = useState(false);
  const [deployId, setDeployId] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);

  // Deploy progress state
  const [currentStep, setCurrentStep] = useState(0);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [quipIndex, setQuipIndex] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDeploying = phase === "deploying" || (phase === "failed" && !!deployId);

  // Skip the initial check — deploy page should always be accessible
  // so users can create additional instances from the instance dropdown.
  useEffect(() => {
    setPhase("idle");
    // Fetch recommended port from existing profiles
    fetch("/api/gateway/profiles")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.recommendedPort) setInstancePort(String(data.recommendedPort));
      })
      .catch(() => {});
  }, []);

  // Client-side timeout: if deploying for > 3 minutes, force-fail
  useEffect(() => {
    if (phase !== "deploying" || !deployId) return;
    const timeout = setTimeout(() => {
      setPhase("failed");
      toast.error("Setup is taking too long. Please try again.");
    }, 180000);
    return () => clearTimeout(timeout);
  }, [phase, deployId]);

  // Rotate quips during deploy
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
    if (!deployId || phase === "idle" || phase === "checking") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/deploy/${deployId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.logs && Array.isArray(data.logs)) {
          let maxStep = 0;
          for (const log of data.logs) {
            const step = logToStep(log.message || "");
            if (step !== null && step > maxStep) maxStep = step;
          }
          setCurrentStep(maxStep);

          const errorLog = data.logs.find(
            (l: { message: string }) =>
              l.message?.startsWith("Error:") ||
              l.message?.startsWith("Deploy failed:")
          );
          if (errorLog) setDeployError(errorLog.message);
        }

        if (data.status === "complete") {
          setCurrentStep(DEPLOY_STEPS.length);
          setPhase("complete");
          setNavigating(true);
          toast.success("Instance created successfully!");
          setTimeout(() => router.push("/"), 2000);
        } else if (data.status === "failed") {
          setPhase("failed");
          setDeployError(data.error || "Deployment failed");
          toast.error(`Setup failed: ${data.error || "Deployment failed"}`);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deployId, phase, router]);

  // Stop polling when no longer deploying
  useEffect(() => {
    if (phase !== "deploying" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  const handleCreate = useCallback(async () => {
    if (!instanceName || phase === "deploying") return;
    setPhase("deploying");
    setCurrentStep(0);
    setDeployError(null);

    try {
      const res = await fetch("/api/gateway/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName: instanceName,
          port: Number(instancePort) || 19100,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Failed with status ${res.status}`);
      }

      const result = await res.json();
      setDeployId(result.deployId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start setup");
      setPhase("failed");
    }
  }, [instanceName, instancePort, phase]);

  function handleRetry() {
    setPhase("idle");
    setDeployId(null);
    setCurrentStep(0);
    setDeployError(null);
    setNavigating(false);
  }

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-2xl mx-auto min-h-[calc(100vh-4rem)] flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          New OpenClaw Instance
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
          Create a new OpenClaw instance
        </p>
      </motion.div>

      <div className="flex-1 flex flex-col items-center gap-6">
        <motion.div
          layout
          className="w-full max-w-lg"
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <div className="glass-card overflow-hidden">
            {/* ── Header Icon ── */}
            <div className="flex justify-center pt-6 pb-2">
              <div className="relative">
                {/* Spinning rings (only during deploy) */}
                <AnimatePresence>
                  {phase === "deploying" && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 rounded-full orbit-ring-outer"
                        style={{
                          border: "2px solid transparent",
                          borderTopColor: "var(--mc-accent)",
                          borderRightColor: "var(--mc-accent)",
                          opacity: 0.5,
                        }}
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-1.5 rounded-full orbit-ring-middle"
                        style={{
                          border: "2px solid transparent",
                          borderTopColor: "var(--mc-accent)",
                          opacity: 0.3,
                        }}
                      />
                    </>
                  )}
                </AnimatePresence>

                <motion.div
                  layout
                  className="w-12 h-12 rounded-2xl flex items-center justify-center relative z-10"
                  style={{
                    backgroundColor: phase === "failed"
                      ? "rgba(239, 68, 68, 0.1)"
                      : "var(--mc-surface)",
                    border: `1px solid ${
                      phase === "failed"
                        ? "rgba(239, 68, 68, 0.2)"
                        : "var(--mc-border)"
                    }`,
                  }}
                >
                  {phase === "failed" ? (
                    <XCircle className="w-6 h-6 text-red-400" />
                  ) : phase === "deploying" ? (
                    <Loader2
                      className="w-6 h-6 animate-spin"
                      style={{ color: "var(--mc-accent)" }}
                    />
                  ) : (
                    <Server className="w-6 h-6" style={{ color: "var(--mc-accent)" }} />
                  )}
                </motion.div>
              </div>
            </div>

            {/* ── Title ── */}
            <div className="text-center px-6 pb-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase === "failed" ? "failed" : phase === "deploying" ? "deploying" : "idle"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 className="font-heading text-lg font-semibold mb-1">
                    {phase === "failed"
                      ? "Setup Failed"
                      : phase === "deploying"
                        ? `Setting up ${instanceName}`
                        : "New Instance"}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                    {phase === "failed"
                      ? "Something went wrong during setup"
                      : phase === "deploying"
                        ? "This may take a couple of minutes"
                        : "This will create and configure a new OpenClaw instance"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ── Form Section ── */}
            <motion.div
              layout
              className="px-6 overflow-hidden"
              animate={{
                height: isDeploying ? 0 : "auto",
                opacity: isDeploying ? 0 : 1,
              }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              <div className="space-y-4 pb-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="instanceName"
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "var(--mc-muted)" }}
                  >
                    Instance Name
                  </Label>
                  <Input
                    id="instanceName"
                    placeholder="my-project"
                    value={instanceName}
                    onChange={(e) =>
                      setInstanceName(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                      )
                    }
                    className="rounded-xl h-11 text-sm"
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
                  Creates ~/.openclaw-{instanceName || "name"}
                </p>

                <div className="space-y-2">
                  {showPortEdit ? (
                    <>
                      <Label
                        htmlFor="port"
                        className="text-xs uppercase tracking-wider"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        Port
                      </Label>
                      <Input
                        id="port"
                        placeholder="19100"
                        value={instancePort}
                        onChange={(e) =>
                          setInstancePort(e.target.value.replace(/[^0-9]/g, ""))
                        }
                        className="rounded-xl h-11 text-sm"
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
                        Port: <span style={{ color: "var(--mc-text)" }}>{instancePort}</span>
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

                <Button
                  onClick={handleCreate}
                  disabled={!instanceName}
                  className="w-full rounded-xl h-11 text-sm font-medium gap-2 mt-2 text-white"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  <Rocket className="w-4 h-4" />
                  Create & Set Up
                </Button>
              </div>
            </motion.div>

            {/* ── Deploy Progress Section ── */}
            <AnimatePresence>
              {isDeploying && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-6">
                    {/* Instance info pill */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg mb-5"
                      style={{ backgroundColor: "var(--mc-surface)" }}
                    >
                      <Server className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
                      <span className="text-xs font-mono truncate" style={{ color: "var(--mc-muted)" }}>
                        ~/.openclaw-{instanceName}
                      </span>
                      <span
                        className="text-xs ml-auto flex-shrink-0"
                        style={{ color: "var(--mc-muted)", opacity: 0.5 }}
                      >
                        port {instancePort}
                      </span>
                    </div>

                    {/* Step list */}
                    <div className="space-y-2">
                      {DEPLOY_STEPS.map((step, i) => {
                        const StepIcon = step.icon;
                        const isDone = i < currentStep;
                        const isActive = i === currentStep && phase === "deploying";
                        const isFailed = phase === "failed" && i === currentStep;

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{
                              opacity: isDone || isActive || isFailed ? 1 : 0.25,
                              x: 0,
                            }}
                            transition={{ delay: i * 0.05, duration: 0.25 }}
                            className="flex items-center gap-3"
                          >
                            <div
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500",
                                isFailed && "border border-red-500/40 bg-red-500/10",
                                !isDone && !isActive && !isFailed && "border"
                              )}
                              style={
                                isDone
                                  ? { backgroundColor: "var(--mc-surface)" }
                                  : isActive
                                    ? {
                                        backgroundColor: "var(--mc-surface)",
                                        borderColor: "var(--mc-accent)",
                                        border: "1px solid var(--mc-accent)",
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
                                  className="w-3 h-3"
                                  style={{ color: "var(--mc-accent)" }}
                                />
                              ) : isActive ? (
                                <Loader2
                                  className="w-3 h-3 animate-spin"
                                  style={{ color: "var(--mc-accent)" }}
                                />
                              ) : isFailed ? (
                                <XCircle className="w-3 h-3 text-red-400" />
                              ) : (
                                <StepIcon
                                  className="w-3 h-3"
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

                    {/* Progress bar */}
                    <div className="mt-5">
                      <div
                        className="w-full h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--mc-surface)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: phase === "failed" ? "rgb(239, 68, 68)" : "var(--mc-accent)" }}
                          initial={{ width: "0%" }}
                          animate={{
                            width: `${Math.min(((currentStep + 1) / DEPLOY_STEPS.length) * 100, 100)}%`,
                          }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Quip or error */}
                    <div className="h-8 mt-3">
                      <AnimatePresence mode="wait">
                        {phase === "deploying" && (
                          <motion.div
                            key={DEPLOY_QUIPS[quipIndex]}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="text-center"
                          >
                            <span
                              className="text-xs"
                              style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                            >
                              {DEPLOY_QUIPS[quipIndex]}
                            </span>
                          </motion.div>
                        )}
                        {phase === "failed" && deployError && (
                          <motion.div
                            key="error"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center"
                          >
                            <p className="text-xs text-red-400/80 leading-relaxed">
                              {deployError}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Retry button */}
                    {phase === "failed" && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex justify-center mt-2"
                      >
                        <Button
                          variant="ghost"
                          onClick={handleRetry}
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Success transition overlay */}
      <AnimatePresence>
        {navigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "var(--mc-bg)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: 0.2,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.3,
                  type: "spring",
                  stiffness: 300,
                  damping: 15,
                }}
                className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                }}
              >
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </motion.div>
              <h2 className="font-heading text-2xl font-semibold mb-2">
                Instance Ready
              </h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-sm"
                style={{ color: "var(--mc-muted)" }}
              >
                Loading dashboard...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
