"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Clock,
  AlertTriangle,
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DeletePhase = "confirm" | "deleting" | "success" | "error";

interface DeleteCronJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  scheduleExpr: string;
  agentName?: string;
  agentAvatar?: string;
  onDeleted: () => void;
}

export function DeleteCronJobDialog({
  open,
  onOpenChange,
  jobId,
  jobName,
  scheduleExpr,
  agentName,
  agentAvatar,
  onDeleted,
}: DeleteCronJobDialogProps) {
  const [phase, setPhase] = useState<DeletePhase>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === "deleting" || phase === "success") return;
      if (nextOpen) {
        setPhase("confirm");
        setErrorMessage(null);
      }
      onOpenChange(nextOpen);
    },
    [phase, onOpenChange],
  );

  const handleDelete = useCallback(async () => {
    setPhase("deleting");

    try {
      const res = await fetch("/api/cron", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to delete cron job");
      }

      setPhase("success");
      toast.success(`Deleted "${jobName}"`);

      setTimeout(() => {
        onOpenChange(false);
        onDeleted();
      }, 1200);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(msg);
      setPhase("error");
      toast.error(`Failed to delete "${jobName}": ${msg}`);
    }
  }, [jobId, jobName, onOpenChange, onDeleted]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        style={{
          backgroundColor: "var(--mc-sidebar)",
          borderColor: "var(--mc-border)",
        }}
        showCloseButton={phase === "confirm" || phase === "error"}
        onInteractOutside={(e) => {
          if (phase === "deleting" || phase === "success") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "deleting" || phase === "success") e.preventDefault();
        }}
      >
        <AnimatePresence mode="wait">
          {/* ── Confirm ── */}
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
                <DialogTitle
                  className="text-center"
                  style={{ color: "var(--mc-text)" }}
                >
                  Delete Cron Job
                </DialogTitle>
                <DialogDescription
                  className="text-center"
                  style={{ color: "var(--mc-muted)" }}
                >
                  Are you sure you want to delete this scheduled job?
                </DialogDescription>
              </DialogHeader>

              {/* Job details card */}
              <div
                className="mt-4 p-4 rounded-xl"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  border: "1px solid var(--mc-border)",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  {agentAvatar && (
                    <span className="text-xl leading-none">{agentAvatar}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--mc-text)" }}
                    >
                      {jobName}
                    </div>
                    {agentName && (
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        Agent: {agentName}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock
                    className="w-3 h-3 flex-shrink-0"
                    style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                  />
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--mc-muted)" }}
                  >
                    {scheduleExpr}
                  </span>
                </div>
              </div>

              {/* Warning */}
              <div
                className="mt-3 p-3 rounded-lg flex items-start gap-2.5"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.06)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                }}
              >
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-red-400/80">
                  This will permanently remove the cron job. The job will no
                  longer execute on its schedule. This cannot be undone.
                </span>
              </div>

              <DialogFooter className="mt-5 gap-2 sm:gap-2">
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
                  Delete Job
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {/* ── Deleting ── */}
          {phase === "deleting" && (
            <motion.div
              key="deleting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="py-8 text-center"
            >
              <div className="flex justify-center mb-4">
                <div className="w-10 h-10 border-2 border-red-500/20 border-t-red-400 rounded-full animate-spin" />
              </div>
              <h3
                className="text-sm font-medium"
                style={{ color: "var(--mc-text)" }}
              >
                Deleting cron job...
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--mc-muted)" }}
              >
                Removing &quot;{jobName}&quot;
              </p>
              <button
                onClick={() => setPhase("confirm")}
                className="text-xs flex items-center gap-1 mt-3 mx-auto transition-colors"
                style={{ color: "var(--mc-muted)" }}
              >
                <ArrowLeft className="w-3 h-3" />
                Cancel
              </button>
            </motion.div>
          )}

          {/* ── Success ── */}
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
                Job Deleted
              </h3>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                &quot;{jobName}&quot; has been removed.
              </p>
            </motion.div>
          )}

          {/* ── Error ── */}
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
                Delete Failed
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
