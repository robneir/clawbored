"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Loader2, Search, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelSelector } from "@/components/model-selector";
import { DEFAULT_MODEL } from "@/lib/models";

// ── Template Data ────────────────────────────────────────────

interface Template {
  value: string;
  label: string;
  emoji: string;
  group: string;
  description: string;
}

const TEMPLATES: Template[] = [
  { value: "general", label: "General Assistant", emoji: "🤖", group: "General", description: "Friendly all-purpose helper for any task" },
  { value: "custom", label: "Custom (Blank)", emoji: "📝", group: "General", description: "Start from scratch with a blank SOUL.md" },

  { value: "coding", label: "Coding Agent", emoji: "💻", group: "Engineering", description: "Expert full-stack software engineer" },
  { value: "devops", label: "DevOps Engineer", emoji: "🔧", group: "Engineering", description: "CI/CD, infrastructure, and deployment" },
  { value: "frontend", label: "Frontend Developer", emoji: "🎨", group: "Engineering", description: "React, CSS, UI/UX implementation" },
  { value: "backend", label: "Backend Developer", emoji: "⚙️", group: "Engineering", description: "APIs, databases, system architecture" },
  { value: "mobile", label: "Mobile Developer", emoji: "📱", group: "Engineering", description: "iOS, Android, and cross-platform apps" },
  { value: "security", label: "Security Engineer", emoji: "🔒", group: "Engineering", description: "Security audits, vulnerability analysis" },
  { value: "data-engineer", label: "Data Engineer", emoji: "🔀", group: "Engineering", description: "Pipelines, ETL, data infrastructure" },

  { value: "research", label: "Research Agent", emoji: "🔬", group: "Research & Analysis", description: "Thorough analysis with cited sources" },
  { value: "data-analyst", label: "Data Analyst", emoji: "📊", group: "Research & Analysis", description: "Data visualization and statistical analysis" },
  { value: "market-research", label: "Market Research", emoji: "📈", group: "Research & Analysis", description: "Competitive analysis and market insights" },

  { value: "writer", label: "Content Writer", emoji: "✍️", group: "Writing & Content", description: "Blog posts, articles, and copywriting" },
  { value: "technical-writer", label: "Technical Writer", emoji: "📖", group: "Writing & Content", description: "Documentation, guides, and API docs" },
  { value: "editor", label: "Editor & Proofreader", emoji: "🔍", group: "Writing & Content", description: "Grammar, style, and clarity refinement" },
  { value: "social-media", label: "Social Media", emoji: "📣", group: "Writing & Content", description: "Posts, captions, and engagement content" },

  { value: "product-manager", label: "Product Manager", emoji: "🎯", group: "Business & Strategy", description: "Feature specs, roadmaps, and user stories" },
  { value: "business-analyst", label: "Business Analyst", emoji: "💼", group: "Business & Strategy", description: "Requirements, processes, and strategy" },
  { value: "project-manager", label: "Project Manager", emoji: "📋", group: "Business & Strategy", description: "Planning, tracking, and team coordination" },

  { value: "designer", label: "UI/UX Designer", emoji: "🖌️", group: "Creative", description: "Design systems, wireframes, and user flows" },
  { value: "creative-director", label: "Creative Director", emoji: "🎬", group: "Creative", description: "Brand voice, creative strategy, campaigns" },

  { value: "support", label: "Support Agent", emoji: "💬", group: "Support & Ops", description: "Customer-facing help and troubleshooting" },
  { value: "qa", label: "QA Tester", emoji: "🧪", group: "Support & Ops", description: "Test plans, bug reports, quality assurance" },
  { value: "sysadmin", label: "System Admin", emoji: "🖥️", group: "Support & Ops", description: "Server management and infrastructure ops" },

  { value: "tutor", label: "Tutor", emoji: "🎓", group: "Specialized", description: "Patient teaching and concept explanations" },
  { value: "legal", label: "Legal Advisor", emoji: "⚖️", group: "Specialized", description: "Contract review and legal analysis" },
  { value: "finance", label: "Finance Analyst", emoji: "💰", group: "Specialized", description: "Financial modeling and budget analysis" },
];

const GROUPS = [
  "General",
  "Engineering",
  "Research & Analysis",
  "Writing & Content",
  "Business & Strategy",
  "Creative",
  "Support & Ops",
  "Specialized",
];

// ── Page ─────────────────────────────────────────────────────

export default function NewAgentPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [template, setTemplate] = useState("general");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [soulMd, setSoulMd] = useState("");
  const [creating, setCreating] = useState(false);

  // Template picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedTemplate = TEMPLATES.find((t) => t.value === template);

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [pickerOpen]);

  // Focus search when picker opens
  useEffect(() => {
    if (pickerOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setPickerSearch("");
      setPickerFilter(null);
    }
  }, [pickerOpen]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    let results = TEMPLATES;
    if (pickerFilter) {
      results = results.filter((t) => t.group === pickerFilter);
    }
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      results = results.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.group.toLowerCase().includes(q) ||
          t.value.toLowerCase().includes(q)
      );
    }
    return results;
  }, [pickerSearch, pickerFilter]);

  // Group the filtered results
  const groupedTemplates = useMemo(() => {
    const groups: { group: string; items: Template[] }[] = [];
    for (const g of GROUPS) {
      const items = filteredTemplates.filter((t) => t.group === g);
      if (items.length > 0) groups.push({ group: g, items });
    }
    return groups;
  }, [filteredTemplates]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!id || creating) return;

    setCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          displayName: displayName || id,
          template,
          model: model !== "default" ? model : undefined,
          soulMdContent: soulMd || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || `Failed with status ${res.status}`);
      }

      toast.success(`${displayName || id} created!`);
      router.push(`/agents/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create agent";
      toast.error(msg);
      setCreating(false);
    }
  }

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1
          className="font-heading text-3xl font-semibold tracking-tight"
          style={{ color: "var(--mc-text)" }}
        >
          Create Agent
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
          Add a new AI agent with its own personality
        </p>
      </motion.div>

      <motion.form
        onSubmit={handleCreate}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        {/* Agent ID */}
        <div className="space-y-2">
          <Label
            htmlFor="id"
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: "var(--mc-muted)" }}
          >
            Agent ID
          </Label>
          <Input
            id="id"
            placeholder="research-bot"
            value={id}
            onChange={(e) =>
              setId(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
              )
            }
            className="rounded-xl h-11 text-sm"
            style={{
              backgroundColor: "var(--mc-surface)",
              borderColor: "var(--mc-border)",
              color: "var(--mc-text)",
            }}
          />
          <p
            className="text-[11px]"
            style={{ color: "var(--mc-muted)", opacity: 0.5 }}
          >
            Lowercase letters, numbers, and hyphens only
          </p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label
            htmlFor="displayName"
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: "var(--mc-muted)" }}
          >
            Display Name
          </Label>
          <Input
            id="displayName"
            placeholder="Research Bot"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-xl h-11 text-sm"
            style={{
              backgroundColor: "var(--mc-surface)",
              borderColor: "var(--mc-border)",
              color: "var(--mc-text)",
            }}
          />
        </div>

        {/* Template Picker */}
        <div className="space-y-2">
          <Label
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: "var(--mc-muted)" }}
          >
            Template
          </Label>

          <div className="relative" ref={pickerRef}>
            {/* Trigger button */}
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              className="w-full flex items-center justify-between rounded-xl h-11 text-sm px-3 transition-all outline-none"
              style={{
                backgroundColor: "var(--mc-surface)",
                border: `1px solid ${pickerOpen ? "var(--mc-accent)" : "var(--mc-border)"}`,
                color: "var(--mc-text)",
              }}
            >
              {selectedTemplate ? (
                <span className="flex items-center gap-2.5">
                  <span className="text-base leading-none">{selectedTemplate.emoji}</span>
                  <span className="font-medium">{selectedTemplate.label}</span>
                  <span className="text-[11px]" style={{ color: "var(--mc-muted)" }}>
                    — {selectedTemplate.group}
                  </span>
                </span>
              ) : (
                <span style={{ color: "var(--mc-muted)" }}>Select a template...</span>
              )}
              <ChevronDown
                className="w-4 h-4 transition-transform flex-shrink-0"
                style={{
                  color: "var(--mc-muted)",
                  transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-50 left-0 right-0 top-full mt-2 rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: "var(--mc-bg)",
                    border: "1px solid var(--mc-border)",
                    boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
                  }}
                >
                  {/* Search */}
                  <div className="p-2" style={{ borderBottom: "1px solid var(--mc-border)" }}>
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                        style={{ color: "var(--mc-muted)" }}
                      />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search templates..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        className="w-full rounded-lg h-9 text-sm pl-9 pr-3 outline-none"
                        style={{
                          backgroundColor: "var(--mc-surface)",
                          border: "1px solid var(--mc-border)",
                          color: "var(--mc-text)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Category filter pills */}
                  <div
                    className="flex gap-1 px-2 py-2 overflow-x-auto"
                    style={{ borderBottom: "1px solid var(--mc-border)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setPickerFilter(null)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0"
                      style={{
                        backgroundColor: !pickerFilter ? "var(--mc-accent)" : "var(--mc-surface)",
                        color: !pickerFilter ? "white" : "var(--mc-muted)",
                      }}
                    >
                      All
                    </button>
                    {GROUPS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setPickerFilter(pickerFilter === g ? null : g)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0"
                        style={{
                          backgroundColor: pickerFilter === g ? "var(--mc-accent)" : "var(--mc-surface)",
                          color: pickerFilter === g ? "white" : "var(--mc-muted)",
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  {/* Template list */}
                  <div
                    className="overflow-y-auto overscroll-contain py-1"
                    style={{ maxHeight: "320px" }}
                  >
                    {groupedTemplates.length === 0 ? (
                      <div className="py-8 text-center">
                        <Search
                          className="w-6 h-6 mx-auto mb-2"
                          style={{ color: "var(--mc-muted)", opacity: 0.3 }}
                        />
                        <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                          No templates match &ldquo;{pickerSearch}&rdquo;
                        </p>
                      </div>
                    ) : (
                      groupedTemplates.map(({ group, items }, gi) => (
                        <div key={group}>
                          {gi > 0 && (
                            <div
                              className="mx-2 my-1 h-px"
                              style={{ backgroundColor: "var(--mc-border)" }}
                            />
                          )}
                          <div
                            className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold"
                            style={{ color: "var(--mc-muted)", opacity: 0.5 }}
                          >
                            {group}
                          </div>
                          {items.map((t) => {
                            const isSelected = template === t.value;
                            return (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => {
                                  setTemplate(t.value);
                                  setPickerOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all rounded-lg mx-0"
                                style={{
                                  backgroundColor: isSelected
                                    ? "var(--mc-surface)"
                                    : "transparent",
                                  color: "var(--mc-text)",
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--mc-surface)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                  }
                                }}
                              >
                                <span className="text-xl leading-none flex-shrink-0 w-7 text-center">
                                  {t.emoji}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{t.label}</div>
                                  <div
                                    className="text-[11px] leading-tight mt-0.5"
                                    style={{ color: "var(--mc-muted)" }}
                                  >
                                    {t.description}
                                  </div>
                                </div>
                                {isSelected && (
                                  <Check
                                    className="w-4 h-4 flex-shrink-0"
                                    style={{ color: "var(--mc-accent)" }}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer count */}
                  <div
                    className="px-3 py-2 text-[10px]"
                    style={{
                      color: "var(--mc-muted)",
                      opacity: 0.5,
                      borderTop: "1px solid var(--mc-border)",
                    }}
                  >
                    {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Model */}
        <div className="space-y-2">
          <Label
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: "var(--mc-muted)" }}
          >
            Model
          </Label>
          <ModelSelector value={model} onChange={setModel} />
        </div>

        {/* SOUL.md */}
        <div className="space-y-2">
          <Label
            htmlFor="soulMd"
            className="text-xs uppercase tracking-wider font-medium"
            style={{ color: "var(--mc-muted)" }}
          >
            SOUL.md
            <span className="normal-case tracking-normal font-normal ml-1" style={{ opacity: 0.5 }}>
              — Optional, auto-generated from template if blank
            </span>
          </Label>
          <textarea
            id="soulMd"
            placeholder="# My Agent&#10;&#10;Define your agent's personality, expertise, and boundaries..."
            value={soulMd}
            onChange={(e) => setSoulMd(e.target.value)}
            rows={8}
            className="w-full border rounded-xl text-sm p-3 outline-none resize-none font-mono"
            style={{
              backgroundColor: "var(--mc-surface)",
              borderColor: "var(--mc-border)",
              color: "var(--mc-text)",
            }}
          />
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={!id || creating}
          className="w-full rounded-xl h-11 text-sm font-medium gap-2 text-white"
          style={{ backgroundColor: "var(--mc-accent)" }}
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {creating ? "Creating..." : "Create Agent"}
        </Button>
      </motion.form>
    </div>
  );
}
