"use client";

import {
  Server,
  LayoutDashboard,
  MessageSquare,
  Activity,
  Calendar,
  Puzzle,
  Settings,
  Bot,
  ChevronLeft,
} from "lucide-react";

const MOCK_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Chat", icon: MessageSquare, active: false },
  { label: "Activity", icon: Activity, active: false },
  { label: "Cron", icon: Calendar, active: false },
  { label: "Skills", icon: Puzzle, active: false },
  { label: "Settings", icon: Settings, active: false },
];

const MOCK_AGENTS = [
  { emoji: "\u{1F52E}", name: "Oracle", id: "oracle", template: "base", model: "claude-sonnet-4" },
  { emoji: "\u{1F6E1}\uFE0F", name: "Guardian", id: "guardian", template: "base", model: "gpt-4o" },
  { emoji: "\u{1F3A8}", name: "Designer", id: "designer", template: "coder", model: "claude-sonnet-4" },
];

export function AppPreviewMock() {
  return (
    <div
      className="flex w-full h-full min-h-screen"
      style={{
        backgroundColor: "var(--mc-bg)",
        opacity: 0.45,
        filter: "blur(1.5px) saturate(0.6)",
      }}
    >
      {/* Mock Sidebar */}
      <div
        className="hidden md:flex flex-col flex-shrink-0 border-r"
        style={{
          width: 240,
          borderColor: "var(--mc-border)",
          backgroundColor: "var(--mc-sidebar)",
        }}
      >
        {/* Logo */}
        <div
          className="h-14 flex items-center px-4 border-b"
          style={{ borderColor: "var(--mc-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--mc-surface)" }}
            >
              <Server className="w-4 h-4" style={{ color: "var(--mc-text)", opacity: 0.8 }} />
            </div>
            <span
              className="font-heading text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--mc-text)" }}
            >
              Clawboard
            </span>
          </div>
        </div>

        {/* Gateway status */}
        <div className="px-3 pt-3 pb-1">
          <div
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-text)" }}
          >
            <div className="status-dot-running" />
            <span>Gateway Running</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden">
          {MOCK_NAV.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm"
              style={{
                color: item.active ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: item.active ? "var(--mc-surface)" : "transparent",
              }}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span>{item.label}</span>
            </div>
          ))}

          {/* Agents header */}
          <div className="pt-4 pb-1">
            <span
              className="px-2.5 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--mc-muted)", opacity: 0.6 }}
            >
              Agents
            </span>
          </div>
          {MOCK_AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm"
              style={{ color: "var(--mc-muted)" }}
            >
              <span className="text-sm flex-shrink-0 leading-none">{agent.emoji}</span>
              <span className="truncate">{agent.name}</span>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-2 border-t" style={{ borderColor: "var(--mc-border)" }}>
          <div
            className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-sm"
            style={{ color: "var(--mc-muted)" }}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Collapse</span>
          </div>
        </div>
      </div>

      {/* Mock Dashboard Content */}
      <div className="flex-1 p-4 pt-14 sm:p-6 md:p-8 overflow-hidden">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-semibold tracking-tight" style={{ color: "var(--mc-text)" }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
            Manage your AI agents
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)" }}
              >
                Total Agents
              </span>
              <Bot className="w-4 h-4" style={{ color: "var(--mc-text)", opacity: 0.8 }} />
            </div>
            <div className="font-heading text-2xl font-semibold" style={{ color: "var(--mc-text)" }}>
              3
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)" }}
              >
                Gateway
              </span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-heading text-2xl font-semibold" style={{ color: "var(--mc-text)" }}>
              Running
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)" }}
              >
                Events
              </span>
            </div>
            <div className="font-heading text-2xl font-semibold" style={{ color: "var(--mc-text)" }}>
              127
            </div>
          </div>
        </div>

        {/* Agent cards grid */}
        <div className="mb-4">
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--mc-muted)" }}
          >
            Agents
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_AGENTS.map((agent) => (
            <div key={agent.id} className="glass-card-hover p-5">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--mc-surface)" }}
                >
                  <span className="text-lg leading-none">{agent.emoji}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-sm truncate" style={{ color: "var(--mc-text)" }}>
                    {agent.name}
                  </h3>
                  <p
                    className="text-xs mt-0.5 truncate font-mono"
                    style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                  >
                    {agent.id}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--mc-muted)", opacity: 0.6 }}>Template</span>
                  <span style={{ color: "var(--mc-text)", opacity: 0.6 }}>{agent.template}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--mc-muted)", opacity: 0.6 }}>Model</span>
                  <span style={{ color: "var(--mc-text)", opacity: 0.6 }}>{agent.model}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
