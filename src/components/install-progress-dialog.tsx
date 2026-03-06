"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface InstallProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  title: string;
  onComplete?: () => void;
}

export function InstallProgressDialog({
  open,
  onOpenChange,
  jobId,
  title,
  onComplete,
}: InstallProgressDialogProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"running" | "complete" | "failed">("running");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId || !open) return;

    setLogs([]);
    setStatus("running");

    const eventSource = new EventSource(`/api/skills/install/${jobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        const msg = entry.message as string;

        if (msg.startsWith("__STATUS__:")) {
          const s = msg.replace("__STATUS__:", "");
          setStatus(s as "complete" | "failed");
          eventSource.close();
          return;
        }

        setLogs((prev) => [...prev, msg]);
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, open]);

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function handleClose() {
    if (status !== "running") {
      onComplete?.();
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-lg"
        style={{
          backgroundColor: "var(--mc-bg)",
          borderColor: "var(--mc-border)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--mc-text)" }}>{title}</DialogTitle>
        </DialogHeader>

        {/* Log output */}
        <div
          className="h-64 overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--mc-surface)",
            border: "1px solid var(--mc-border)",
            color: "var(--mc-muted)",
          }}
        >
          {logs.length === 0 && status === "running" && (
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
              />
              <span>Starting...</span>
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {/* Status footer */}
        <div className="flex items-center justify-between">
          {status === "running" && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--mc-muted)" }}>
              <div
                className="w-4 h-4 border-2 rounded-full animate-spin"
                style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
              />
              Installing...
            </div>
          )}
          {status === "complete" && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              Installation complete
            </div>
          )}
          {status === "failed" && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <XCircle className="w-4 h-4" />
              Installation failed
            </div>
          )}

          <Button
            onClick={handleClose}
            className="rounded-xl h-9 px-4 text-sm"
            style={{
              backgroundColor: status === "running" ? "var(--mc-surface)" : "var(--mc-accent)",
              color: status === "running" ? "var(--mc-muted)" : "white",
              borderColor: "var(--mc-border)",
              border: status === "running" ? "1px solid var(--mc-border)" : "none",
            }}
          >
            {status === "running" ? "Cancel" : "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
