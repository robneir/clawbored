"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
    transition: { staggerChildren: 0.05 },
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
        <Link href="/deploy">
          <Button className="rounded-xl px-5 h-10 text-sm font-medium gap-2 text-white" style={{ backgroundColor: "var(--mc-accent)" }}>
            <Rocket className="w-4 h-4" />
            Deploy Agent
          </Button>
        </Link>
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
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {instances.map((inst) => (
            <motion.div
              key={inst.name}
              variants={item}
              className="glass-card-hover p-5 cursor-pointer group"
              onClick={() => router.push(`/instances/${inst.name}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={
                      inst.live ? "status-dot-running" : "status-dot-stopped"
                    }
                  />
                  <div>
                    <h3 className="font-medium text-sm">
                      {inst.displayName || inst.name}
                    </h3>
                    <p className="text-white/30 text-xs mt-0.5">{inst.name}</p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    inst.live
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-white/5 text-white/40"
                  }`}
                >
                  {inst.live ? "Running" : "Stopped"}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-white/30">Port</span>
                  <span className="text-white/60 font-mono">{inst.port}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/30">Template</span>
                  <span className="text-white/60">{inst.template}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/30">Created</span>
                  <span className="text-white/60">
                    {new Date(inst.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div
                className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--mc-border)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {inst.live ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleAction(inst.name, "stop")}
                    className="text-white/40 hover:text-white/80 gap-1.5"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleAction(inst.name, "start")}
                    className="text-white/40 hover:text-emerald-400 gap-1.5"
                  >
                    <Play className="w-3 h-3" />
                    Start
                  </Button>
                )}
                {inst.live && inst.token && (
                  <a
                    href={`http://127.0.0.1:${inst.port}/#token=${inst.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-white/40 hover:text-blue-400 gap-1.5"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </Button>
                  </a>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleAction(inst.name, "delete")}
                  className="text-white/40 hover:text-red-400 gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
