"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Play,
  Square,
  Trash2,
  ExternalLink,
  ArrowLeft,
  Clock,
  Server,
  Globe,
  FolderOpen,
  Tag,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";

interface Instance {
  name: string;
  displayName: string;
  port: number;
  token: string | null;
  template: string;
  createdAt: string;
  profileDir: string;
  pid: number | null;
  status: string;
  live?: boolean;
}

export default function InstanceDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const router = useRouter();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchInstance();
    const interval = setInterval(fetchInstance, 3000);
    return () => clearInterval(interval);
  }, [name]);

  async function fetchInstance() {
    try {
      const res = await fetch(`/api/instances/${name}`);
      if (res.ok) {
        const data = await res.json();
        // Also check live status
        const listRes = await fetch("/api/instances");
        if (listRes.ok) {
          const all = await listRes.json();
          const enriched = all.find(
            (i: Instance) => i.name === name
          );
          setInstance(enriched || data);
        } else {
          setInstance(data);
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "start" | "stop" | "delete") {
    if (!instance) return;
    setActionLoading(true);
    try {
      if (action === "delete") {
        await fetch(`/api/instances/${name}`, { method: "DELETE" });
        router.push("/");
        return;
      }
      await fetch(`/api/instances/${name}/${action}`, { method: "POST" });
      await fetchInstance();
    } catch {
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="glass-card p-12 text-center">
          <Server className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="font-heading text-xl font-semibold mb-2">
            Instance not found
          </h3>
          <p className="text-white/40 text-sm mb-6">
            The instance &quot;{name}&quot; doesn&apos;t exist.
          </p>
          <Link href="/">
            <Button
              variant="ghost"
              className="text-white/60 hover:text-white gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const uptime = instance.createdAt
    ? formatUptime(new Date(instance.createdAt))
    : "Unknown";

  const controlUrl =
    instance.live && instance.token
      ? `http://127.0.0.1:${instance.port}/#token=${instance.token}`
      : null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-6"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm transition-colors" style={{ color: "var(--mc-muted)" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 mb-6"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                instance.live
                  ? "bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]"
                  : "bg-zinc-600"
              }`}
            />
            <div>
              <h1 className="font-heading text-2xl font-semibold">
                {instance.displayName || instance.name}
              </h1>
              <p className="text-sm mt-0.5 font-mono" style={{ color: "var(--mc-muted)" }}>
                {instance.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {instance.live ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction("stop")}
                disabled={actionLoading}
                className="transition-colors gap-2 rounded-xl" style={{ color: "var(--mc-muted)", borderColor: "var(--mc-border)", border: "1px solid" }}
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction("start")}
                disabled={actionLoading}
                className="text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 gap-2 rounded-xl"
              >
                <Play className="w-3.5 h-3.5" />
                Start
              </Button>
            )}
            {controlUrl && (
              <a href={controlUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300 border border-blue-500/20 gap-2 rounded-xl"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open UI
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAction("delete")}
              disabled={actionLoading}
              className="text-red-400/60 hover:text-red-400 border border-red-500/10 gap-2 rounded-xl"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-5 pt-5" style={{ borderTop: "1px solid var(--mc-border)" }}>
          <StatusBadge live={!!instance.live} />
          <InfoChip icon={Globe} label="Port" value={String(instance.port)} />
          <InfoChip icon={Clock} label="Created" value={uptime} />
          <InfoChip icon={Tag} label="Template" value={instance.template} />
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs" disabled>
              Logs
            </TabsTrigger>
            <TabsTrigger value="analytics" disabled>
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" disabled>
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <h3 className="text-white/40 text-xs font-medium uppercase tracking-wider mb-4">
                  Connection
                </h3>
                <div className="space-y-3">
                  <DetailRow
                    icon={Globe}
                    label="Endpoint"
                    value={`http://127.0.0.1:${instance.port}`}
                    mono
                  />
                  {instance.token && (
                    <DetailRow
                      icon={Key}
                      label="Token"
                      value={`${instance.token.slice(0, 8)}...`}
                      mono
                    />
                  )}
                  {controlUrl && (
                    <DetailRow
                      icon={ExternalLink}
                      label="Control UI"
                      value="Open in browser"
                      href={controlUrl}
                    />
                  )}
                </div>
              </div>

              <div className="glass-card p-5">
                <h3 className="text-white/40 text-xs font-medium uppercase tracking-wider mb-4">
                  Instance Info
                </h3>
                <div className="space-y-3">
                  <DetailRow
                    icon={FolderOpen}
                    label="Profile Directory"
                    value={instance.profileDir}
                    mono
                  />
                  <DetailRow
                    icon={Tag}
                    label="Template"
                    value={instance.template}
                  />
                  <DetailRow
                    icon={Clock}
                    label="Created At"
                    value={new Date(instance.createdAt).toLocaleString()}
                  />
                  <DetailRow
                    icon={Server}
                    label="PID"
                    value={instance.pid ? String(instance.pid) : "N/A"}
                    mono
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full ${
        live
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-white/5 text-white/40 border border-white/10"
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          live
            ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
            : "bg-zinc-500"
        }`}
      />
      {live ? "Running" : "Stopped"}
    </span>
  );
}

function InfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5" />
      <span className="text-sm" style={{ color: "var(--mc-muted)" }}>{label}:</span>
      <span className="text-white/70">{value}</span>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-white/25 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <span className="text-white/40 text-xs block">{label}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            {value}
          </a>
        ) : (
          <span
            className={`text-white/70 text-sm break-all ${mono ? "font-mono" : ""}`}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

function formatUptime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "Just now";
}
