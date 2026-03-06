"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Square,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
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

type ActionPhase = "confirm" | "processing" | "success" | "error";

type GatewayAction = "stop" | "delete";

const ACTION_CONFIG = {
  stop: {
    icon: Square,
    title: "Stop Instance",
    iconBg: "rgba(234, 179, 8, 0.1)",
    iconBorder: "rgba(234, 179, 8, 0.2)",
    iconColor: "#facc15",
    description: "This will stop the running OpenClaw instance.",
    details: [
      "The gateway process will be terminated",
      "Agents will go offline and stop responding to chat",
      "All configuration and files remain untouched",
      "You can start the instance again at any time",
    ],
    confirmLabel: "Stop Instance",
    confirmVariant: "default" as const,
    confirmStyle: { backgroundColor: "#ca8a04", color: "white" },
    successTitle: "Instance Stopped",
    successMessage: "The instance has been stopped. You can restart it from the dashboard.",
    toastSuccess: "Instance stopped",
  },
  delete: {
    icon: Trash2,
    title: "Delete Instance",
    iconBg: "rgba(239, 68, 68, 0.1)",
    iconBorder: "rgba(239, 68, 68, 0.2)",
    iconColor: "#f87171",
    description: "This will permanently delete this OpenClaw instance and all its files.",
    details: [
      "The gateway process will be stopped",
      "The entire OpenClaw instance directory will be deleted",
      "All agent workspaces, SOUL.md files, and configs will be lost",
      "This action cannot be undone",
    ],
    confirmLabel: "Delete Everything",
    confirmVariant: "destructive" as const,
    confirmStyle: undefined,
    successTitle: "Instance Deleted",
    successMessage: "The instance and all associated files have been permanently removed.",
    toastSuccess: "Instance deleted",
  },
} as const;

interface GatewayActionDialogProps {
  action: GatewayAction;
  trigger: React.ReactNode;
  onComplete: () => void;
}

export function GatewayActionDialog({
  action,
  trigger,
  onComplete,
}: GatewayActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ActionPhase>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const config = ACTION_CONFIG[action];
  const Icon = config.icon;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === "processing" || phase === "success") return;
      if (nextOpen) {
        setPhase("confirm");
        setErrorMessage(null);
      }
      setOpen(nextOpen);
    },
    [phase]
  );

  const handleConfirm = useCallback(async () => {
    setPhase("processing");

    try {
      let res: Response;

      if (action === "stop") {
        res = await fetch("/api/gateway/stop", { method: "POST" });
      } else {
        res = await fetch("/api/gateway?deleteFiles=true", { method: "DELETE" });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Failed to ${action} profile`);
      }

      setPhase("success");
      toast.success(config.toastSuccess);

      setTimeout(() => {
        setOpen(false);
        onComplete();
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(msg);
      setPhase("error");
      toast.error(`Failed to ${action} profile: ${msg}`);
    }
  }, [action, config.toastSuccess, onComplete]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        style={{ backgroundColor: "var(--mc-sidebar)", borderColor: "var(--mc-border)" }}
        showCloseButton={phase === "confirm" || phase === "error"}
        onInteractOutside={(e) => {
          if (phase === "processing" || phase === "success") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "processing" || phase === "success") e.preventDefault();
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
                    backgroundColor: config.iconBg,
                    border: `1px solid ${config.iconBorder}`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: config.iconColor }} />
                </div>
                <DialogTitle className="text-center" style={{ color: "var(--mc-text)" }}>
                  {config.title}
                </DialogTitle>
                <DialogDescription
                  className="text-center"
                  style={{ color: "var(--mc-muted)" }}
                >
                  {config.description}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-2.5">
                {config.details.map((detail, i) => {
                  const isWarning = detail.includes("cannot be undone") || detail.includes("will be lost") || detail.includes("will be deleted");
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{
                          backgroundColor: isWarning ? "#f87171" : "var(--mc-muted)",
                          opacity: isWarning ? 1 : 0.4,
                        }}
                      />
                      <span
                        className="text-sm"
                        style={{
                          color: isWarning ? "#f87171" : "var(--mc-muted)",
                        }}
                      >
                        {detail}
                      </span>
                    </div>
                  );
                })}
              </div>

              {action === "delete" && (
                <div
                  className="mt-4 p-3 rounded-lg flex items-start gap-2.5"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.06)",
                    border: "1px solid rgba(239, 68, 68, 0.15)",
                  }}
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-400/80">
                    This will permanently remove the OpenClaw instance directory and all agent data from your disk.
                  </span>
                </div>
              )}

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
                  variant={config.confirmVariant}
                  className="flex-1 rounded-xl gap-2"
                  style={config.confirmStyle}
                  onClick={handleConfirm}
                >
                  <Icon className="w-4 h-4" />
                  {config.confirmLabel}
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {phase === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="py-8 text-center"
            >
              <div className="flex justify-center mb-4">
                <div
                  className="w-10 h-10 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: config.iconBorder,
                    borderTopColor: config.iconColor,
                  }}
                />
              </div>
              <h3 className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                {action === "stop" && "Stopping..."}
                {action === "delete" && "Deleting instance..."}
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--mc-muted)" }}>
                This may take a moment
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
                {config.successTitle}
              </h3>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                {config.successMessage}
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
                Action Failed
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
