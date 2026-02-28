"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Terminal, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LogEntry {
  ts: number;
  message: string;
}

type DeployStatus = "idle" | "deploying" | "complete" | "failed";

export default function DeployPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState("general");
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;

    setStatus("deploying");
    setLogs([]);
    setError(null);

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, displayName: displayName || name, template }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start deployment");
        setStatus("failed");
        return;
      }

      const data = await res.json();
      const deployId = data.deployId;

      // Connect to SSE stream
      const eventSource = new EventSource(`/api/deploy/${deployId}/stream`);

      eventSource.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          if (entry.message.startsWith("__STATUS__:")) {
            const s = entry.message.replace("__STATUS__:", "");
            setStatus(s === "complete" ? "complete" : "failed");
            eventSource.close();
            return;
          }
          setLogs((prev) => [...prev, entry]);
        } catch {}
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Check final status
        fetch(`/api/deploy/${deployId}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.status === "complete") setStatus("complete");
            else if (d.status === "failed") {
              setStatus("failed");
              setError(d.error || "Deployment failed");
            }
          })
          .catch(() => {
            setStatus("failed");
            setError("Lost connection to deployment stream");
          });
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed");
      setStatus("failed");
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Deploy Agent
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Set up a new AI agent instance
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <form onSubmit={handleDeploy} className="glass-card p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white/60 text-xs uppercase tracking-wider">
                Instance Name
              </Label>
              <Input
                id="name"
                placeholder="my-agent"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                disabled={status === "deploying"}
                className="rounded-xl h-11 text-sm" style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
              />
              <p className="text-white/25 text-xs">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-white/60 text-xs uppercase tracking-wider">
                Display Name
              </Label>
              <Input
                id="displayName"
                placeholder="My Agent"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={status === "deploying"}
                className="rounded-xl h-11 text-sm" style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template" className="text-white/60 text-xs uppercase tracking-wider">
                Template
              </Label>
              <select
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                disabled={status === "deploying"}
                className="w-full border rounded-xl h-11 text-sm px-3 outline-none" style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
              >
                <option value="general">General Assistant</option>
                <option value="coding">Coding Agent</option>
                <option value="research">Research Agent</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <Button
              type="submit"
              disabled={!name || status === "deploying"}
              className="w-full rounded-xl h-11 text-sm font-medium gap-2 mt-2 text-white" style={{ backgroundColor: "var(--mc-accent)" }}
            >
              {status === "deploying" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Deploy Instance
                </>
              )}
            </Button>

            {/* Status badges */}
            <AnimatePresence>
              {status === "complete" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">
                    Deployment complete!
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => router.push(`/instances/${name}`)}
                    className="ml-auto text-emerald-400 hover:text-emerald-300"
                  >
                    View Instance
                  </Button>
                </motion.div>
              )}
              {status === "failed" && error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>

        {/* Terminal */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="terminal h-[500px] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Terminal className="w-4 h-4 text-white/40" />
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">
                Deployment Log
              </span>
              {status === "deploying" && (
                <div className="ml-auto status-dot-deploying" />
              )}
              {status === "complete" && (
                <CheckCircle className="ml-auto w-4 h-4 text-emerald-400" />
              )}
              {status === "failed" && (
                <XCircle className="ml-auto w-4 h-4 text-red-400" />
              )}
            </div>
            <div
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-4 space-y-1"
            >
              {logs.length === 0 && status === "idle" && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white/20 text-sm">
                    Deployment logs will appear here...
                  </p>
                </div>
              )}
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-mono text-[13px] leading-relaxed"
                >
                  <span className="text-white/20 mr-3 select-none">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span
                    className={
                      log.message.startsWith("$")
                        ? "text-emerald-400"
                        : log.message.startsWith("Error")
                          ? "text-red-400"
                          : "text-white/70"
                    }
                  >
                    {log.message}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
