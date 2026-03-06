"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MessageSquare,
  Trash2,
  Save,
  Clock,
  Tag,
  Bot,
  FolderOpen,
  Loader2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeleteAgentDialog } from "@/components/delete-agent-dialog";
import { CloneAgentDialog } from "@/components/clone-agent-dialog";
import { FileTree } from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import { ModelSelector } from "@/components/model-selector";
import { TelegramSetup } from "@/components/telegram-setup";
import Link from "next/link";
import { useGateway } from "@/components/gateway-provider";

interface Agent {
  id: string;
  displayName: string;
  template: string;
  workspace: string;
  agentDir: string;
  model: string;
  soulMd: string | null;
  status: string;
  createdAt: string;
}

interface GatewayStatus {
  port: number;
  live?: boolean;
  status: string;
  profileName?: string;
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { triggerTransition } = useGateway();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [soulContent, setSoulContent] = useState("");
  const [soulDirty, setSoulDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Workspace browser state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workspaceTree, setWorkspaceTree] = useState<any[]>([]);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fileContent, setFileContent] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const [agentRes, gwRes] = await Promise.all([
        fetch(`/api/agents/${id}`),
        fetch("/api/gateway"),
      ]);

      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgent(data);
        setSoulContent(data.soulMd || "");
      }
      if (gwRes.ok) {
        const gwData = await gwRes.json();
        setGateway(gwData);
        // Mark agent as read when viewing its detail page
        if (gwData.profileName) {
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileName: gwData.profileName, agentId: id }),
          }).catch(() => {});
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSoul() {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${id}/soul`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: soulContent }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("SOUL.md saved");
      setSoulDirty(false);
    } catch {
      toast.error("Failed to save SOUL.md");
    } finally {
      setSaving(false);
    }
  }

  async function fetchWorkspaceTree() {
    try {
      const res = await fetch(`/api/agents/${id}/workspace`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceTree(data.tree || []);
      }
    } catch {
      toast.error("Failed to load workspace");
    }
  }

  async function loadFile(filePath: string) {
    setSelectedFile(filePath);
    setFileLoading(true);
    try {
      const res = await fetch(
        `/api/agents/${id}/workspace/file?path=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        setFileContent(await res.json());
      } else {
        setFileContent(null);
        toast.error("Failed to load file");
      }
    } catch {
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
        />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
        <div className="glass-card p-8 sm:p-12 text-center">
          <Bot
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "var(--mc-muted)", opacity: 0.3 }}
          />
          <h3 className="font-heading text-xl font-semibold mb-2">
            Agent not found
          </h3>
          <p className="text-sm mb-6" style={{ color: "var(--mc-muted)" }}>
            The agent &quot;{id}&quot; doesn&apos;t exist.
          </p>
          <Link href="/">
            <Button
              variant="ghost"
              className="gap-2"
              style={{ color: "var(--mc-muted)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isLive = gateway?.live ?? false;

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-4xl mx-auto">
      {/* Back */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-6"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm transition-colors"
          style={{ color: "var(--mc-muted)" }}
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
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                isLive
                  ? "bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]"
                  : ""
              }`}
              style={isLive ? undefined : { backgroundColor: "var(--mc-muted)" }}
            />
            <div>
              <h1 className="font-heading text-2xl font-semibold">
                {agent.displayName || agent.id}
              </h1>
              <p
                className="text-sm mt-0.5 font-mono"
                style={{ color: "var(--mc-muted)" }}
              >
                openclaw:{agent.id}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLive && (
              <>
                <Link href={`/chat?agent=${encodeURIComponent(agent.id)}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-xl"
                    style={{
                      color: "var(--mc-accent)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </Button>
                </Link>
              </>
            )}
            <CloneAgentDialog
              agentId={agent.id}
              displayName={agent.displayName || agent.id}
              onCloned={(cloneId) => router.push(`/agents/${cloneId}`)}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 rounded-xl"
                  style={{
                    color: "var(--mc-muted)",
                    border: "1px solid var(--mc-border)",
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone
                </Button>
              }
            />
            <DeleteAgentDialog
              agentId={agent.id}
              displayName={agent.displayName || agent.id}
              onDeleted={async () => {
                try {
                  const res = await fetch("/api/agents");
                  if (res.ok) {
                    const remaining: { id: string; displayName: string; avatar: string }[] = await res.json();
                    const next = remaining.find(a => a.id !== id);
                    if (next) {
                      triggerTransition({
                        title: next.displayName || next.id,
                        subtitle: "Loading agent...",
                        avatar: next.avatar || undefined,
                      }, 1200);
                      router.push(`/agents/${next.id}`);
                      return;
                    }
                  }
                } catch {}
                router.push("/");
              }}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400/60 hover:text-red-400 border border-red-500/10 gap-2 rounded-xl"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              }
            />
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-6 mt-5 pt-5"
          style={{ borderTop: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-2 text-sm">
            <Bot className="w-3.5 h-3.5" />
            <span style={{ color: "var(--mc-muted)" }}>Model:</span>
            <ModelSelector
              value={agent.model || "default"}
              onChange={async (newModel) => {
                try {
                  const res = await fetch(`/api/agents/${agent.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: newModel === "default" ? "" : newModel }),
                  });
                  if (!res.ok) throw new Error("Failed to update model");
                  setAgent({ ...agent, model: newModel === "default" ? "" : newModel });
                  toast.success("Model updated");
                } catch {
                  toast.error("Failed to update model");
                }
              }}
              className="w-56"
            />
          </div>
          <InfoChip
            icon={Clock}
            label="Created"
            value={formatUptime(new Date(agent.createdAt))}
          />
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs
          defaultValue="overview"
          onValueChange={(val) => {
            if (val === "workspace" && !workspaceLoaded) {
              setWorkspaceLoaded(true);
              fetchWorkspaceTree();
            }
          }}
        >
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="soul">SOUL.md</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="comms">Communications</TabsTrigger>
            <TabsTrigger value="logs" disabled>
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <h3
                  className="text-xs font-medium uppercase tracking-wider mb-4"
                  style={{ color: "var(--mc-muted)" }}
                >
                  Connection
                </h3>
                <div className="space-y-3">
                  <DetailRow
                    icon={Bot}
                    label="Model Target"
                    value={`openclaw:${agent.id}`}
                    mono
                  />
                  {gateway && (
                    <DetailRow
                      icon={Bot}
                      label="Gateway Endpoint"
                      value={`http://127.0.0.1:${gateway.port}`}
                      mono
                    />
                  )}
                </div>
              </div>

              <div className="glass-card p-5">
                <h3
                  className="text-xs font-medium uppercase tracking-wider mb-4"
                  style={{ color: "var(--mc-muted)" }}
                >
                  Agent Info
                </h3>
                <div className="space-y-3">
                  <DetailRow
                    icon={FolderOpen}
                    label="Workspace"
                    value={agent.workspace}
                    mono
                  />
                  <DetailRow icon={Tag} label="Template" value={agent.template} />
                  <DetailRow
                    icon={Clock}
                    label="Created At"
                    value={new Date(agent.createdAt).toLocaleString()}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="soul">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--mc-muted)" }}
                >
                  SOUL.md — Agent Personality
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveSoul}
                  disabled={!soulDirty || saving}
                  className="gap-2 rounded-xl text-sm"
                  style={{
                    color: soulDirty ? "var(--mc-accent)" : "var(--mc-muted)",
                    border: `1px solid ${soulDirty ? "rgba(99, 102, 241, 0.3)" : "var(--mc-border)"}`,
                  }}
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
              <textarea
                value={soulContent}
                onChange={(e) => {
                  setSoulContent(e.target.value);
                  setSoulDirty(true);
                }}
                rows={20}
                className="w-full rounded-xl text-sm p-4 outline-none resize-none font-mono leading-relaxed"
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderColor: "var(--mc-border)",
                  color: "var(--mc-text)",
                  border: "1px solid var(--mc-border)",
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="workspace">
            <div
              className="glass-card overflow-hidden flex flex-col md:flex-row"
              style={{ height: "600px" }}
            >
              {/* File tree */}
              <div
                className="workspace-tree overflow-y-auto py-3 px-2 flex-shrink-0"
              >
                <FileTree
                  nodes={workspaceTree}
                  selectedPath={selectedFile}
                  onSelect={loadFile}
                />
              </div>

              {/* File viewer */}
              <div className="flex-1 overflow-y-auto p-4">
                <FileViewer
                  file={fileContent}
                  filename={selectedFile?.split("/").pop() || ""}
                  loading={fileLoading}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comms">
            <div className="space-y-4">
              <TelegramSetup agentId={agent.id} />
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
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
      <span style={{ color: "var(--mc-muted)" }}>{label}:</span>
      <span style={{ color: "var(--mc-text)", opacity: 0.7 }}>{value}</span>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        className="w-4 h-4 mt-0.5 flex-shrink-0"
        style={{ color: "var(--mc-muted)", opacity: 0.5 }}
      />
      <div className="min-w-0">
        <span className="text-xs block" style={{ color: "var(--mc-muted)" }}>
          {label}
        </span>
        <span
          className={`text-sm break-all ${mono ? "font-mono" : ""}`}
          style={{ color: "var(--mc-text)", opacity: 0.7 }}
        >
          {value}
        </span>
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
