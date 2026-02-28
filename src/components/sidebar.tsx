"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Rocket,
  Settings,
  ChevronLeft,
  ChevronRight,
  Server,
  MessageSquare,
} from "lucide-react";

interface Instance {
  name: string;
  displayName: string;
  port: number;
  live?: boolean;
  status: string;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/deploy", label: "Deploy", icon: Rocket },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchInstances() {
    try {
      const res = await fetch("/api/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
      }
    } catch {}
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-screen flex flex-col border-r flex-shrink-0 relative"
      style={{ borderColor: "var(--mc-border)", backgroundColor: "var(--mc-sidebar)" }}
    >
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
                Mission Control
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

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
              style={{
                color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
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

        {/* Instance list */}
        {instances.length > 0 && (
          <>
            <div className="pt-4 pb-1">
              {!collapsed && (
                <span
                  className="px-2.5 text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                >
                  Instances
                </span>
              )}
            </div>
            {instances.map((inst) => {
              const isActive = pathname === `/instances/${inst.name}`;
              return (
                <Link
                  key={inst.name}
                  href={`/instances/${inst.name}`}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150"
                  style={{
                    color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                    backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
                  }}
                >
                  <div
                    className={
                      inst.live ? "status-dot-running" : "status-dot-stopped"
                    }
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="whitespace-nowrap overflow-hidden truncate"
                      >
                        {inst.displayName || inst.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t" style={{ borderColor: "var(--mc-border)" }}>
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
    </motion.aside>
  );
}
