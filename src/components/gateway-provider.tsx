"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLive } from "./live-provider";

interface Gateway {
  status: string;
  live?: boolean;
  port?: number;
  profileDir?: string;
  profileName?: string;
  displayName?: string;
  deployId?: string | null;
}

export interface PageTransition {
  title: string;
  subtitle: string;
  avatar?: string;
}

interface GatewayContextValue {
  gateway: Gateway | null;
  loading: boolean;
  refresh: () => void;
  pageTransition: PageTransition | null;
  triggerTransition: (transition: PageTransition, durationMs?: number) => void;
  clearTransition: () => void;
}

const GatewayContext = createContext<GatewayContextValue>({
  gateway: null,
  loading: true,
  refresh: () => {},
  pageTransition: null,
  triggerTransition: () => {},
  clearTransition: () => {},
});

export function useGateway() {
  return useContext(GatewayContext);
}

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const live = useLive();
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageTransition, setPageTransition] = useState<PageTransition | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync from SSE live data
  useEffect(() => {
    if (live.gateway) {
      setGateway(live.gateway);
      setLoading(false);
    } else if (live.connected) {
      // Connected but no gateway data means not_setup or similar
      setGateway(live.gateway);
      setLoading(false);
    }
  }, [live.gateway, live.connected]);

  // Imperative refresh for after mutations (profile switch, start/stop)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway");
      if (res.ok) setGateway(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  // Initial fetch to avoid waiting for first SSE tick
  useEffect(() => {
    refresh();
  }, [refresh]);

  const triggerTransition = useCallback((transition: PageTransition, durationMs = 1800) => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPageTransition(transition);
    if (durationMs > 0) {
      transitionTimer.current = setTimeout(() => setPageTransition(null), durationMs);
    }
  }, []);

  const clearTransition = useCallback(() => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPageTransition(null);
  }, []);

  return (
    <GatewayContext.Provider
      value={{ gateway, loading, refresh, pageTransition, triggerTransition, clearTransition }}
    >
      {children}
    </GatewayContext.Provider>
  );
}
