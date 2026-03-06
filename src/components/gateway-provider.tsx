"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

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
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageTransition, setPageTransition] = useState<PageTransition | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchGateway = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway");
      if (res.ok) setGateway(await res.json());
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerTransition = useCallback((transition: PageTransition, durationMs = 1800) => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPageTransition(transition);
    // durationMs=0 means persistent — stays until clearTransition() is called
    if (durationMs > 0) {
      transitionTimer.current = setTimeout(() => setPageTransition(null), durationMs);
    }
  }, []);

  const clearTransition = useCallback(() => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPageTransition(null);
  }, []);

  useEffect(() => {
    fetchGateway();
    const interval = setInterval(fetchGateway, 5000);
    return () => clearInterval(interval);
  }, [fetchGateway]);

  return (
    <GatewayContext.Provider
      value={{ gateway, loading, refresh: fetchGateway, pageTransition, triggerTransition, clearTransition }}
    >
      {children}
    </GatewayContext.Provider>
  );
}
