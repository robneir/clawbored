"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Repeat,
  Timer,
  CalendarClock,
  CheckCircle,
  XCircle,
  Bot,
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

type Phase = "form" | "creating" | "success" | "error";
type ScheduleKind = "cron" | "every" | "at";
type PayloadKind = "agentTurn" | "systemEvent";

interface Agent {
  id: string;
  displayName: string;
  avatar: string;
}

interface CreateCronJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onCreated: () => void;
}

const SCHEDULE_OPTIONS: { kind: ScheduleKind; label: string; icon: typeof Repeat; placeholder: string; hint: string }[] = [
  { kind: "every", label: "Interval", icon: Timer, placeholder: "5m", hint: "e.g. 30s, 5m, 1h, 2d" },
  { kind: "cron", label: "Cron", icon: Repeat, placeholder: "0 */6 * * *", hint: "Standard 5-field cron expression" },
  { kind: "at", label: "One-shot", icon: CalendarClock, placeholder: "+2h", hint: "ISO date or relative (+2h, +30m)" },
];

export function CreateCronJobDialog({
  open,
  onOpenChange,
  agents,
  onCreated,
}: CreateCronJobDialogProps) {
  const [phase, setPhase] = useState<Phase>("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("every");
  const [scheduleExpr, setScheduleExpr] = useState("");
  const [agentId, setAgentId] = useState("");
  const [payloadKind, setPayloadKind] = useState<PayloadKind>("agentTurn");
  const [message, setMessage] = useState("");
  const [event, setEvent] = useState("");
  const [sessionTarget, setSessionTarget] = useState<"main" | "isolated">("main");
  const [tz, setTz] = useState("");

  const resetForm = useCallback(() => {
    setPhase("form");
    setErrorMessage(null);
    setName("");
    setScheduleKind("every");
    setScheduleExpr("");
    setAgentId("");
    setPayloadKind("agentTurn");
    setMessage("");
    setEvent("");
    setSessionTarget("main");
    setTz("");
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === "creating" || phase === "success") return;
      if (nextOpen) resetForm();
      onOpenChange(nextOpen);
    },
    [phase, onOpenChange, resetForm],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !scheduleExpr.trim()) {
      toast.error("Name and schedule expression are required");
      return;
    }

    setPhase("creating");

    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scheduleKind,
          scheduleExpr: scheduleExpr.trim(),
          agentId: agentId || undefined,
          payloadKind,
          message: payloadKind === "agentTurn" ? message.trim() || undefined : undefined,
          event: payloadKind === "systemEvent" ? event.trim() || undefined : undefined,
          sessionTarget,
          tz: scheduleKind === "cron" && tz.trim() ? tz.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to create cron job");
      }

      setPhase("success");
      toast.success(`Created "${name.trim()}"`);

      setTimeout(() => {
        onOpenChange(false);
        onCreated();
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(msg);
      setPhase("error");
      toast.error(`Failed to create job: ${msg}`);
    }
  }, [name, scheduleKind, scheduleExpr, agentId, payloadKind, message, event, sessionTarget, tz, onOpenChange, onCreated]);

  const currentScheduleOption = SCHEDULE_OPTIONS.find((o) => o.kind === scheduleKind)!;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        style={{
          backgroundColor: "var(--mc-sidebar)",
          borderColor: "var(--mc-border)",
        }}
        showCloseButton={phase === "form" || phase === "error"}
        onInteractOutside={(e) => {
          if (phase === "creating" || phase === "success") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "creating" || phase === "success") e.preventDefault();
        }}
      >
        <AnimatePresence mode="wait">
          {/* ── Form ── */}
          {phase === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <DialogHeader className="items-center">
                <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: "color-mix(in srgb, var(--mc-accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--mc-accent) 20%, transparent)" }}>
                  <Plus className="w-5 h-5" style={{ color: "var(--mc-accent)" }} />
                </div>
                <DialogTitle className="text-center" style={{ color: "var(--mc-text)" }}>
                  New Cron Job
                </DialogTitle>
                <DialogDescription className="text-center" style={{ color: "var(--mc-muted)" }}>
                  Create a new scheduled task
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                {/* Name */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    Job Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Report"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: "var(--mc-surface)",
                      border: "1px solid var(--mc-border)",
                      color: "var(--mc-text)",
                    }}
                  />
                </div>

                {/* Schedule kind picker */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    Schedule Type
                  </label>
                  <div className="flex gap-1.5 rounded-xl p-1" style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}>
                    {SCHEDULE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = scheduleKind === opt.kind;
                      return (
                        <button
                          key={opt.kind}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{
                            backgroundColor: active ? "var(--mc-sidebar)" : "transparent",
                            color: active ? "var(--mc-text)" : "var(--mc-muted)",
                            border: active ? "1px solid var(--mc-border)" : "1px solid transparent",
                          }}
                          onClick={() => {
                            setScheduleKind(opt.kind);
                            setScheduleExpr("");
                          }}
                        >
                          <Icon className="w-3 h-3" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule expression */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    {currentScheduleOption.label} Expression
                  </label>
                  <input
                    type="text"
                    value={scheduleExpr}
                    onChange={(e) => setScheduleExpr(e.target.value)}
                    placeholder={currentScheduleOption.placeholder}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-colors"
                    style={{
                      backgroundColor: "var(--mc-surface)",
                      border: "1px solid var(--mc-border)",
                      color: "var(--mc-text)",
                    }}
                  />
                  <p className="text-[11px] mt-1" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                    {currentScheduleOption.hint}
                  </p>
                </div>

                {/* Timezone (cron only) */}
                {scheduleKind === "cron" && (
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                      Timezone <span style={{ opacity: 0.5 }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={tz}
                      onChange={(e) => setTz(e.target.value)}
                      placeholder="e.g. America/New_York"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                      style={{
                        backgroundColor: "var(--mc-surface)",
                        border: "1px solid var(--mc-border)",
                        color: "var(--mc-text)",
                      }}
                    />
                  </div>
                )}

                {/* Agent */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    Agent <span style={{ opacity: 0.5 }}>(optional)</span>
                  </label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={{
                      backgroundColor: "var(--mc-surface)",
                      border: "1px solid var(--mc-border)",
                      color: "var(--mc-text)",
                    }}
                  >
                    <option value="">No agent</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.avatar} {a.displayName || a.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payload */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    Payload
                  </label>
                  <div className="flex gap-1.5 mb-2 rounded-xl p-1" style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}>
                    {([
                      { kind: "agentTurn" as PayloadKind, label: "Agent Message", icon: Bot },
                      { kind: "systemEvent" as PayloadKind, label: "System Event", icon: Repeat },
                    ]).map((opt) => {
                      const Icon = opt.icon;
                      const active = payloadKind === opt.kind;
                      return (
                        <button
                          key={opt.kind}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{
                            backgroundColor: active ? "var(--mc-sidebar)" : "transparent",
                            color: active ? "var(--mc-text)" : "var(--mc-muted)",
                            border: active ? "1px solid var(--mc-border)" : "1px solid transparent",
                          }}
                          onClick={() => setPayloadKind(opt.kind)}
                        >
                          <Icon className="w-3 h-3" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {payloadKind === "agentTurn" ? (
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Message to send to the agent..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none transition-colors"
                      style={{
                        backgroundColor: "var(--mc-surface)",
                        border: "1px solid var(--mc-border)",
                        color: "var(--mc-text)",
                      }}
                    />
                  ) : (
                    <input
                      type="text"
                      value={event}
                      onChange={(e) => setEvent(e.target.value)}
                      placeholder="e.g. heartbeat, wake"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                      style={{
                        backgroundColor: "var(--mc-surface)",
                        border: "1px solid var(--mc-border)",
                        color: "var(--mc-text)",
                      }}
                    />
                  )}
                </div>

                {/* Session target */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--mc-muted)" }}>
                    Session
                  </label>
                  <div className="flex gap-1.5 rounded-xl p-1" style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}>
                    {(["main", "isolated"] as const).map((target) => (
                      <button
                        key={target}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize"
                        style={{
                          backgroundColor: sessionTarget === target ? "var(--mc-sidebar)" : "transparent",
                          color: sessionTarget === target ? "var(--mc-text)" : "var(--mc-muted)",
                          border: sessionTarget === target ? "1px solid var(--mc-border)" : "1px solid transparent",
                        }}
                        onClick={() => setSessionTarget(target)}
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                </div>
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
                  className="flex-1 rounded-xl gap-2"
                  style={{
                    backgroundColor: "var(--mc-accent)",
                    color: "white",
                  }}
                  onClick={handleCreate}
                  disabled={!name.trim() || !scheduleExpr.trim()}
                >
                  <Plus className="w-4 h-4" />
                  Create Job
                </Button>
              </DialogFooter>
            </motion.div>
          )}

          {/* ── Creating ── */}
          {phase === "creating" && (
            <motion.div
              key="creating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="py-8 text-center"
            >
              <div className="flex justify-center mb-4">
                <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: "color-mix(in srgb, var(--mc-accent) 20%, transparent)", borderTopColor: "var(--mc-accent)" }} />
              </div>
              <h3 className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                Creating cron job...
              </h3>
              <p className="text-xs mt-1" style={{ color: "var(--mc-muted)" }}>
                Setting up &quot;{name}&quot;
              </p>
              <button
                onClick={() => setPhase("form")}
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
              <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--mc-text)" }}>
                Job Created
              </h3>
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                &quot;{name}&quot; has been scheduled.
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
              <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--mc-text)" }}>
                Creation Failed
              </h3>
              <p className="text-sm text-red-400/80 mb-4">{errorMessage}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setPhase("form")}
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
