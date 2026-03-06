"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Stethoscope, CheckCircle, AlertTriangle, XCircle, X, Loader2, Sparkles } from "lucide-react";

interface DiagnosticCheck {
  name: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

interface DiagnosticResult {
  checks: DiagnosticCheck[];
  llmAnalysis: string | null;
  fixesApplied: string[];
  tier: "agent" | "local-cli" | "deterministic";
}

export function DiagnoseButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleDiagnose() {
    if (running) return;
    setRunning(true);
    setResult(null);
    setOpen(true);

    try {
      const res = await fetch("/api/diagnose", { method: "POST" });
      if (res.ok) {
        const data: DiagnosticResult = await res.json();
        setResult(data);
      } else {
        setResult({
          checks: [{ name: "Diagnostics", status: "error", detail: "Failed to run diagnostics" }],
          llmAnalysis: null,
          fixesApplied: [],
          tier: "deterministic",
        });
      }
    } catch {
      setResult({
        checks: [{ name: "Diagnostics", status: "error", detail: "Network error" }],
        llmAnalysis: null,
        fixesApplied: [],
        tier: "deterministic",
      });
    }
    setRunning(false);
  }

  const allOk = result?.checks.every((c) => c.status === "ok") ?? false;
  const errorCount = result?.checks.filter((c) => c.status === "error").length ?? 0;
  const warnCount = result?.checks.filter((c) => c.status === "warn").length ?? 0;

  function statusIcon(status: string) {
    switch (status) {
      case "ok":
        return <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />;
      case "warn":
        return <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />;
      case "error":
        return <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />;
      default:
        return null;
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleDiagnose}
        disabled={running}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: "var(--mc-muted)" }}
        title="Run diagnostics"
      >
        {running ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Stethoscope className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
            style={{
              backgroundColor: "var(--mc-bg)",
              border: "1px solid var(--mc-border)",
              width: 340,
              maxHeight: 460,
            }}
          >
            {/* Header */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--mc-border)" }}
            >
              <span
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)" }}
              >
                Diagnostics
              </span>
              <button
                onClick={() => setOpen(false)}
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ color: "var(--mc-muted)" }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
              {/* Loading state */}
              {running && !result && (
                <div className="px-3 py-8 text-center">
                  <Loader2
                    className="w-5 h-5 mx-auto mb-2 animate-spin"
                    style={{ color: "var(--mc-accent)" }}
                  />
                  <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                    Running diagnostics...
                  </p>
                </div>
              )}

              {/* Results */}
              {result && (
                <>
                  {/* Summary */}
                  <div
                    className="px-3 py-3 flex items-center gap-2"
                    style={{ borderBottom: "1px solid var(--mc-border)" }}
                  >
                    {allOk ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                      {allOk
                        ? "All systems healthy"
                        : `${errorCount} error${errorCount !== 1 ? "s" : ""}, ${warnCount} warning${warnCount !== 1 ? "s" : ""}`}
                    </span>
                    {result.fixesApplied.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full text-emerald-400" style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}>
                        {result.fixesApplied.length} fixed
                      </span>
                    )}
                  </div>

                  {/* Check list */}
                  <div className="px-3 py-2">
                    {result.checks.map((check) => (
                      <div key={check.name} className="flex items-start gap-2 py-1.5">
                        <div className="mt-0.5">{statusIcon(check.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                            {check.name}
                          </div>
                          <div
                            className="text-[11px] mt-0.5 break-words"
                            style={{ color: "var(--mc-muted)" }}
                          >
                            {check.detail.length > 120 ? check.detail.slice(0, 120) + "..." : check.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Fixes applied */}
                  {result.fixesApplied.length > 0 && (
                    <div
                      className="px-3 py-2"
                      style={{ borderTop: "1px solid var(--mc-border)" }}
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--mc-muted)" }}>
                        Fixes Applied
                      </div>
                      {result.fixesApplied.map((fix, i) => (
                        <div key={i} className="text-[11px] py-0.5 flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          <span style={{ color: "var(--mc-text)" }}>{fix}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LLM Analysis */}
                  {result.llmAnalysis && (
                    <div
                      className="px-3 py-2"
                      style={{ borderTop: "1px solid var(--mc-border)" }}
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: "var(--mc-muted)" }}>
                        <Sparkles className="w-3 h-3" />
                        AI Analysis
                        <span className="text-[9px] opacity-60">
                          ({result.tier === "agent" ? "via agent" : "local CLI"})
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: "var(--mc-text)" }}>
                        {result.llmAnalysis}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
