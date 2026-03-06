"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  User,
  Bot,
  Wrench,
  CheckCircle,
  Zap,
  Play,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLive } from "@/components/live-provider";

interface ActivityEvent {
  id: string;
  kind: string;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: number;
  preview: string;
  meta?: Record<string, string>;
}

interface Agent {
  id: string;
  displayName: string;
  avatar: string;
}

const EVENT_CONFIG: Record<
  string,
  { icon: typeof User; color: string; label: string }
> = {
  user_message: { icon: User, color: "#6366f1", label: "Message" },
  assistant_response: { icon: Bot, color: "#22c55e", label: "Response" },
  tool_call: { icon: Wrench, color: "#eab308", label: "Tool Call" },
  tool_result: { icon: CheckCircle, color: "#3b82f6", label: "Tool Result" },
  model_change: { icon: Zap, color: "#a855f7", label: "Model Change" },
  session_start: { icon: Play, color: "#22c55e", label: "Session Start" },
};

function formatEventDescription(event: ActivityEvent): string {
  switch (event.kind) {
    case "user_message":
      return `Sent message to ${event.agentName}`;
    case "assistant_response":
      return `${event.agentName} responded`;
    case "tool_call":
      return `${event.agentName} used ${event.meta?.toolName || "a tool"}`;
    case "tool_result":
      return "Tool completed";
    case "model_change":
      return `Model changed to ${event.meta?.model || "unknown"}`;
    case "session_start":
      return `Session started for ${event.agentName}`;
    default:
      return event.kind;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateHeader(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(
  events: ActivityEvent[]
): { date: string; events: ActivityEvent[] }[] {
  const groups: Map<string, ActivityEvent[]> = new Map();

  for (const event of events) {
    const dateKey = new Date(event.timestamp).toDateString();
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(event);
  }

  return Array.from(groups.entries()).map(([, events]) => ({
    date: formatDateHeader(events[0].timestamp),
    events,
  }));
}

export default function ActivityPage() {
  const live = useLive();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [filterAgent, setFilterAgent] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const hasFilters = filterAgent || filterKind;

  const fetchEvents = useCallback(
    async (before?: number, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams();
        if (filterAgent) params.set("agentId", filterAgent);
        if (filterKind) params.set("kind", filterKind);
        params.set("limit", "50");
        if (before) params.set("before", before.toString());

        const res = await fetch(`/api/activity?${params}`);
        if (res.ok) {
          const data = await res.json();
          const newEvents: ActivityEvent[] = data.events || [];

          if (append) {
            setEvents((prev) => [...prev, ...newEvents]);
          } else {
            setEvents(newEvents);
          }

          setHasMore(newEvents.length >= 50);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filterAgent, filterKind]
  );

  // When filters are active, fetch from API; otherwise use live data
  useEffect(() => {
    if (hasFilters) {
      fetchEvents();
    }
  }, [fetchEvents, hasFilters]);

  // Sync from SSE when no filters are active
  useEffect(() => {
    if (!hasFilters && live.activity.length > 0) {
      setEvents(live.activity as ActivityEvent[]);
      setLoading(false);
    }
  }, [live.activity, hasFilters]);

  // Sync agents from live data for filter dropdown
  useEffect(() => {
    if (live.agents.length > 0) {
      setAgents(live.agents as unknown as Agent[]);
    }
  }, [live.agents]);

  // Mark loading done when connected
  useEffect(() => {
    if (live.connected && loading && !hasFilters) setLoading(false);
  }, [live.connected, loading, hasFilters]);

  function handleLoadMore() {
    if (events.length === 0) return;
    const oldest = events[events.length - 1].timestamp;
    fetchEvents(oldest, true);
  }

  const groups = groupByDate(events);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div
        className="px-8 py-6 border-b flex-shrink-0"
        style={{ borderColor: "var(--mc-border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: "var(--mc-text)" }}
            >
              Activity
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
              Timeline of events across all agents
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mt-4">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              backgroundColor: "var(--mc-surface)",
              border: "1px solid var(--mc-border)",
              color: "var(--mc-text)",
            }}
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.avatar} {a.displayName || a.id}
              </option>
            ))}
          </select>

          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              backgroundColor: "var(--mc-surface)",
              border: "1px solid var(--mc-border)",
              color: "var(--mc-text)",
            }}
          >
            <option value="">All Events</option>
            {Object.entries(EVENT_CONFIG).map(([kind, cfg]) => (
              <option key={kind} value={kind}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--mc-muted)" }}
            />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Activity
              className="w-10 h-10 mb-4"
              style={{ color: "var(--mc-muted)", opacity: 0.4 }}
            />
            <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
              No activity yet
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--mc-muted)", opacity: 0.6 }}
            >
              Events will appear here as you interact with agents
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {groups.map((group) => (
                <motion.div
                  key={group.date}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: "var(--mc-muted)" }}
                    >
                      {group.date}
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: "var(--mc-border)" }}
                    />
                  </div>

                  {/* Events */}
                  <div className="space-y-1.5 ml-2">
                    {group.events.map((event, i) => {
                      const config = EVENT_CONFIG[event.kind] || EVENT_CONFIG.user_message;
                      const Icon = config.icon;

                      return (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-start gap-3 py-2 px-3 rounded-lg transition-colors"
                          style={{
                            backgroundColor: "transparent",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "var(--mc-surface)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor =
                              "transparent")
                          }
                        >
                          {/* Icon */}
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                              backgroundColor: `${config.color}15`,
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              style={{ color: config.color }}
                            />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm"
                              style={{ color: "var(--mc-text)" }}
                            >
                              {formatEventDescription(event)}
                            </p>
                            {event.preview &&
                              event.kind !== "model_change" &&
                              event.kind !== "session_start" && (
                                <p
                                  className="text-xs mt-0.5 truncate"
                                  style={{
                                    color: "var(--mc-muted)",
                                    opacity: 0.8,
                                  }}
                                >
                                  {event.preview}
                                </p>
                              )}
                          </div>

                          {/* Timestamp */}
                          <span
                            className="text-[10px] flex-shrink-0 mt-0.5"
                            style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                          >
                            {formatTime(event.timestamp)}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-xs rounded-lg"
                  style={{ color: "var(--mc-muted)" }}
                >
                  {loadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                  ) : null}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
