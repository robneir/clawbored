"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  FolderOpen,
  Settings,
  Key,
  Check,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type ClonePhase = "confirm" | "cloning" | "success" | "error";

const CLONE_STEPS = [
  { label: "Copying configuration", icon: Settings },
  { label: "Setting up workspace", icon: FolderOpen },
  { label: "Copying authentication", icon: Key },
] as const;

interface CloneAgentDialogProps {
  agentId: string;
  displayName: string;
  onCloned: (cloneId: string) => void;
  trigger: React.ReactNode;
}

export function CloneAgentDialog({
  agentId,
  displayName,
  onCloned,
  trigger,
}: CloneAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ClonePhase>("confirm");
  const [currentStep, setCurrentStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clonedId, setClonedId] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === "cloning") return;
      if (nextOpen) {
        setPhase("confirm");
        setCurrentStep(0);
        setErrorMessage(null);
        setClonedId(null);
      }
      setOpen(nextOpen);
    },
    [phase]
  );

  const handleClone = useCallback(async () => {
    setPhase("cloning");
    setCurrentStep(0);

    const stepTimer = setInterval(() => {
      setCurrentStep((prev) =>
        prev < CLONE_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 500);

    try {
      const res = await fetch(`/api/agents/${agentId}/clone`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Failed with status ${res.status}`);
      }

      const clone = await res.json();
      clearInterval(stepTimer);
      setCurrentStep(CLONE_STEPS.length);
      setClonedId(clone.id);

      await new Promise((r) => setTimeout(r, 400));
      setPhase("success");
      toast.success(`Cloned as ${clone.displayName}`);
    } catch (err) {
      clearInterval(stepTimer);
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(msg);
      setPhase("error");
      toast.error(`Failed to clone ${displayName}: ${msg}`);
    }
  }, [agentId, displayName]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        style={{
          backgroundColor: "var(--mc-sidebar)",
          borderColor: "var(--mc-border)",
        }}
        showCloseButton={phase === "confirm" || phase === "error"}
        onInteractOutside={(e) => {
          if (phase === "cloning" || phase === "success") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "cloning") e.preventDefault();
        }}
      >
        <AnimatePresence mode="wait">
          {phase === "confirm" && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader className="items-center">
                <div
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2"
                  style={{
                    backgroundColor: "var(--mc-surface)",
                    border: "1px solid var(--mc-border)",
                  }}
                >
                  <Copy className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
                </div>
                <DialogTitle
                  className="text-center"
                  style={{ color: "var(--mc-text)" }}
                >
                  Clone Agent
                </DialogTitle>
                <DialogDescription
                  className="text-center"
                  style={{ color: "var(--mc-muted)" }}
                >
                  Create a copy of{" "}
                  <span
                    className="font-mono"
                    style={{ color: "var(--mc-text)", opacity: 0.7 }}
                  >
                    {displayName}
                  </span>{" "}
                  with the same configuration.
                </DialogDescription>
              </DialogHeader>

              <div
                className="mt-4 rounded-xl p-3 space-y-2 text-xs"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  border: "1px solid var(--mc-border)",
                  color: "var(--mc-muted)",
                }}
              >
                <p>The clone will include:</p>
                <ul className="space-y-1 ml-3">
                  <li>SOUL.md personality and instructions</li>
                  <li>Model and template configuration</li>
                  <li>Authentication profiles</li>
                </ul>
                <p className="pt-1" style={{ opacity: 0.7 }}>
                  Chat history and sessions will not be copied.
                </p>
              </div>

              <DialogFooter className="mt-4 gap-2 sm:gap-2">
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="flex-1 rounded-xl"
                    style={{
                      color: "var(--mc-muted)",
                      border: "1px solid var(--mc-border)",
                    }}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  className="flex-1 rounded-xl gap-2 text-white"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                  onClick={handleClone}
                >
                  <Copy className="w-4 h-4" />
                  Clone Agent
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {phase === "cloning" && (
            <motion.div
              key="cloning"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="py-6 px-2"
            >
              <div className="flex justify-center mb-6">
                <div
                  className="w-10 h-10 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "var(--mc-border)",
                    borderTopColor: "var(--mc-accent)",
                  }}
                />
              </div>
              <div className="space-y-3">
                {CLONE_STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isActive = i === currentStep;
                  const isDone = i < currentStep;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{
                        opacity: isDone || isActive ? 1 : 0.3,
                        x: 0,
                      }}
                      transition={{ delay: i * 0.1, duration: 0.3 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
                          isDone && "bg-emerald-500/20",
                          isActive &&
                            "border"
                        )}
                        style={
                          isActive
                            ? {
                                backgroundColor: "var(--mc-surface)",
                                borderColor: "var(--mc-border)",
                              }
                            : !isDone
                            ? {
                                backgroundColor: "var(--mc-surface)",
                                border: "1px solid var(--mc-border)",
                              }
                            : undefined
                        }
                      >
                        {isDone ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : isActive ? (
                          <div
                            className="w-2 h-2 border rounded-full animate-spin"
                            style={{
                              borderColor: "var(--mc-border)",
                              borderTopColor: "var(--mc-accent)",
                            }}
                          />
                        ) : (
                          <StepIcon
                            className="w-3 h-3"
                            style={{
                              color: "var(--mc-muted)",
                              opacity: 0.4,
                            }}
                          />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-sm transition-colors duration-300",
                          isDone && "text-emerald-400/60"
                        )}
                        style={
                          isActive
                            ? { color: "var(--mc-text)" }
                            : !isDone
                            ? { color: "var(--mc-muted)", opacity: 0.6 }
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
            </motion.div>
          )}

          {phase === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
              </motion.div>
              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--mc-text)" }}
              >
                Agent Cloned
              </h3>
              <p className="text-sm mb-4" style={{ color: "var(--mc-muted)" }}>
                Created as{" "}
                <span className="font-mono" style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                  {clonedId}
                </span>
              </p>
              <div className="flex gap-2 justify-center">
                <Link href={`/agents/${clonedId}`}>
                  <Button
                    className="rounded-xl gap-2 text-white"
                    style={{ backgroundColor: "var(--mc-accent)" }}
                    onClick={() => {
                      setOpen(false);
                      if (clonedId) onCloned(clonedId);
                    }}
                  >
                    View Agent
                  </Button>
                </Link>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    style={{ color: "var(--mc-muted)" }}
                  >
                    Close
                  </Button>
                </DialogClose>
              </div>
            </motion.div>
          )}

          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="py-6 text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--mc-text)" }}
              >
                Clone Failed
              </h3>
              <p className="text-sm text-red-400/80 mb-4">{errorMessage}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setPhase("confirm")}
                  className="rounded-xl gap-1.5"
                  style={{
                    color: "var(--mc-muted)",
                    border: "1px solid var(--mc-border)",
                  }}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Go Back
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    style={{ color: "var(--mc-muted)" }}
                  >
                    Close
                  </Button>
                </DialogClose>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
