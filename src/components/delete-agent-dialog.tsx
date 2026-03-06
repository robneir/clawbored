"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  FolderOpen,
  Settings,
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

type DeletePhase = "confirm" | "deleting" | "success" | "error";

const DELETE_STEPS = [
  { label: "Removing agent configuration", icon: Settings },
  { label: "Cleaning up workspace files", icon: FolderOpen },
  { label: "Removing from registry", icon: Trash2 },
] as const;

interface DeleteAgentDialogProps {
  agentId: string;
  displayName: string;
  onDeleted: () => void;
  trigger: React.ReactNode;
}

export function DeleteAgentDialog({
  agentId,
  displayName,
  onDeleted,
  trigger,
}: DeleteAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DeletePhase>("confirm");
  const [currentStep, setCurrentStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === "deleting" || phase === "success") return;
      if (nextOpen) {
        setPhase("confirm");
        setCurrentStep(0);
        setErrorMessage(null);
      }
      setOpen(nextOpen);
    },
    [phase]
  );

  const handleDelete = useCallback(async () => {
    setPhase("deleting");
    setCurrentStep(0);

    const stepTimer = setInterval(() => {
      setCurrentStep((prev) =>
        prev < DELETE_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 600);

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Failed with status ${res.status}`);
      }

      clearInterval(stepTimer);
      setCurrentStep(DELETE_STEPS.length);

      await new Promise((r) => setTimeout(r, 400));
      setPhase("success");
      toast.success(`${displayName} deleted`);

      setTimeout(() => {
        setOpen(false);
        onDeleted();
      }, 1200);
    } catch (err) {
      clearInterval(stepTimer);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(msg);
      setPhase("error");
      toast.error(`Failed to delete ${displayName}: ${msg}`);
    }
  }, [agentId, displayName, onDeleted]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        style={{ backgroundColor: "var(--mc-sidebar)", borderColor: "var(--mc-border)" }}
        showCloseButton={phase === "confirm" || phase === "error"}
        onInteractOutside={(e) => {
          if (phase === "deleting" || phase === "success") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "deleting" || phase === "success") e.preventDefault();
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
                <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <DialogTitle className="text-center" style={{ color: "var(--mc-text)" }}>
                  Delete Agent
                </DialogTitle>
                <DialogDescription
                  className="text-center"
                  style={{ color: "var(--mc-muted)" }}
                >
                  This will remove{" "}
                  <span className="font-mono" style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                    {displayName}
                  </span>{" "}
                  including its workspace files and SOUL.md configuration.
                </DialogDescription>
              </DialogHeader>

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
                  variant="destructive"
                  className="flex-1 rounded-xl gap-2"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Agent
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {phase === "deleting" && (
            <motion.div
              key="deleting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="py-6 px-2"
            >
              <div className="flex justify-center mb-6">
                <div className="w-10 h-10 border-2 border-red-500/20 border-t-red-400 rounded-full animate-spin" />
              </div>
              <div className="space-y-3">
                {DELETE_STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isActive = i === currentStep;
                  const isDone = i < currentStep;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: isDone || isActive ? 1 : 0.3, x: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.3 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
                          isDone && "bg-red-500/20",
                          isActive && "bg-red-500/10 border border-red-500/30",
                          !isDone && !isActive && "border"
                        )}
                        style={!isDone && !isActive ? { backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)" } : undefined}
                      >
                        {isDone ? (
                          <Check className="w-3 h-3 text-red-400" />
                        ) : isActive ? (
                          <div className="w-2 h-2 border border-red-400/60 border-t-red-400 rounded-full animate-spin" />
                        ) : (
                          <StepIcon className="w-3 h-3" style={{ color: "var(--mc-muted)", opacity: 0.4 }} />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-sm transition-colors duration-300",
                          isDone && "text-red-400/60 line-through"
                        )}
                        style={isActive ? { color: "var(--mc-text)" } : !isDone ? { color: "var(--mc-muted)", opacity: 0.6 } : undefined}
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
              <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--mc-text)" }}>
                Agent Deleted
              </h3>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                <span className="font-mono">{agentId}</span> has been removed.
              </p>
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
              <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--mc-text)" }}>
                Delete Failed
              </h3>
              <p className="text-sm text-red-400/80 mb-4">{errorMessage}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setPhase("confirm")}
                  className="rounded-xl gap-1.5"
                  style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Go Back
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" className="rounded-xl" style={{ color: "var(--mc-muted)" }}>
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
