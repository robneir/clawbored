"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

interface AgentSnapshot {
  id: string;
  displayName: string;
  template: string;
  status: string;
  avatar: string;
  model: string;
  busy: boolean;
}

interface GatewaySnapshot {
  status: string;
  live?: boolean;
  port?: number;
  profileDir?: string;
  profileName?: string;
  displayName?: string;
  deployId?: string | null;
}

interface ActiveAgentUnread {
  agentId: string;
  hasUnread: boolean;
}

interface OtherProfileUnread {
  profileName: string;
  unreadAgentCount: number;
}

interface NotificationSnapshot {
  activeProfile: {
    profileName: string;
    agents: ActiveAgentUnread[];
  };
  otherProfiles: OtherProfileUnread[];
  totalUnreadProfiles: number;
}

interface ActivitySnapshot {
  id: string;
  kind: string;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: number;
  preview: string;
  meta?: Record<string, string>;
}

export interface LiveData {
  agents: AgentSnapshot[];
  gateway: GatewaySnapshot | null;
  notifications: NotificationSnapshot | null;
  activity: ActivitySnapshot[];
  connected: boolean;
}

const LiveContext = createContext<LiveData>({
  agents: [],
  gateway: null,
  notifications: null,
  activity: [],
  connected: false,
});

export function useLive() {
  return useContext(LiveContext);
}

const MAX_BACKOFF = 8000;

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LiveData>({
    agents: [],
    gateway: null,
    notifications: null,
    activity: [],
    connected: false,
  });

  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource("/api/events/stream");
    esRef.current = es;

    es.addEventListener("sync", (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (mountedRef.current) {
          setData({
            agents: payload.agents || [],
            gateway: payload.gateway || null,
            notifications: payload.notifications || null,
            activity: payload.activity || [],
            connected: true,
          });
          backoffRef.current = 1000; // reset on success
        }
      } catch {}
    });

    es.addEventListener("ping", () => {
      // Keep-alive — mark as connected
      if (mountedRef.current) {
        setData((prev) => (prev.connected ? prev : { ...prev, connected: true }));
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (mountedRef.current) {
        setData((prev) => (prev.connected ? { ...prev, connected: false } : prev));
        // Reconnect with exponential backoff
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    es.onopen = () => {
      backoffRef.current = 1000;
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  // Page Visibility: pause when hidden, resume when visible
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        disconnect();
        setData((prev) => (prev.connected ? { ...prev, connected: false } : prev));
      } else {
        connect();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connect, disconnect]);

  // Initial connection + cleanup
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return <LiveContext.Provider value={data}>{children}</LiveContext.Provider>;
}
