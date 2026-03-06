"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/provider-icons";
import {
  Loader2,
  ExternalLink,
  Hash,
  Server,
  CheckCircle2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

interface DiscordStatus {
  configured: boolean;
  connected: boolean;
  bot?: { id: string; username: string; discriminator: string; avatar: string | null };
  applicationId?: string;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface Channel {
  id: string;
  name: string;
  type: number;
  position: number;
}

interface Binding {
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
}

export function DiscordSetup({ agentId }: { agentId: string }) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup state
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Binding state
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedGuild, setSelectedGuild] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [assigningChannel, setAssigningChannel] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, bindingRes] = await Promise.all([
        fetch("/api/discord/status"),
        fetch(`/api/agents/${agentId}/discord`),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      } else {
        setStatus({ configured: false, connected: false });
      }

      if (bindingRes.ok) {
        const data = await bindingRes.json();
        setBinding(data.binding || null);
      }
    } catch {
      setStatus({ configured: false, connected: false });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Load guilds when bot is connected but no binding
  useEffect(() => {
    if (status?.connected && !binding) {
      loadGuilds();
      loadInviteUrl();
    }
  }, [status?.connected, binding]);

  async function loadGuilds() {
    setLoadingGuilds(true);
    try {
      const res = await fetch("/api/discord/guilds");
      if (res.ok) {
        const data = await res.json();
        setGuilds(data.guilds || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingGuilds(false);
    }
  }

  async function loadInviteUrl() {
    try {
      const res = await fetch("/api/discord/invite-url");
      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.url || null);
      }
    } catch {
      // silent
    }
  }

  async function loadChannels(guildId: string) {
    setLoadingChannels(true);
    setChannels([]);
    setSelectedChannel("");
    try {
      const res = await fetch(`/api/discord/guilds/${guildId}/channels`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch {
      // silent
    } finally {
      setLoadingChannels(false);
    }
  }

  async function handleConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/discord/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to connect");
        return;
      }
      toast.success(`Connected as ${data.bot.username}`);
      setToken("");
      await fetchStatus();
    } catch {
      toast.error("Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function handleAssignChannel() {
    if (!selectedGuild || !selectedChannel) return;
    setAssigningChannel(true);
    try {
      const guild = guilds.find((g) => g.id === selectedGuild);
      const channel = channels.find((c) => c.id === selectedChannel);
      const res = await fetch(`/api/agents/${agentId}/discord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuild,
          guildName: guild?.name || "",
          channelId: selectedChannel,
          channelName: channel?.name || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to assign channel");
        return;
      }
      toast.success(`Assigned to #${channel?.name || selectedChannel}`);
      await fetchStatus();
    } catch {
      toast.error("Failed to assign channel");
    } finally {
      setAssigningChannel(false);
    }
  }

  async function handleDisconnectAgent() {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/discord`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to disconnect");
        return;
      }
      toast.success("Discord channel unlinked");
      setBinding(null);
      setSelectedGuild("");
      setSelectedChannel("");
      setChannels([]);
      await fetchStatus();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleRemoveBot() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/discord/setup", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove bot");
        return;
      }
      toast.success("Discord bot removed");
      setBinding(null);
      setGuilds([]);
      setChannels([]);
      setInviteUrl(null);
      await fetchStatus();
    } catch {
      toast.error("Failed to remove bot");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--mc-muted)" }}
        />
      </div>
    );
  }

  // ── State 3: Fully connected ──
  if (status?.connected && binding) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(88, 101, 242, 0.1)" }}
          >
            <DiscordIcon size={20} style={{ color: "#5865F2" }} />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold">Discord Connected</h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              {status.bot?.username && `Bot: ${status.bot.username}`}
            </p>
          </div>
          <div className="ml-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div
          className="rounded-xl p-4 mb-4 space-y-3"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", border: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
            <div>
              <span className="text-xs block" style={{ color: "var(--mc-muted)" }}>Server</span>
              <span className="text-sm">{binding.guildName || binding.guildId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Hash className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
            <div>
              <span className="text-xs block" style={{ color: "var(--mc-muted)" }}>Channel</span>
              <span className="text-sm">#{binding.channelName || binding.channelId}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 rounded-xl text-sm"
            style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
            onClick={() => {
              setBinding(null);
              setSelectedGuild("");
              setSelectedChannel("");
              setChannels([]);
            }}
          >
            Change Channel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 rounded-xl text-sm text-red-400/60 hover:text-red-400 border border-red-500/10"
            onClick={handleDisconnectAgent}
            disabled={disconnecting}
          >
            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  // ── State 2: Bot connected, no binding for this agent ──
  if (status?.connected) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(88, 101, 242, 0.1)" }}
          >
            <DiscordIcon size={20} style={{ color: "#5865F2" }} />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold">Assign Discord Channel</h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              Bot: {status.bot?.username || "Connected"}
            </p>
          </div>
        </div>

        {/* Invite bot link */}
        {inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm mb-5 transition-colors"
            style={{ color: "#5865F2" }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Add bot to a new server
          </a>
        )}

        {/* Server selector */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: "var(--mc-muted)" }}>
              Server
            </label>
            {loadingGuilds ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--mc-muted)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading servers...
              </div>
            ) : guilds.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                No servers found. Add the bot to a server first.
              </p>
            ) : (
              <select
                value={selectedGuild}
                onChange={(e) => {
                  setSelectedGuild(e.target.value);
                  if (e.target.value) loadChannels(e.target.value);
                  else {
                    setChannels([]);
                    setSelectedChannel("");
                  }
                }}
                className="w-full rounded-xl text-sm px-3 py-2 outline-none"
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  border: "1px solid var(--mc-border)",
                  color: "var(--mc-text)",
                }}
              >
                <option value="">Select a server...</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Channel selector */}
          {selectedGuild && (
            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: "var(--mc-muted)" }}>
                Channel
              </label>
              {loadingChannels ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--mc-muted)" }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels...
                </div>
              ) : channels.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                  No text channels found.
                </p>
              ) : (
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="w-full rounded-xl text-sm px-3 py-2 outline-none"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--mc-border)",
                    color: "var(--mc-text)",
                  }}
                >
                  <option value="">Select a channel...</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-xl text-sm"
              style={{
                color: selectedChannel ? "#5865F2" : "var(--mc-muted)",
                border: selectedChannel ? "1px solid rgba(88, 101, 242, 0.3)" : "1px solid var(--mc-border)",
              }}
              disabled={!selectedChannel || assigningChannel}
              onClick={handleAssignChannel}
            >
              {assigningChannel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Hash className="w-3.5 h-3.5" />
              )}
              Assign Channel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-xl text-sm text-red-400/60 hover:text-red-400 border border-red-500/10"
              onClick={handleRemoveBot}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
              Remove Bot
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── State 1: No bot token configured ──
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(88, 101, 242, 0.1)" }}
        >
          <DiscordIcon size={20} style={{ color: "#5865F2" }} />
        </div>
        <div>
          <h3 className="font-heading text-sm font-semibold">Connect to Discord</h3>
          <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
            Set up a Discord bot to communicate with this agent
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Step 1 */}
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", border: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: "rgba(88, 101, 242, 0.15)", color: "#5865F2" }}
            >
              1
            </span>
            <span className="text-sm font-medium">Create a Discord Bot</span>
          </div>
          <p className="text-xs ml-9 mb-2" style={{ color: "var(--mc-muted)" }}>
            Go to the Discord Developer Portal, create an application, then add a bot user to it.
          </p>
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs ml-9 transition-colors"
            style={{ color: "#5865F2" }}
          >
            <ExternalLink className="w-3 h-3" />
            Open Developer Portal
          </a>
        </div>

        {/* Step 2 */}
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", border: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: "rgba(88, 101, 242, 0.15)", color: "#5865F2" }}
            >
              2
            </span>
            <span className="text-sm font-medium">Paste your bot token</span>
          </div>
          <div className="ml-9 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bot token..."
              className="flex-1 rounded-xl text-sm px-3 py-2 outline-none"
              style={{
                backgroundColor: "rgba(0,0,0,0.3)",
                border: "1px solid var(--mc-border)",
                color: "var(--mc-text)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-xl text-sm"
              style={{
                color: token.trim() ? "#5865F2" : "var(--mc-muted)",
                border: token.trim() ? "1px solid rgba(88, 101, 242, 0.3)" : "1px solid var(--mc-border)",
              }}
              disabled={!token.trim() || connecting}
              onClick={handleConnect}
            >
              {connecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <DiscordIcon size={14} />
              )}
              Connect
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
