"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/provider-icons";
import {
  Loader2,
  CheckCircle2,
  Unlink,
  Smartphone,
  QrCode,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

type Phase = "loading" | "disconnected" | "scanning" | "terminal" | "connected";

export function WhatsAppSetup({ agentId }: { agentId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrBlock, setQrBlock] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [hasBound, setHasBound] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check initial status ──
  const checkStatus = useCallback(async () => {
    try {
      const [statusRes, bindingRes] = await Promise.all([
        fetch("/api/whatsapp/status"),
        fetch(`/api/agents/${agentId}/whatsapp`),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.connected) {
          setPhase("connected");

          // Auto-bind this agent if no binding exists
          if (bindingRes.ok) {
            const bData = await bindingRes.json();
            setHasBound(!!bData.binding);
            if (!bData.binding) {
              try {
                await fetch(`/api/agents/${agentId}/whatsapp`, {
                  method: "POST",
                });
                setHasBound(true);
              } catch {}
            }
          }
          return;
        }
      }
      setPhase("disconnected");
    } catch {
      setPhase("disconnected");
    }
  }, [agentId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ── Clean up polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Start login (spawn CLI for QR) ──
  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/whatsapp/login", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to start login" }));
        throw new Error(data.error || "Failed to start login");
      }
      const { sessionId: sid } = await res.json();
      setSessionId(sid);
      setPhase("scanning");

      // Start polling for QR updates + connection status
      startPolling(sid);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start login");
    } finally {
      setConnecting(false);
    }
  }

  function startPolling(sid: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    let noQrTicks = 0;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/login/${sid}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "connected") {
          // Success! Clean up and auto-bind
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("connected");
          toast.success("WhatsApp connected!");

          // Auto-bind agent
          try {
            await fetch(`/api/agents/${agentId}/whatsapp`, { method: "POST" });
            setHasBound(true);
          } catch {}
          return;
        }

        if (data.status === "qr_ready" && data.qr) {
          setQrBlock(data.qr);
          noQrTicks = 0;
        } else if (data.status === "starting") {
          noQrTicks++;
          // If no QR after 8 seconds, show terminal fallback
          if (noQrTicks >= 8) {
            setPhase("terminal");
          }
        }

        if (data.status === "error" || data.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          // Check if actually connected via status endpoint
          const statusRes = await fetch("/api/whatsapp/status");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.connected) {
              setPhase("connected");
              toast.success("WhatsApp connected!");
              try {
                await fetch(`/api/agents/${agentId}/whatsapp`, { method: "POST" });
                setHasBound(true);
              } catch {}
              return;
            }
          }
          setPhase("disconnected");
          if (data.error) toast.error(data.error);
        }
      } catch {}
    }, 1000);

    // Auto-stop after 5 minutes
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase("terminal");
      }
    }, 5 * 60 * 1000);
  }

  // ── Disconnect ──
  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      // Remove agent binding
      await fetch(`/api/agents/${agentId}/whatsapp`, { method: "DELETE" });
      // Logout WhatsApp
      const res = await fetch("/api/whatsapp/logout", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      toast.success("WhatsApp disconnected");
      setPhase("disconnected");
      setHasBound(false);
      setQrBlock("");
      setSessionId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Cancel scanning ──
  function handleCancel() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (sessionId) {
      fetch(`/api/whatsapp/login?session=${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
    setPhase("disconnected");
    setQrBlock("");
    setSessionId(null);
  }

  // ── Loading ──
  if (phase === "loading") {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--mc-muted)" }}
        />
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
            style={{ backgroundColor: "rgba(37, 211, 102, 0.1)" }}
          >
            <WhatsAppIcon size={20} style={{ color: "#25D366" }} />
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              WhatsApp Connected
            </h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              {hasBound
                ? "Messages will be routed to this agent"
                : "Connected via WhatsApp Web"}
            </p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>

        <div
          className="rounded-xl p-4 mb-4"
          style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-3">
            <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
            <div>
              <span className="text-xs block" style={{ color: "var(--mc-muted)" }}>
                Status
              </span>
              <span className="text-sm" style={{ color: "var(--mc-text)" }}>
                Linked via WhatsApp Web
              </span>
            </div>
          </div>
        </div>

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

  // ── Scanning — QR captured from CLI ──
  if (phase === "scanning") {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(37, 211, 102, 0.1)" }}
          >
            <WhatsAppIcon size={20} style={{ color: "#25D366" }} />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              Scan QR Code
            </h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              Link your WhatsApp to this agent
            </p>
          </div>
        </div>

        {qrBlock ? (
          <>
            {/* QR Code display */}
            <div
              className="rounded-xl p-6 mb-4 flex items-center justify-center overflow-hidden"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid var(--mc-border)",
              }}
            >
              <pre
                style={{
                  fontFamily: "monospace",
                  fontSize: "3px",
                  lineHeight: "3px",
                  letterSpacing: "0",
                  color: "#000000",
                  whiteSpace: "pre",
                  userSelect: "none",
                }}
              >
                {qrBlock}
              </pre>
            </div>

            {/* Instructions */}
            <div
              className="rounded-xl p-4 mb-4 space-y-2"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <div className="flex items-start gap-2">
                <Smartphone className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#25D366" }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
                    Open WhatsApp on your phone
                  </p>
                  <p className="text-[10px] leading-relaxed mt-0.5" style={{ color: "var(--mc-muted)" }}>
                    Settings → Linked Devices → Link a Device → Scan this QR code
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{ borderColor: "var(--mc-border)", borderTopColor: "#25D366" }}
              />
              <span className="text-xs" style={{ color: "var(--mc-muted)" }}>
                Waiting for scan...
              </span>
            </div>
          </>
        ) : (
          /* Waiting for QR to appear */
          <div className="py-8 flex flex-col items-center gap-3">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--mc-border)", borderTopColor: "#25D366" }}
            />
            <span className="text-xs" style={{ color: "var(--mc-muted)" }}>
              Generating QR code...
            </span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setPhase("terminal")}
            className="text-[10px] underline underline-offset-2"
            style={{ color: "var(--mc-muted)" }}
          >
            QR not showing? Use terminal instead
          </button>
          <button
            onClick={handleCancel}
            className="text-[10px] ml-auto"
            style={{ color: "var(--mc-muted)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Terminal fallback — CLI instructions ──
  if (phase === "terminal") {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(37, 211, 102, 0.1)" }}
          >
            <WhatsAppIcon size={20} style={{ color: "#25D366" }} />
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              Connect WhatsApp
            </h3>
            <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
              Run the command below in your terminal
            </p>
          </div>
        </div>

        <div
          className="rounded-xl p-4 mb-4 space-y-3"
          style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" style={{ color: "#25D366" }} />
            <span className="text-xs font-medium" style={{ color: "var(--mc-text)" }}>
              Run in Terminal
            </span>
          </div>
          <code
            className="block px-3 py-2.5 rounded-lg text-xs font-mono select-all"
            style={{
              backgroundColor: "var(--mc-bg)",
              color: "var(--mc-text)",
              border: "1px solid var(--mc-border)",
            }}
          >
            openclaw channels login --channel whatsapp --account default
          </code>
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
            A QR code will appear. Scan it with WhatsApp on your phone
            (Settings → Linked Devices → Link a Device).
            This page will update automatically once connected.
          </p>
        </div>

        {/* Poll for connection */}
        <TerminalPoller agentId={agentId} onConnected={() => {
          setPhase("connected");
          setHasBound(true);
          toast.success("WhatsApp connected!");
        }} />

        <button
          onClick={handleCancel}
          className="text-[10px] mt-3"
          style={{ color: "var(--mc-muted)" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Disconnected — Connect button ──
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(37, 211, 102, 0.1)" }}
        >
          <WhatsAppIcon size={20} style={{ color: "#25D366" }} />
        </div>
        <div>
          <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
            WhatsApp
          </h3>
          <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
            Chat with this agent via WhatsApp
          </p>
        </div>
      </div>

      <div
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
      >
        <div className="flex items-start gap-3">
          <QrCode className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--mc-text)" }}>
              Scan a QR code to connect
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--mc-muted)" }}>
              Link your WhatsApp account by scanning a QR code.
              Messages sent to you on WhatsApp will be handled by this agent.
            </p>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="gap-2 rounded-xl text-sm"
        style={{
          color: "#25D366",
          border: "1px solid rgba(37, 211, 102, 0.3)",
        }}
        onClick={handleConnect}
        disabled={connecting}
      >
        {connecting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <WhatsAppIcon size={14} />
        )}
        Connect WhatsApp
      </Button>
    </div>
  );
}

// ── Helper: polls status while user runs CLI in their terminal ──

function TerminalPoller({
  agentId,
  onConnected,
}: {
  agentId: string;
  onConnected: () => void;
}) {
  const calledRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/whatsapp/status");
        if (!res.ok) return;
        const data = await res.json();
        if (data.connected && !calledRef.current) {
          calledRef.current = true;
          clearInterval(interval);
          // Auto-bind agent
          try {
            await fetch(`/api/agents/${agentId}/whatsapp`, { method: "POST" });
          } catch {}
          onConnected();
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [agentId, onConnected]);

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-3 h-3 border-2 rounded-full animate-spin"
        style={{ borderColor: "var(--mc-border)", borderTopColor: "#25D366" }}
      />
      <span className="text-xs" style={{ color: "var(--mc-muted)" }}>
        Waiting for connection...
      </span>
    </div>
  );
}
