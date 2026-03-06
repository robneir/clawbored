"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Check, Loader2 } from "lucide-react";
import { useGateway } from "./gateway-provider";

interface DetectedProfile {
  name: string;
  dir: string;
  port: number | null;
  agentCount: number;
  isRunning: boolean;
  isActive: boolean;
}

export function InstanceDropdown() {
  const router = useRouter();
  const { gateway, triggerTransition, clearTransition, refresh: refreshGateway } = useGateway();
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchProfiles();
    const interval = setInterval(fetchProfiles, 10000);
    return () => clearInterval(interval);
  }, [fetchProfiles]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSwitch(profileDir: string) {
    if (switching) return;
    const target = profiles.find((p) => p.dir === profileDir);

    triggerTransition(
      { title: target?.name || "Instance", subtitle: "Switching instance..." },
      0,
    );
    setOpen(false);
    setSwitching(profileDir);

    try {
      const res = await fetch("/api/gateway/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDir }),
      });
      if (res.ok) {
        // Refresh gateway state immediately — SSE will also pick this up
        refreshGateway();
        // Profile list refresh in background (don't block the UI)
        fetchProfiles();
      }
    } catch {}
    setSwitching(null);
    clearTransition();
  }

  const activeProfile = profiles.find((p) => p.isActive);
  const gwLive = gateway?.live ?? false;
  const gwNotSetup = gateway?.status === "not_setup";

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => {
          if (gwNotSetup && profiles.length === 0) {
            router.push("/deploy");
            return;
          }
          setOpen(!open);
        }}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{
          color: "var(--mc-text)",
          backgroundColor: open ? "var(--mc-surface)" : "transparent",
        }}
      >
        <div
          className={gwLive ? "status-dot-running" : "status-dot-stopped"}
          style={{ width: 6, height: 6 }}
        />
        <span className="max-w-[120px] truncate font-medium">
          {activeProfile?.name || gateway?.displayName || gateway?.profileName || "No Instance"}
        </span>
        {gateway?.port && (
          <span className="text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
            :{gateway.port}
          </span>
        )}
        <ChevronDown
          className="w-3 h-3 transition-transform"
          style={{
            color: "var(--mc-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
            style={{
              backgroundColor: "var(--mc-bg)",
              border: "1px solid var(--mc-border)",
              minWidth: 220,
            }}
          >
            {/* Header */}
            <div
              className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--mc-muted)", borderBottom: "1px solid var(--mc-border)" }}
            >
              Instances
            </div>

            {/* Profile list */}
            <div className="py-1 max-h-[280px] overflow-y-auto">
              {profiles.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                    No instances found
                  </p>
                </div>
              ) : (
                profiles.map((profile) => {
                  const active = profile.isActive;
                  return (
                    <button
                      key={profile.dir}
                      onClick={() => {
                        if (!active) handleSwitch(profile.dir);
                        else setOpen(false);
                      }}
                      disabled={switching === profile.dir}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                      style={{
                        color: active ? "var(--mc-text)" : "var(--mc-muted)",
                        backgroundColor: active ? "var(--mc-surface)" : "transparent",
                        opacity: switching === profile.dir ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = "var(--mc-surface)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div
                        className={profile.isRunning ? "status-dot-running" : "status-dot-stopped"}
                        style={{ width: 6, height: 6 }}
                      />
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{profile.name}</span>
                          {active && (
                            <Check className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-accent)" }} />
                          )}
                        </div>
                        {profile.port && (
                          <span
                            className="text-[10px] block"
                            style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                          >
                            :{profile.port} · {profile.agentCount} agent{profile.agentCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {switching === profile.dir && (
                        <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: "var(--mc-accent)" }} />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* New Instance */}
            <div style={{ borderTop: "1px solid var(--mc-border)" }}>
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/deploy");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{ color: "var(--mc-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--mc-surface)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Plus className="w-3.5 h-3.5" style={{ opacity: 0.6 }} />
                <span>New Instance</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
