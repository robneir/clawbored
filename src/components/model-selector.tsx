"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Check, ChevronDown, Bot, Lock } from "lucide-react";
import { AnthropicIcon, OpenAIIcon } from "./provider-icons";

interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  docsUrl: string;
}

const PROVIDER_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
};

interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  category: "flagship" | "standard" | "fast";
}

interface ModelGroup {
  provider: ModelProvider;
  models: ModelDefinition[];
  hasApiKey: boolean;
}

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  flagship: "Flagship",
  standard: "Standard",
  fast: "Fast",
};

const CATEGORY_COLORS: Record<string, string> = {
  flagship: "#a855f7",
  standard: "#3b82f6",
  fast: "#22c55e",
};

export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchModels();
  }, []);

  async function fetchModels() {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
      // Silent failure — curated list shown
    } finally {
      setLoading(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
      setFilter(null);
    }
  }, [open]);

  // Find the selected model info
  const selectedModel = useMemo(() => {
    for (const g of groups) {
      const found = g.models.find((m) => m.id === value);
      if (found) return { model: found, provider: g.provider };
    }
    return null;
  }, [groups, value]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (filter) {
      result = result.filter((g) => g.provider.id === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result
        .map((g) => ({
          ...g,
          models: g.models.filter(
            (m) =>
              m.id.toLowerCase().includes(q) ||
              m.name.toLowerCase().includes(q) ||
              g.provider.name.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.models.length > 0);
    }
    return result;
  }, [groups, search, filter]);

  const displayValue =
    value === "default"
      ? "Default"
      : selectedModel
        ? selectedModel.model.name
        : value || "Select model";

  const SelectedIcon = selectedModel ? PROVIDER_ICON_MAP[selectedModel.provider.id] : null;

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm text-left transition-all"
        style={{
          backgroundColor: "var(--mc-surface)",
          borderColor: open ? "var(--mc-accent)" : "var(--mc-border)",
          color: "var(--mc-text)",
        }}
      >
        {SelectedIcon ? (
          <SelectedIcon size={16} className="flex-shrink-0" />
        ) : (
          <Bot className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
        )}
        <span className="flex-1 truncate">{displayValue}</span>
        {selectedModel && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${CATEGORY_COLORS[selectedModel.model.category]}20`,
              color: CATEGORY_COLORS[selectedModel.model.category],
            }}
          >
            {CATEGORY_LABELS[selectedModel.model.category]}
          </span>
        )}
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
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
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl border overflow-hidden"
            style={{
              backgroundColor: "var(--mc-sidebar)",
              borderColor: "var(--mc-border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              maxHeight: "380px",
            }}
          >
            {/* Search */}
            <div className="p-2 border-b" style={{ borderColor: "var(--mc-border)" }}>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: "var(--mc-muted)" }}
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-transparent outline-none rounded-lg"
                  style={{ color: "var(--mc-text)" }}
                />
              </div>
            </div>

            {/* Provider filter pills */}
            <div
              className="flex gap-1 px-2 py-1.5 border-b overflow-x-auto no-scrollbar"
              style={{ borderColor: "var(--mc-border)" }}
            >
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="flex-shrink-0 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: !filter ? "var(--mc-accent)" : "transparent",
                  color: !filter ? "white" : "var(--mc-muted)",
                }}
              >
                All
              </button>
              {groups.map((g) => {
                const PIcon = PROVIDER_ICON_MAP[g.provider.id];
                return (
                  <button
                    key={g.provider.id}
                    type="button"
                    onClick={() => setFilter(filter === g.provider.id ? null : g.provider.id)}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                    style={{
                      backgroundColor: filter === g.provider.id ? "var(--mc-accent)" : "transparent",
                      color: filter === g.provider.id ? "white" : "var(--mc-muted)",
                    }}
                  >
                    {PIcon && <PIcon size={12} />}
                    {g.provider.name}
                  </button>
                );
              })}
            </div>

            {/* Model list */}
            <div className="overflow-y-auto" style={{ maxHeight: "280px" }}>
              {/* Default option */}
              <button
                type="button"
                onClick={() => {
                  onChange("default");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                style={{ color: value === "default" ? "var(--mc-text)" : "var(--mc-muted)" }}
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="flex-1">Default (Agent Default)</span>
                {value === "default" && (
                  <Check className="w-3.5 h-3.5" style={{ color: "var(--mc-accent)" }} />
                )}
              </button>

              {loading ? (
                <div className="p-4 text-center text-xs" style={{ color: "var(--mc-muted)" }}>
                  Loading models...
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: "var(--mc-muted)" }}>
                  No models found
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.provider.id}>
                    {/* Provider header */}
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--mc-muted)", backgroundColor: "var(--mc-surface)" }}
                    >
                      {(() => {
                        const GIcon = PROVIDER_ICON_MAP[group.provider.id];
                        return GIcon ? <GIcon size={12} /> : null;
                      })()}
                      <span>{group.provider.name}</span>
                      {!group.hasApiKey && (
                        <span className="flex items-center gap-1 ml-auto normal-case tracking-normal" style={{ opacity: 0.6 }}>
                          <Lock className="w-2.5 h-2.5" />
                          Needs key
                        </span>
                      )}
                    </div>

                    {/* Models */}
                    {group.models.map((model) => {
                      const isSelected = value === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            onChange(model.id);
                            setOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                          style={{
                            color: isSelected ? "var(--mc-text)" : "var(--mc-muted)",
                            opacity: group.hasApiKey ? 1 : 0.5,
                          }}
                        >
                          <span className="flex-1 truncate">{model.name}</span>
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: `${CATEGORY_COLORS[model.category]}15`,
                              color: CATEGORY_COLORS[model.category],
                            }}
                          >
                            {CATEGORY_LABELS[model.category]}
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mc-accent)" }} />
                          )}
                        </button>
                      );
                    })}
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
