"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelegramIcon } from "@/components/provider-icons";
import {
  Loader2,
  CheckCircle2,
  Unlink,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type Phase = "loading" | "disconnected" | "connected";

export function TelegramSetup({ agentId }: { agentId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/status");
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          setBotUsername(data.botUsername || "");
          setPhase("connected");
          return;
        }
      }
      setPhase("disconnected");
    } catch {
      setPhase("disconnected");
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  async function handleConnect() {
    if (!botToken.trim()) {
      toast.error("Paste your bot token from @BotFather");
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: botToken.trim(), agentId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to connect" }));
        throw new Error(data.error || "Failed to connect");
      }

      const data = await res.json();
      setBotUsername(data.botUsername || "");
      setBotToken("");
      setPhase("connected");
      toast.success("Telegram bot connected!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch(`/api/agents/${agentId}/telegram`, { method: "DELETE" });
      const res = await fetch("/api/telegram/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast.success("Telegram disconnected");
      setPhase("disconnected");
      setBotUsername("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Loading ──
  if (phase === "loading") {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mc-muted)" }} />
      </div>
    );
  }

  // ── Connected ──
  if (phase === "connected") {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(38, 165, 226, 0.1)" }}
          >
            <TelegramIcon size={20} style={{ color: "#26A5E4" }} />
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              Telegram Connected
            </h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              DM your bot to chat with this agent
            </p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>

        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl p-4 mb-4 transition-colors"
            style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--mc-surface-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--mc-surface)"; }}
          >
            <TelegramIcon size={16} style={{ color: "#26A5E4" }} />
            <div className="flex-1">
              <span className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                @{botUsername}
              </span>
            </div>
            <ExternalLink className="w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
          </a>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-2 rounded-xl text-sm text-red-400/60 hover:text-red-400 border border-red-500/10"
          onClick={handleDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Unlink className="w-3.5 h-3.5" />
          )}
          Disconnect
        </Button>
      </div>
    );
  }

  // ── Disconnected — Setup flow ──
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(38, 165, 226, 0.1)" }}
        >
          <TelegramIcon size={20} style={{ color: "#26A5E4" }} />
        </div>
        <div>
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
            Telegram
          </h3>
          <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
            DM this agent on Telegram
          </p>
        </div>
      </div>

      {/* Step 1: Create bot */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: "var(--mc-text)" }}>
          Create a bot with
          {" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
            style={{ color: "#26A5E4" }}
          >
            @BotFather
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
          Send <span className="font-mono" style={{ color: "var(--mc-text)" }}>/newbot</span> to
          @BotFather on Telegram, pick a name, and paste the token below.
        </p>
      </div>

      {/* Step 2: Paste token */}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Paste bot token"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
          className="flex-1 h-9 rounded-lg text-sm font-mono"
          style={{
            backgroundColor: "var(--mc-surface)",
            borderColor: "var(--mc-border)",
            color: "var(--mc-text)",
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 rounded-lg text-sm h-9 px-4"
          style={{
            color: "#26A5E4",
            border: "1px solid rgba(38, 165, 226, 0.3)",
          }}
          onClick={handleConnect}
          disabled={connecting || !botToken.trim()}
        >
          {connecting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <TelegramIcon size={14} />
          )}
          Connect
        </Button>
      </div>
    </div>
  );
}
