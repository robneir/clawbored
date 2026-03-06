"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Bot,
  Activity,
  MessageSquare,
  Rocket,
  Tag,
  Play,
  Square,
  Trash2,
  User,
  Wrench,
  CheckCircle,
  Zap,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatewayActionDialog } from "@/components/gateway-action-dialog";
import { DeployAnimation } from "@/components/deploy-animation";
import { useGateway } from "@/components/gateway-provider";
import { useLive } from "@/components/live-provider";
import { toast } from "sonner";

interface Agent {
  id: string;
  displayName: string;
  template: string;
  model: string;
  status: string;
  createdAt: string;
  avatar: string;
}

interface ActivityEvent {
  id: string;
  kind: string;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: number;
  preview: string;
  meta?: Record<string, string>;
}

const EVENT_ICONS: Record<string, { icon: typeof User; color: string }> = {
  user_message: { icon: User, color: "#6366f1" },
  assistant_response: { icon: Bot, color: "#22c55e" },
  tool_call: { icon: Wrench, color: "#eab308" },
  tool_result: { icon: CheckCircle, color: "#3b82f6" },
  model_change: { icon: Zap, color: "#a855f7" },
  session_start: { icon: Play, color: "#22c55e" },
};

function formatEventDesc(event: ActivityEvent): string {
  switch (event.kind) {
    case "user_message":
      return `Sent message to ${event.agentName}`;
    case "assistant_response":
      return `${event.agentName} responded`;
    case "tool_call":
      return `${event.agentName} used ${event.meta?.toolName || "a tool"}`;
    case "tool_result":
      return "Tool completed";
    case "model_change":
      return `Model → ${event.meta?.model || "unknown"}`;
    case "session_start":
      return `Session started for ${event.agentName}`;
    default:
      return event.kind;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── SVG Activity Chart ─────────────────────────────────────────── */

function ActivityChart({
  events,
  hours = 24,
}: {
  events: ActivityEvent[];
  hours?: number;
}) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const counts = new Array(hours).fill(0);
    for (const e of events) {
      const hoursAgo = (now - e.timestamp) / 3600000;
      const idx = Math.floor(hoursAgo);
      if (idx >= 0 && idx < hours) counts[hours - 1 - idx] += 1;
    }
    return counts;
  }, [events, hours]);

  const max = Math.max(...buckets, 1);
  const w = 100;
  const h = 40;
  const stepX = w / (buckets.length - 1 || 1);

  const points = buckets.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 4) - 2,
  }));

  // Smooth path using cardinal spline
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillD =
    d +
    ` L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mc-accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--mc-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#chartFill)" />
      <path
        d={d}
        fill="none"
        stroke="var(--mc-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── Mini Sparkline (for stat card) ─────────────────────────────── */

function Sparkline({ events }: { events: ActivityEvent[] }) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const counts = new Array(12).fill(0); // 12 x 2h buckets
    for (const e of events) {
      const hoursAgo = (now - e.timestamp) / 3600000;
      const idx = Math.floor(hoursAgo / 2);
      if (idx >= 0 && idx < 12) counts[11 - idx] += 1;
    }
    return counts;
  }, [events]);

  const max = Math.max(...buckets, 1);
  const barW = 3;
  const gap = 2;
  const w = buckets.length * (barW + gap) - gap;
  const h = 20;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      {buckets.map((v, i) => {
        const barH = Math.max((v / max) * (h - 2), 1);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1}
            fill="var(--mc-accent)"
            opacity={0.4 + (v / max) * 0.6}
          />
        );
      })}
    </svg>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const router = useRouter();
  const { triggerTransition, gateway, refresh: refreshGateway } = useGateway();
  const live = useLive();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullActivity, setFullActivity] = useState<ActivityEvent[]>([]);

  // Sync agents from live data
  useEffect(() => {
    if (live.agents.length > 0) {
      setAgents(live.agents as unknown as Agent[]);
      setLoading(false);
    }
  }, [live.agents]);

  // Sync activity from live data (SSE provides last 50)
  useEffect(() => {
    if (live.activity.length > 0) {
      setEvents(live.activity as ActivityEvent[]);
    }
  }, [live.activity]);

  // Fetch full 200-event activity for charts on mount
  useEffect(() => {
    async function fetchFullActivity() {
      try {
        const res = await fetch("/api/activity?limit=200");
        if (res.ok) {
          const data = await res.json();
          setFullActivity(data.events || []);
        }
      } catch {}
    }
    fetchFullActivity();
  }, []);

  // Once we get SSE data, mark loading done
  useEffect(() => {
    if (live.connected && loading) setLoading(false);
  }, [live.connected, loading]);

  async function handleStart() {
    try {
      const res = await fetch("/api/gateway/start", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to start gateway");
      }
      toast.success("Gateway started");
      refreshGateway();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start gateway");
    }
  }

  const gwLive = gateway?.live ?? false;
  const gwNotSetup = gateway?.status === "not_setup";
  const gwDeploying = gateway?.status === "setup" && !!gateway?.deployId;

  // Use the larger dataset for stats/charts, falling back to live SSE data
  const chartEvents = fullActivity.length > 0 ? fullActivity : events;

  // Compute stats
  const now = Date.now();
  const eventsToday = useMemo(
    () => chartEvents.filter((e) => now - e.timestamp < 86400000),
    [chartEvents, now]
  );
  const activeSessions = useMemo(() => {
    const sessions = new Set<string>();
    for (const e of eventsToday) sessions.add(`${e.agentId}:${e.sessionId}`);
    return sessions.size;
  }, [eventsToday]);
  const recentFeed = events.slice(0, 8);
  const latestEventTs = events.length > 0 ? events[0].timestamp : 0;
  const isLive = now - latestEventTs < 300000; // Activity within last 5 min

  // ── No profile: full-page welcome ──
  if (!gwDeploying && gwNotSetup) {
    return (
      <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-6xl mx-auto flex items-center justify-center min-h-[80vh]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              backgroundColor: "var(--mc-surface)",
              border: "1px solid var(--mc-border)",
            }}
          >
            <Rocket className="w-8 h-8" style={{ color: "var(--mc-accent)", opacity: 0.8 }} />
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight mb-3">
            Welcome to Clawboard
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--mc-muted)" }}>
            Create your first OpenClaw instance to start building and chatting with AI agents.
          </p>
          <Link href="/deploy">
            <Button
              className="rounded-xl px-8 h-11 text-sm font-medium gap-2 text-white"
              style={{ backgroundColor: "var(--mc-accent)" }}
            >
              <Rocket className="w-4 h-4" />
              Create Instance
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1
            className="font-heading text-3xl font-semibold tracking-tight"
            style={{ color: "var(--mc-text)" }}
          >
            {gateway?.displayName && gateway.displayName !== "Default"
              ? `${gateway.displayName} Dashboard`
              : "Dashboard"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
            Manage your AI agents
          </p>
        </div>
      </motion.div>

      {/* Profile Deploying */}
      {gwDeploying && gateway?.deployId && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 max-w-xl mx-auto"
        >
          <DeployAnimation
            deployId={gateway.deployId}
            instanceName={gateway.profileName || "Profile"}
            displayName={gateway.displayName || gateway.profileName || "Profile"}
            onComplete={refreshGateway}
            onError={() => refreshGateway()}
          />
        </motion.div>
      )}

      {/* Profile controls when set up but stopped */}
      {!gwDeploying && !gwNotSetup && !gwLive && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 mb-6 flex items-center gap-4"
        >
          <div className="status-dot-stopped" />
          <div className="flex-1">
            <span className="text-sm font-medium">Instance Stopped</span>
            <span className="text-xs ml-2" style={{ color: "var(--mc-muted)" }}>
              Start to chat with agents
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStart}
            className="rounded-xl gap-1.5 text-sm"
            style={{ color: "var(--mc-accent)", border: "1px solid var(--mc-border)" }}
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </Button>
          <GatewayActionDialog
            action="delete"
            onComplete={refreshGateway}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5 text-sm text-red-400/60 hover:text-red-400"
                style={{ border: "1px solid rgba(239, 68, 68, 0.1)" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            }
          />
        </motion.div>
      )}

      {/* Profile running banner with stop option */}
      {gwLive && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 mb-6 flex items-center gap-4"
        >
          <div className="status-dot-running" />
          <div className="flex-1">
            <span className="text-sm font-medium text-emerald-400">Instance Running</span>
            <span className="text-xs ml-2" style={{ color: "var(--mc-muted)" }}>
              Port {gateway?.port}
            </span>
          </div>
          <GatewayActionDialog
            action="stop"
            onComplete={refreshGateway}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5 text-sm"
                style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
              >
                <Square className="w-3 h-3" />
                Stop
              </Button>
            }
          />
          <GatewayActionDialog
            action="delete"
            onComplete={refreshGateway}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5 text-sm text-red-400/60 hover:text-red-400"
                style={{ border: "1px solid rgba(239, 68, 68, 0.1)" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            }
          />
        </motion.div>
      )}

      {/* Stats Row */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
        style={{ opacity: gwDeploying ? 0.4 : 1, pointerEvents: gwDeploying ? "none" : "auto", transition: "opacity 0.3s" }}
      >
        {/* Agents */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Total Agents
            </span>
            <Bot className="w-4 h-4" style={{ color: "var(--mc-text)", opacity: 0.8 }} />
          </div>
          <div className="font-heading text-2xl font-semibold">
            {agents.length}
          </div>
        </motion.div>

        {/* Gateway */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Instance
            </span>
            <Activity className={`w-4 h-4 ${gwLive ? "text-emerald-400" : ""}`} style={gwLive ? undefined : { color: "var(--mc-muted)" }} />
          </div>
          <div className="font-heading text-2xl font-semibold">
            {gwLive ? "Running" : "Stopped"}
          </div>
        </motion.div>

        {/* Events Today */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Events Today
            </span>
            <div className="flex items-center gap-2">
              {activeSessions > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}>
                  {activeSessions} session{activeSessions !== 1 ? "s" : ""}
                </span>
              )}
              <Zap className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
            </div>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="font-heading text-2xl font-semibold">
              {eventsToday.length}
            </div>
            <div className="w-24 h-5 flex-shrink-0">
              <Sparkline events={chartEvents} />
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Activity Chart + Live Feed */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8 overflow-hidden"
        style={{ opacity: gwDeploying ? 0.4 : 1, pointerEvents: gwDeploying ? "none" : "auto", transition: "opacity 0.3s" }}
      >
        {/* Activity Chart */}
        <motion.div variants={item} className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Activity — Last 24h
            </span>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--mc-accent)", opacity: 0.6 }}
              />
              <span className="text-[10px]" style={{ color: "var(--mc-muted)" }}>Events/hr</span>
            </div>
          </div>
          <div className="h-28">
            <ActivityChart events={chartEvents} />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>24h ago</span>
            <span className="text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>Now</span>
          </div>
        </motion.div>

        {/* Live Feed */}
        <motion.div variants={item} className="glass-card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                Live Feed
              </span>
              {isLive && (
                <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full text-emerald-400"
                  style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  live
                </span>
              )}
            </div>
            <Link
              href="/activity"
              className="flex items-center gap-1 text-[11px] transition-colors"
              style={{ color: "var(--mc-muted)" }}
            >
              View All
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentFeed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="w-8 h-8 mb-2" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
              <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                No activity yet — interact with an agent to see events here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {recentFeed.map((event, i) => {
                  const cfg = EVENT_ICONS[event.kind] || EVENT_ICONS.user_message;
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "var(--mc-surface)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${cfg.color}15` }}
                      >
                        <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" style={{ color: "var(--mc-text)" }}>
                          {formatEventDesc(event)}
                        </p>
                      </div>
                      <span
                        className="text-[10px] flex-shrink-0"
                        style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                      >
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Agent Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }} />
        </div>
      ) : agents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-12 text-center"
        >
          <Bot className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
          <h3 className="font-heading text-xl font-semibold mb-2">
            No agents yet
          </h3>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "var(--mc-muted)" }}>
            Create your first AI agent to get started.
          </p>
          <Link href="/agents/new">
            <Button className="rounded-xl px-6 h-10 text-sm font-medium gap-2 text-white" style={{ backgroundColor: "var(--mc-accent)" }}>
              <Plus className="w-4 h-4" />
              Create Your First Agent
            </Button>
          </Link>
        </motion.div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
              Agents
            </span>
          </div>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                variants={item}
                className="glass-card-hover p-5 cursor-pointer group"
                onClick={() => {
                  triggerTransition({
                    title: agent.displayName || agent.id,
                    subtitle: "Loading agent...",
                    avatar: agent.avatar || undefined,
                  }, 1200);
                  router.push(`/agents/${agent.id}`);
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "var(--mc-surface)" }}
                  >
                    {agent.avatar ? (
                      <span className="text-lg leading-none">{agent.avatar}</span>
                    ) : (
                      <Bot className="w-4 h-4" style={{ color: "var(--mc-muted)", opacity: 0.6 }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {agent.displayName || agent.id}
                    </h3>
                    <p className="text-xs mt-0.5 truncate font-mono" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                      {agent.id}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--mc-muted)", opacity: 0.6 }}>Template</span>
                    <span className="truncate ml-2" style={{ color: "var(--mc-text)", opacity: 0.6 }}>{agent.template}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "var(--mc-muted)", opacity: 0.6 }}>Model</span>
                    <span className="truncate ml-2" style={{ color: "var(--mc-text)", opacity: 0.6 }}>{agent.model}</span>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1.5 pt-3 border-t"
                  style={{ borderColor: "var(--mc-border)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {gwLive && (
                    <Link href={`/chat?agent=${encodeURIComponent(agent.id)}`} onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="hover:text-blue-400 gap-1 text-[11px] h-7 px-2"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        <MessageSquare className="w-2.5 h-2.5" />
                        Chat
                      </Button>
                    </Link>
                  )}
                  <div className="flex-1" />
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                    <Tag className="w-2.5 h-2.5" />
                    {agent.template}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}
