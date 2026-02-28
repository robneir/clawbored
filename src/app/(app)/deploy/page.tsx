"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Terminal, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeployTerminal, DeployTerminalHandle } from "@/components/deploy-terminal";

type DeployStatus = "idle" | "deploying" | "complete" | "failed";

export default function DeployPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState("general");
  const [status, setStatus] = useState<DeployStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const terminalRef = useRef<DeployTerminalHandle>(null);

  function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!name || status === "deploying") return;
    setError(null);
    terminalRef.current?.deploy({ name, displayName: displayName || name, template });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Deploy Agent
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
          Set up a new AI agent instance
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form — narrower */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <form onSubmit={handleDeploy} className="glass-card p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                Instance Name
              </Label>
              <Input
                id="name"
                placeholder="my-agent"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                disabled={status === "deploying"}
                className="rounded-xl h-11 text-sm"
                style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
              />
              <p className="text-xs" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-xs uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                Display Name
              </Label>
              <Input
                id="displayName"
                placeholder="My Agent"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={status === "deploying"}
                className="rounded-xl h-11 text-sm"
                style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template" className="text-xs uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                Template
              </Label>
              <select
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                disabled={status === "deploying"}
                className="w-full border rounded-xl h-11 text-sm px-3 outline-none"
                style={{ backgroundColor: "var(--mc-surface)", borderColor: "var(--mc-border)", color: "var(--mc-text)" }}
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
              className="w-full rounded-xl h-11 text-sm font-medium gap-2 mt-2 text-white"
              style={{ backgroundColor: "var(--mc-accent)" }}
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

            <AnimatePresence>
              {status === "complete" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">Done!</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/instances/${name}`)}
                    className="ml-auto text-emerald-400 hover:text-emerald-300 text-xs"
                  >
                    View →
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

        {/* Terminal — wider */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-3"
        >
          <div className="glass-card overflow-hidden" style={{ height: "520px" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--mc-border)" }}>
              {/* macOS window dots */}
              <div className="flex items-center gap-1.5 mr-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <Terminal className="w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--mc-muted)" }}>
                Deployment Terminal
              </span>
              {status === "deploying" && (
                <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin" style={{ color: "var(--mc-accent)" }} />
              )}
              {status === "complete" && (
                <CheckCircle className="ml-auto w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div style={{ height: "calc(100% - 45px)" }}>
              <DeployTerminal
                ref={terminalRef}
                onDeployStart={() => setStatus("deploying")}
                onComplete={(result) => {
                  setStatus(result.success ? "complete" : "failed");
                  if (result.error) setError(result.error);
                }}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
