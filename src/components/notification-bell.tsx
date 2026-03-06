"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, MessageSquare, AlertCircle, Wifi, X } from "lucide-react";
import { useLive } from "./live-provider";

interface NotificationEvent {
  id: string;
  type: "message" | "error" | "gateway";
  profileName: string;
  agentId?: string;
  agentName?: string;
  title: string;
  preview?: string;
  timestamp: number;
  dismissed: boolean;
}

export function NotificationBell() {
  const router = useRouter();
  const live = useLive();
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [undismissedCount, setUndismissedCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);

  // Initial fetch of full notification events (SSE only has summary)
  useEffect(() => {
    if (!initialFetched.current) {
      initialFetched.current = true;
      fetchNotifications();
    }
  }, []);

  // Re-fetch full events when SSE notification summary changes
  useEffect(() => {
    if (live.notifications) {
      // SSE gives us the count — re-fetch the full events list
      fetchNotifications();
    }
  }, [live.notifications]);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setUndismissedCount(data.undismissedCount || 0);
      }
    } catch {}
  }

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

  async function handleDismiss(eventId: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", eventId }),
      });
    } catch {}
    fetchNotifications();
  }

  async function handleDismissAll() {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismissAll" }),
      });
    } catch {}
    fetchNotifications();
  }

  function handleEventClick(event: NotificationEvent) {
    if (event.type === "message" && event.agentId) {
      router.push(`/chat?agent=${event.agentId}&t=${event.timestamp}`);
    } else if (event.type === "error" || event.type === "gateway") {
      router.push("/settings");
    }
    handleDismiss(event.id);
    setOpen(false);
  }

  function getEventIcon(type: string) {
    switch (type) {
      case "message":
        return <MessageSquare className="w-3.5 h-3.5" />;
      case "error":
        return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      case "gateway":
        return <Wifi className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Bell className="w-3.5 h-3.5" />;
    }
  }

  function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const undismissedEvents = events.filter((e) => !e.dismissed);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: "var(--mc-muted)" }}
      >
        <Bell className="w-4 h-4" />
        {undismissedCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: "var(--mc-accent)" }}
          >
            {undismissedCount > 9 ? "9+" : undismissedCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
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
              width: 320,
              maxHeight: 400,
            }}
          >
            {/* Header */}
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--mc-border)" }}
            >
              <span
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--mc-muted)" }}
              >
                Notifications
              </span>
              {undismissedEvents.length > 0 && (
                <button
                  onClick={handleDismissAll}
                  className="text-[11px] transition-colors"
                  style={{ color: "var(--mc-accent)" }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Event list */}
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              {undismissedEvents.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Bell
                    className="w-5 h-5 mx-auto mb-2"
                    style={{ color: "var(--mc-muted)", opacity: 0.4 }}
                  />
                  <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                    No notifications
                  </p>
                </div>
              ) : (
                undismissedEvents
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2.5 px-3 py-2.5 transition-colors group"
                      style={{ borderBottom: "1px solid var(--mc-border)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--mc-surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      {/* Event icon */}
                      <div
                        className="mt-0.5 flex-shrink-0"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        {getEventIcon(event.type)}
                      </div>

                      {/* Event content (clickable) */}
                      <button
                        onClick={() => handleEventClick(event)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div
                          className="text-xs font-medium truncate"
                          style={{ color: "var(--mc-text)" }}
                        >
                          {event.title}
                        </div>
                        {event.preview && (
                          <div
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: "var(--mc-muted)" }}
                          >
                            {event.preview}
                          </div>
                        )}
                        <div
                          className="text-[10px] mt-1"
                          style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                        >
                          {timeAgo(event.timestamp)}
                        </div>
                      </button>

                      {/* Dismiss button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(event.id);
                        }}
                        className="mt-0.5 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
