"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  Server,
  Play,
  Square,
  Trash2,
  ExternalLink,
  Activity,
  Zap,
  CircleDot,
  CheckSquare,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Instance {
  name: string;
  displayName: string;
  port: number;
  token: string | null;
  template: string;
  createdAt: string;
  status: string;
  live?: boolean;
}

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
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchInstances() {
    try {
      const res = await fetch("/api/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(
    name: string,
    action: "start" | "stop" | "delete"
  ) {
    try {
      if (action === "delete") {
        await fetch(`/api/instances/${name}`, { method: "DELETE" });
      } else {
        await fetch(`/api/instances/${name}/${action}`, { method: "POST" });
      }
      fetchInstances();
    } catch {}
  }

  async function handleBulkAction(action: "stop" | "delete") {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const promises = Array.from(selected).map((name) =>
        action === "delete"
          ? fetch(`/api/instances/${name}`, { method: "DELETE" })
          : fetch(`/api/instances/${name}/${action}`, { method: "POST" })
      );
      await Promise.allSettled(promises);
      setSelected(new Set());
      fetchInstances();
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleSelect(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === instances.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(instances.map((i) => i.name)));
    }
  }

  const running = instances.filter((i) => i.live).length;
  const stopped = instances.filter((i) => !i.live).length;

  const stats = [
    {
      label: "Total Instances",
      value: instances.length,
      icon: Server,
      color: "text-white/80",
    },
    {
      label: "Running",
      value: running,
      icon: Activity,
      color: "text-emerald-400",
    },
    {
      label: "Stopped",
      value: stopped,
      icon: CircleDot,
      color: "text-zinc-500",
    },
    {
      label: "API Cost",
      value: "$0.00",
      icon: Zap,
      color: "text-amber-400",
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
            Manage your AI agent instances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chat">
            <Button
              variant="ghost"
              className="rounded-xl px-4 h-10 text-sm font-medium gap-2"
              style={{ color: "var(--mc-muted)", borderColor: "var(--mc-border)", border: "1px solid" }}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
          </Link>
          <Link href="/deploy">
            <Button className="rounded-xl px-5 h-10 text-sm font-medium gap-2 text-white" style={{ backgroundColor: "var(--mc-accent)" }}>
              <Rocket className="w-4 h-4" />
              Deploy Agent
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-4 gap-4 mb-8"
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={item}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--mc-muted)" }}>
                {stat.label}
              </span>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="font-heading text-2xl font-semibold">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mb-4"
          >
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{
                backgroundColor: "var(--mc-surface)",
                border: "1px solid var(--mc-border)",
              }}
            >
              <CheckSquare className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("stop")}
                disabled={bulkLoading}
                className="text-white/50 hover:text-white/80 gap-1.5 text-xs"
              >
                <Square className="w-3 h-3" />
                Stop All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleBulkAction("delete")}
                disabled={bulkLoading}
                className="text-red-400/60 hover:text-red-400 gap-1.5 text-xs"
              >
                <Trash2 className="w-3 h-3" />
                Delete All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="text-white/40 text-xs"
              >
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instance Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : instances.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-12 text-center"
        >
          <Server className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="font-heading text-xl font-semibold mb-2">
            No instances yet
          </h3>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "var(--mc-muted)" }}>
            Deploy your first AI agent to get started. It only takes a minute.
          </p>
          <Link href="/deploy">
            <Button className="rounded-xl px-6 h-10 text-sm font-medium gap-2 text-white" style={{ backgroundColor: "var(--mc-accent)" }}>
              <Rocket className="w-4 h-4" />
              Deploy Your First Agent
            </Button>
          </Link>
        </motion.div>
      ) : (
        <>
          {/* Select all toggle */}
          {instances.length > 1 && (
            <div className="flex items-center mb-3">
              <button
                onClick={selectAll}
                className="text-xs flex items-center gap-1.5 transition-colors"
                style={{ color: "var(--mc-muted)" }}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {selected.size === instances.length ? "Deselect all" : "Select all"}
              </button>
            </div>
          )}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {instances.map((inst) => (
              <motion.div
                key={inst.name}
                variants={item}
                className="glass-card-hover p-5 cursor-pointer group relative"
                onClick={() => router.push(`/instances/${inst.name}`)}
                style={{
                  outline: selected.has(inst.name) ? "2px solid var(--mc-accent)" : "none",
                  outlineOffset: "-2px",
                }}
              >
                {/* Select checkbox */}
                <button
                  onClick={(e) => toggleSelect(inst.name, e)}
                  className="absolute top-3 right-3 w-5 h-5 rounded border flex items-center justify-center transition-all"
                  style={{
                    borderColor: selected.has(inst.name)
                      ? "var(--mc-accent)"
                      : "var(--mc-border)",
                    backgroundColor: selected.has(inst.name)
                      ? "var(--mc-accent)"
                      : "transparent",
                  }}
                >
                  {selected.has(inst.name) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="flex items-start gap-3 mb-4 pr-6">
                  <div
                    className={
                      inst.live ? "status-dot-running" : "status-dot-stopped"
                    }
                    style={{ marginTop: "4px" }}
                  />
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {inst.displayName || inst.name}
                    </h3>
                    <p className="text-white/30 text-xs mt-0.5 truncate">{inst.name}</p>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/30">Port</span>
                    <span className="text-white/60 font-mono">{inst.port}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/30">Template</span>
                    <span className="text-white/60 truncate ml-2">{inst.template}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/30">Status</span>
                    <span className={inst.live ? "text-emerald-400 text-xs" : "text-white/40 text-xs"}>
                      {inst.live ? "Running" : "Stopped"}
                    </span>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1.5 pt-3 border-t" style={{ borderColor: "var(--mc-border)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {inst.live ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleAction(inst.name, "stop")}
                      className="text-white/40 hover:text-white/80 gap-1 text-[11px] h-7 px-2"
                    >
                      <Square className="w-2.5 h-2.5" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleAction(inst.name, "start")}
                      className="text-white/40 hover:text-emerald-400 gap-1 text-[11px] h-7 px-2"
                    >
                      <Play className="w-2.5 h-2.5" />
                      Start
                    </Button>
                  )}
                  {inst.live && (
                    <Link
                      href={`/chat`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-white/40 hover:text-blue-400 gap-1 text-[11px] h-7 px-2"
                      >
                        <MessageSquare className="w-2.5 h-2.5" />
                        Chat
                      </Button>
                    </Link>
                  )}
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleAction(inst.name, "delete")}
                    className="text-white/40 hover:text-red-400 gap-1 text-[11px] h-7 px-2"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}
