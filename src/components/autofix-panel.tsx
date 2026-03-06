"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  Wrench,
  FileText,
  Terminal,
} from "lucide-react";

interface LogEntry {
  ts: number;
  message: string;
  type?: "text" | "tool" | "system" | "result" | "error";
}

interface AutofixPanelProps {
  sessionId: string;
  onClose: () => void;
}

export function AutofixPanel({ sessionId, onClose }: AutofixPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phase, setPhase] = useState<"running" | "complete" | "failed">("running");
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/autofix/${sessionId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: LogEntry = JSON.parse(event.data);
        const msg = data.message || "";

        if (msg.startsWith("__STATUS__:")) {
          const status = msg.replace("__STATUS__:", "");
          setPhase(status === "complete" ? "complete" : "failed");
          es.close();
          return;
        }

        setLogs((prev) => [...prev, data]);
      } catch {}
    };

    es.onerror = () => {
      // SSE error — fall back to polling
      es.close();
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/autofix/${sessionId}/stream`);
          if (!res.ok) {
            clearInterval(poll);
            setPhase("failed");
          }
        } catch {
          clearInterval(poll);
          setPhase("failed");
        }
      }, 3000);

      return () => clearInterval(poll);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, collapsed]);

  function logIcon(type?: string) {
    switch (type) {
      case "tool":
        return <Wrench className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-accent)" }} />;
      case "error":
        return <XCircle className="w-3 h-3 flex-shrink-0 text-red-400" />;
      case "result":
        return <CheckCircle className="w-3 h-3 flex-shrink-0 text-emerald-400" />;
      case "system":
        return <Terminal className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />;
      default:
        return <FileText className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-muted)", opacity: 0.5 }} />;
    }
  }

  const statusLabel = phase === "running" ? "Fixing..." : phase === "complete" ? "Fixed" : "Failed";
  const StatusIcon = phase === "running" ? Loader2 : phase === "complete" ? CheckCircle : XCircle;
  const statusColor = phase === "running" ? "var(--mc-accent)" : phase === "complete" ? "#22c55e" : "#ef4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="mx-6 mb-4 rounded-xl overflow-hidden"
      style={{
        backgroundColor: "var(--mc-surface)",
        border: "1px solid var(--mc-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
        style={{ borderBottom: collapsed ? "none" : "1px solid var(--mc-border)" }}
      >
        <StatusIcon
          className={`w-3.5 h-3.5 ${phase === "running" ? "animate-spin" : ""}`}
          style={{ color: statusColor }}
        />
        <span className="text-xs font-medium flex-1" style={{ color: "var(--mc-text)" }}>
          Claude Code Auto-Fix
        </span>
        <span className="text-[10px]" style={{ color: statusColor }}>
          {statusLabel}
        </span>
        {collapsed ? (
          <ChevronDown className="w-3 h-3" style={{ color: "var(--mc-muted)" }} />
        ) : (
          <ChevronUp className="w-3 h-3" style={{ color: "var(--mc-muted)" }} />
        )}
        {phase !== "running" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-5 h-5 rounded flex items-center justify-center ml-1"
            style={{ color: "var(--mc-muted)" }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Log viewer */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              ref={scrollRef}
              className="overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed space-y-1"
              style={{ maxHeight: 256, color: "var(--mc-text)" }}
            >
              {logs.length === 0 && phase === "running" && (
                <div className="flex items-center gap-2 py-2" style={{ color: "var(--mc-muted)" }}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Connecting to Claude Code...</span>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <div className="mt-0.5">{logIcon(log.type)}</div>
                  <span
                    className="break-words min-w-0"
                    style={{
                      color:
                        log.type === "error"
                          ? "#ef4444"
                          : log.type === "tool"
                          ? "var(--mc-accent)"
                          : log.type === "result"
                          ? "#22c55e"
                          : "var(--mc-text)",
                    }}
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
