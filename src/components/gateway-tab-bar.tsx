"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useGateway } from "./gateway-provider";

interface DetectedProfile {
  name: string;
  dir: string;
  port: number | null;
  hasToken: boolean;
  agentCount: number;
  isRunning: boolean;
  isDefault: boolean;
}

export function GatewayTabBar() {
  const router = useRouter();
  const { gateway, refresh: refreshGateway, triggerTransition, clearTransition } = useGateway();
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Inline create state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const busy = creating || switching !== null;

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

  const isActive = (profile: DetectedProfile) =>
    gateway?.profileDir === profile.dir;

  async function handleSwitch(profileDir: string) {
    if (busy) return;
    const switchedProfile = profiles.find(p => p.dir === profileDir);

    // Immediately show transition overlay
    triggerTransition({
      title: switchedProfile?.name || "Instance",
      subtitle: "Switching instance...",
    }, 0); // persistent — stays until we clear it
    setSwitching(profileDir);

    try {
      const res = await fetch("/api/gateway/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDir }),
      });
      if (res.ok) {
        refreshGateway();
        await fetchProfiles();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({ error: "Switch failed" }));
        toast.error(data.error || "Failed to switch instance");
      }
    } catch {
      toast.error("Failed to switch instance");
    }
    setSwitching(null);
    clearTransition();
  }

  async function handleDelete(profileDir: string) {
    try {
      await fetch(`/api/gateway?deleteFiles=false`, { method: "DELETE" });
      setShowDeleteConfirm(null);
      refreshGateway();
      await fetchProfiles();
      router.refresh();
    } catch {
      toast.error("Failed to remove gateway");
    }
  }

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/gateway/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", profileName: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Setup failed" }));
        throw new Error(data.error || "Setup failed");
      }
      const result = await res.json();
      const deployId = result.deployId;
      if (deployId) {
        for (let attempt = 0; attempt < 60; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const statusRes = await fetch(`/api/deploy/${deployId}`);
            if (statusRes.ok) {
              const deploy = await statusRes.json();
              if (deploy.status === "complete") break;
              if (deploy.status === "failed") {
                throw new Error(deploy.error || "Gateway setup failed");
              }
            }
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes("failed")) throw pollErr;
          }
        }
      }
      toast.success("Gateway created");
      setNewName("");
      setShowCreate(false);
      refreshGateway();
      await fetchProfiles();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create gateway");
    }
    setCreating(false);
  }

  // Hide tab bar when there's only one profile
  if (profiles.length <= 1 && !showCreate) return null;

  return (
    <div
      className="flex items-center h-9 px-2 gap-1 flex-shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--mc-bg)",
        borderBottom: "1px solid var(--mc-border)",
      }}
    >
      {profiles.map((profile) => {
        const active = isActive(profile);
        return (
          <div key={profile.dir} className="relative group flex items-center">
            <button
              onClick={() => !active && handleSwitch(profile.dir)}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-1 rounded text-xs font-medium transition-all duration-150 whitespace-nowrap"
              style={{
                color: active ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: active ? "var(--mc-surface)" : "transparent",
                opacity: switching === profile.dir ? 0.5 : 1,
              }}
            >
              <div
                className={profile.isRunning ? "status-dot-running" : "status-dot-stopped"}
                style={{ width: 6, height: 6 }}
              />
              {profile.name}
            </button>

            {/* Delete button — only show on non-active tabs on hover */}
            {!active && (
              <button
                className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-[-4px] mr-1"
                style={{ color: "var(--mc-muted)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(profile.dir);
                }}
                title="Remove gateway"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Delete confirmation popover */}
            <AnimatePresence>
              {showDeleteConfirm === profile.dir && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 mt-1 z-50 rounded-lg p-3 shadow-lg"
                  style={{
                    backgroundColor: "var(--mc-surface)",
                    border: "1px solid var(--mc-border)",
                    minWidth: 200,
                  }}
                >
                  <p className="text-xs mb-2" style={{ color: "var(--mc-text)" }}>
                    Remove &quot;{profile.name}&quot;?
                  </p>
                  <p className="text-xs mb-3" style={{ color: "var(--mc-muted)" }}>
                    This will stop the gateway and remove all its agents from Clawboard.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-2 py-1 rounded text-xs transition-colors"
                      style={{
                        backgroundColor: "var(--mc-bg)",
                        color: "var(--mc-muted)",
                        border: "1px solid var(--mc-border)",
                      }}
                      onClick={() => setShowDeleteConfirm(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 px-2 py-1 rounded text-xs transition-colors flex items-center justify-center gap-1"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        color: "#f87171",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}
                      onClick={() => handleDelete(profile.dir)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Inline create */}
      {showCreate ? (
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Instance name"
            className="px-2 py-0.5 rounded text-xs outline-none w-28"
            style={{
              backgroundColor: "var(--mc-surface)",
              border: "1px solid var(--mc-border)",
              color: "var(--mc-text)",
            }}
            autoFocus
            disabled={creating}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape" && !creating) { setShowCreate(false); setNewName(""); }
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white transition-all"
            style={{
              backgroundColor: "var(--mc-accent)",
              opacity: !newName.trim() || creating ? 0.5 : 1,
            }}
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
          </button>
          {!creating && (
            <button
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ color: "var(--mc-muted)" }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all duration-150 ml-1"
          style={{ color: "var(--mc-muted)", opacity: busy ? 0.5 : 1 }}
          title="Add gateway"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
