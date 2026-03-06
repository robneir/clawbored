"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
  MessageSquare,
  Activity,
  Bot,
  Calendar,
  Puzzle,
  ChevronDown,
  Check,
  Trash2,
} from "lucide-react";
import { useGateway } from "./gateway-provider";
import { useLive } from "./live-provider";

interface Agent {
  id: string;
  displayName: string;
  template: string;
  status: string;
  avatar: string;
  busy?: boolean;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/cron", label: "Cron", icon: Calendar },
  { href: "/skills", label: "Skills", icon: Puzzle },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface DetectedProfile {
  name: string;
  dir: string;
  port: number | null;
  agentCount: number;
  isRunning: boolean;
  isActive: boolean;
}

interface ActiveAgentUnread {
  agentId: string;
  hasUnread: boolean;
}

interface OtherProfileUnread {
  profileName: string;
  unreadAgentCount: number;
}

interface UnreadSummary {
  activeProfile: {
    profileName: string;
    agents: ActiveAgentUnread[];
  };
  otherProfiles: OtherProfileUnread[];
  totalUnreadProfiles: number;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { gateway, triggerTransition, clearTransition, refresh: refreshGateway } = useGateway();
  const live = useLive();
  const [collapsed, setCollapsed] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [profiles, setProfiles] = useState<DetectedProfile[]>([]);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState<string | null>(null);
  const [unreads, setUnreads] = useState<UnreadSummary | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync agents from SSE live data
  useEffect(() => {
    if (live.agents.length > 0) {
      setAgents(live.agents);
    }
  }, [live.agents]);

  // Sync notifications from SSE live data
  useEffect(() => {
    if (live.notifications) {
      setUnreads(live.notifications);
    }
  }, [live.notifications]);

  // Listen for instant busy state updates from the chat page
  useEffect(() => {
    function handleBusy(e: Event) {
      const { agentId, busy } = (e as CustomEvent).detail;
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, busy } : a)),
      );
    }
    window.addEventListener("agent-busy", handleBusy);
    return () => window.removeEventListener("agent-busy", handleBusy);
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Fetch profiles (still polled — not in SSE stream)
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/profiles");
      if (res.ok) setProfiles(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchProfiles();
    const interval = setInterval(fetchProfiles, 10000);
    return () => clearInterval(interval);
  }, [fetchProfiles]);

  async function markAgentRead(agentId: string) {
    if (!activeProfile) return;
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName: activeProfile.name, agentId }),
      });
    } catch {}
  }

  // Close dropdown on click outside
  useEffect(() => {
    if (!profileDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileDropdownOpen]);

  async function handleSwitchProfile(dir: string) {
    const targetProfile = profiles.find((p) => p.dir === dir);

    // Immediately show transition overlay and close dropdown
    triggerTransition({
      title: targetProfile?.name || "Instance",
      subtitle: "Switching instance...",
    }, 0); // persistent — stays until we clear it
    setProfileDropdownOpen(false);
    setSwitchingProfile(dir);

    try {
      const res = await fetch("/api/gateway/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDir: dir }),
      });
      if (res.ok) {
        refreshGateway();
        fetchProfiles(); // background — don't block UI
      }
    } catch {}
    setSwitchingProfile(null);
    clearTransition();
  }

  async function handleDeleteProfile(dir: string, name: string) {
    if (!confirm(`Delete instance "${name}"? This will remove all files in the instance directory.`)) return;
    try {
      await fetch("/api/gateway/profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDir: dir }),
      });
      fetchProfiles();
    } catch {}
  }

  const gwLive = gateway?.live ?? false;
  const gwNotSetup = gateway?.status === "not_setup";
  const activeProfile = profiles.find((p) => p.isActive);
  const gatedPages = ["/chat", "/activity", "/cron", "/skills"];

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b" style={{ borderColor: "var(--mc-border)" }}>
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 overflow-hidden"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--mc-surface)" }}
              >
                <Server className="w-4 h-4" style={{ color: "var(--mc-text)", opacity: 0.8 }} />
              </div>
              <span
                className="font-heading text-[15px] font-semibold tracking-tight whitespace-nowrap"
                style={{ color: "var(--mc-text)" }}
              >
                Clawboard
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto"
              style={{ backgroundColor: "var(--mc-surface)" }}
            >
              <Server className="w-4 h-4" style={{ color: "var(--mc-text)", opacity: 0.8 }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Profile Selector */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 relative" ref={dropdownRef}>
          <button
            onClick={() => {
              if (gwNotSetup && profiles.length === 0) {
                router.push("/deploy");
                return;
              }
              setProfileDropdownOpen(!profileDropdownOpen);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors"
            style={{
              backgroundColor: "var(--mc-surface)",
              color: gwLive ? "var(--mc-text)" : "var(--mc-muted)",
            }}
          >
            <div className={gwLive ? "status-dot-running" : "status-dot-stopped"} />
            <span className="truncate flex-1 text-left">
              {activeProfile
                ? activeProfile.name
                : gwNotSetup
                ? "Set Up Instance"
                : gateway?.displayName || "Instance"}
            </span>
            {unreads && unreads.totalUnreadProfiles > 0 && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--mc-accent)" }}
              />
            )}
            <ChevronDown
              className="w-3 h-3 flex-shrink-0 transition-transform"
              style={{
                color: "var(--mc-muted)",
                transform: profileDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {profileDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-3 right-3 top-full mt-1 rounded-lg border overflow-hidden z-50"
                style={{
                  backgroundColor: "var(--mc-sidebar)",
                  borderColor: "var(--mc-border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                {profiles.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                      No instances found
                    </p>
                  </div>
                )}

                {profiles.map((profile) => (
                  <div
                    key={profile.dir}
                    className="group flex items-center"
                  >
                    <button
                      onClick={() => {
                        if (!profile.isActive) handleSwitchProfile(profile.dir);
                        else setProfileDropdownOpen(false);
                      }}
                      disabled={switchingProfile === profile.dir}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors min-w-0"
                      style={{
                        color: profile.isActive ? "var(--mc-text)" : "var(--mc-muted)",
                      }}
                      onMouseEnter={(e) => {
                        if (!profile.isActive) e.currentTarget.style.backgroundColor = "var(--mc-surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div className={profile.isRunning ? "status-dot-running" : "status-dot-stopped"} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{profile.name}</span>
                          {profile.isActive && (
                            <Check className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-accent)" }} />
                          )}
                        </div>
                        {profile.port && (
                          <span className="text-[10px] block" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                            :{profile.port} · {profile.agentCount} agent{profile.agentCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const pu = unreads?.otherProfiles.find((p) => p.profileName === profile.name);
                        if (pu && pu.unreadAgentCount > 0) {
                          return (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: "var(--mc-accent)", color: "#fff" }}
                            >
                              {pu.unreadAgentCount}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {switchingProfile === profile.dir && (
                        <div
                          className="w-3 h-3 border rounded-full animate-spin flex-shrink-0"
                          style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
                        />
                      )}
                    </button>
                    {!profile.isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(profile.dir, profile.name);
                        }}
                        className="w-7 h-7 mr-1 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--mc-muted)" }}
                        title={`Delete ${profile.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Divider + Create new */}
                <div className="border-t" style={{ borderColor: "var(--mc-border)" }}>
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      router.push("/deploy");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors"
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
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const isGated = gwNotSetup && gatedPages.includes(item.href);

          return (
            <Link
              key={item.href}
              href={isGated ? "/deploy" : item.href}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
              style={{
                color: isActive && !isGated ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: isActive && !isGated ? "var(--mc-surface)" : "transparent",
                opacity: isGated ? 0.35 : 1,
              }}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}

        {/* Agents section — hidden when no profile */}
        {!gwNotSetup && <div>
          <div className="pt-4 pb-1">
            {!collapsed && (
              <span
                className="px-2.5 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)", opacity: 0.6 }}
              >
                Agents
              </span>
            )}
          </div>
          {agents.map((agent) => {
            const isActive = pathname === `/agents/${agent.id}`;
            return (
              <div
                key={agent.id}
                className="group flex items-center rounded-lg transition-all duration-150"
                style={{
                  backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
                }}
              >
                <button
                  onClick={() => {
                    if (!isActive) {
                      triggerTransition({
                        title: agent.displayName || agent.id,
                        subtitle: "Loading agent...",
                        avatar: agent.avatar || undefined,
                      }, 1200);
                      router.push(`/agents/${agent.id}`);
                      onMobileClose?.();
                    }
                    markAgentRead(agent.id);
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 flex-1 min-w-0 text-sm text-left"
                  style={{
                    color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                  }}
                >
                  <span className="relative flex-shrink-0">
                    {agent.avatar ? (
                      <span className="text-sm leading-none">{agent.avatar}</span>
                    ) : (
                      <Bot className="w-3.5 h-3.5" style={{ opacity: 0.6 }} />
                    )}
                    {unreads?.activeProfile?.agents?.find((a) => a.agentId === agent.id)?.hasUnread && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                        style={{ backgroundColor: "var(--mc-accent)" }}
                      />
                    )}
                  </span>
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="whitespace-nowrap overflow-hidden truncate flex-1"
                      >
                        {agent.displayName || agent.id}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!collapsed && agent.busy && (
                    <span className="typing-dots flex-shrink-0" style={{ color: "var(--mc-accent)" }}>
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </span>
                  )}
                  {!collapsed && !agent.busy && unreads?.activeProfile?.agents?.find((a) => a.agentId === agent.id)?.hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "var(--mc-accent)" }}
                    />
                  )}
                </button>
              </div>
            );
          })}
          {(() => {
            const isActive = pathname === "/agents/new";
            return (
              <Link
                href="/agents/new"
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
                style={{
                  color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                  backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
                }}
              >
                <Plus className="w-[18px] h-[18px] flex-shrink-0" style={{ opacity: 0.6 }} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      New Agent
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })()}
        </div>}
      </nav>

      {/* Collapse toggle — hidden on mobile overlay */}
      <div className="hidden md:block p-2 border-t" style={{ borderColor: "var(--mc-border)" }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-150 text-sm"
          style={{ color: "var(--mc-muted)" }}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="hidden md:flex h-screen flex-col border-r flex-shrink-0 relative"
        style={{ borderColor: "var(--mc-border)", backgroundColor: "var(--mc-sidebar)" }}
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
              onClick={onMobileClose}
            />
            {/* Sidebar panel */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col border-r"
              style={{ borderColor: "var(--mc-border)", backgroundColor: "var(--mc-sidebar)" }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
