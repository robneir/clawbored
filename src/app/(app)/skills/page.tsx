"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Search,
  Download,
  Loader2,
  Star,
  ArrowDownToLine,
  ExternalLink,
  TrendingUp,
  ChevronRight,
  Package,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Brain,
  Globe,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkillDetailDialog } from "@/components/skill-detail-dialog";
import { InstallProgressDialog } from "@/components/install-progress-dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────

interface MissingRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

interface Skill {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  source: string;
  bundled: boolean;
  primaryEnv?: string;
  homepage?: string;
  missing: MissingRequirements;
  apiKeyConfigured: boolean;
}

interface ClawHubSkillStats {
  comments: number;
  downloads: number;
  installsAllTime: number;
  installsCurrent: number;
  stars: number;
  versions: number;
}

interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: ClawHubSkillStats;
  createdAt: number;
  updatedAt: number;
  latestVersion: { version: string; createdAt: number; changelog: string } | null;
  metadata: { os: string[] | null; systems: string[] | null } | null;
}

interface ClawHubExploreResult {
  items: ClawHubSkill[];
  nextCursor: string | null;
}

interface ClawHubResult {
  slug: string;
  name: string;
  score: string;
}

interface AiSkillResult {
  name: string;
  description: string;
  sourceUrl: string;
  whyRecommended: string;
  popularitySignal: string;
  installHint: string;
  category: string;
}

type TabId = "my-skills" | "clawhub" | "smithery";
type ClawHubSortOption = "trending" | "downloads" | "stars" | "installs" | "newest";

// ── Constants ────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "my-skills", label: "My Skills" },
  { id: "clawhub", label: "ClawHub" },
  { id: "smithery", label: "Smithery" },
];

const SORT_OPTIONS: { id: ClawHubSortOption; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "downloads", label: "Most Downloaded" },
  { id: "stars", label: "Most Starred" },
  { id: "installs", label: "Most Installed" },
  { id: "newest", label: "Newest" },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "automation", label: "Automation" },
  { id: "browser", label: "Browser" },
  { id: "code", label: "Code & Dev" },
  { id: "communication", label: "Communication" },
  { id: "data", label: "Data & Analytics" },
  { id: "integrations", label: "Integrations" },
  { id: "media", label: "Media & Content" },
  { id: "ai", label: "AI & Agents" },
  { id: "productivity", label: "Productivity" },
];

const CATEGORY_QUERIES: Record<string, string> = {
  automation: "automation",
  browser: "browser",
  code: "code development",
  communication: "messaging chat slack discord",
  data: "data database analytics",
  integrations: "api integration",
  media: "image video audio media",
  ai: "agent ai model",
  productivity: "notes tasks calendar productivity",
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// ── Helpers ──────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Component ────────────────────────────────────────────────

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("my-skills");

  // My Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mySearchQuery, setMySearchQuery] = useState("");

  // Recommended skills (dynamic)
  const [recommendedSkills, setRecommendedSkills] = useState<ClawHubSkill[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);

  // Detail dialog (local skill)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ClawHub state
  const [hubSort, setHubSort] = useState<ClawHubSortOption>("trending");
  const [hubCategory, setHubCategory] = useState("all");
  const [hubItems, setHubItems] = useState<ClawHubSkill[]>([]);
  const [hubFeatured, setHubFeatured] = useState<ClawHubSkill[]>([]);
  const [hubCursor, setHubCursor] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubLoadingMore, setHubLoadingMore] = useState(false);
  const [hubSearchQuery, setHubSearchQuery] = useState("");
  const [hubSearchResults, setHubSearchResults] = useState<ClawHubResult[]>([]);
  const [hubSearching, setHubSearching] = useState(false);
  const [hubInitialized, setHubInitialized] = useState(false);

  // ClawHub detail dialog
  const [selectedHubSlug, setSelectedHubSlug] = useState<string | null>(null);
  const [hubDetailOpen, setHubDetailOpen] = useState(false);

  // ClawHub install
  const [hubInstalling, setHubInstalling] = useState<string | null>(null);
  const [hubInstallJobId, setHubInstallJobId] = useState<string | null>(null);
  const [hubInstallDialogOpen, setHubInstallDialogOpen] = useState(false);

  // Sort dropdown
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Global search state
  const [globalQuery, setGlobalQuery] = useState("");
  const isSearchMode = globalQuery.trim().length >= 2;

  // AI search state
  const [aiResults, setAiResults] = useState<AiSkillResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Global search — ClawHub results
  const [globalHubResults, setGlobalHubResults] = useState<ClawHubResult[]>([]);
  const [globalHubSearching, setGlobalHubSearching] = useState(false);

  // ── Data fetching ──────────────────────────────────────────

  const fetchSkills = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/skills");
      if (res.ok) setSkills(await res.json());
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Load recommended skills (dynamic — random sort each visit)
  useEffect(() => {
    const sorts: ClawHubSortOption[] = ["trending", "downloads", "stars", "installs"];
    const randomSort = sorts[Math.floor(Math.random() * sorts.length)];
    setRecommendedLoading(true);
    fetch(`/api/skills/clawhub?sort=${randomSort}&limit=12`)
      .then(async (res) => {
        if (res.ok) {
          const data: ClawHubExploreResult = await res.json();
          // Shuffle results so order varies even with same sort
          const shuffled = [...data.items].sort(() => Math.random() - 0.5);
          setRecommendedSkills(shuffled.slice(0, 8));
        }
      })
      .catch(() => {})
      .finally(() => setRecommendedLoading(false));
  }, []);

  // Load featured skills (top by stars)
  const loadFeatured = useCallback(async () => {
    try {
      const res = await fetch("/api/skills/clawhub?sort=stars&limit=10");
      if (res.ok) {
        const data: ClawHubExploreResult = await res.json();
        setHubFeatured(data.items);
      }
    } catch {}
  }, []);

  // Load browse skills
  const loadBrowse = useCallback(async (sort: ClawHubSortOption, reset = true) => {
    if (reset) {
      setHubLoading(true);
      setHubItems([]);
      setHubCursor(null);
    }
    try {
      const res = await fetch(`/api/skills/clawhub?sort=${sort}&limit=20`);
      if (res.ok) {
        const data: ClawHubExploreResult = await res.json();
        setHubItems(data.items);
        setHubCursor(data.nextCursor);
      }
    } catch {} finally {
      setHubLoading(false);
    }
  }, []);

  // Load more (pagination)
  async function loadMore() {
    if (!hubCursor || hubLoadingMore) return;
    setHubLoadingMore(true);
    try {
      const res = await fetch(`/api/skills/clawhub?sort=${hubSort}&limit=20&cursor=${encodeURIComponent(hubCursor)}`);
      if (res.ok) {
        const data: ClawHubExploreResult = await res.json();
        setHubItems((prev) => [...prev, ...data.items]);
        setHubCursor(data.nextCursor);
      }
    } catch {} finally {
      setHubLoadingMore(false);
    }
  }

  // Initialize ClawHub tab on first visit
  useEffect(() => {
    if (activeTab === "clawhub" && !hubInitialized) {
      setHubInitialized(true);
      loadFeatured();
      loadBrowse("trending");
    }
  }, [activeTab, hubInitialized, loadFeatured, loadBrowse]);

  // Sort change
  useEffect(() => {
    if (hubInitialized && hubCategory === "all") {
      loadBrowse(hubSort);
    }
  }, [hubSort, hubInitialized, hubCategory, loadBrowse]);

  // Category change → use search
  useEffect(() => {
    if (!hubInitialized) return;
    if (hubCategory === "all") {
      loadBrowse(hubSort);
    } else {
      const query = CATEGORY_QUERIES[hubCategory];
      if (query) {
        setHubLoading(true);
        fetch(`/api/skills/search?q=${encodeURIComponent(query)}`)
          .then(async (res) => {
            if (res.ok) {
              const results: ClawHubResult[] = await res.json();
              // Convert search results to a lightweight representation
              setHubItems(results.map((r) => ({
                slug: r.slug,
                displayName: r.name,
                summary: "",
                tags: {},
                stats: { comments: 0, downloads: 0, installsAllTime: 0, installsCurrent: 0, stars: 0, versions: 0 },
                createdAt: 0,
                updatedAt: 0,
                latestVersion: null,
                metadata: null,
              })));
              setHubCursor(null);
            }
          })
          .catch(() => {})
          .finally(() => setHubLoading(false));
      }
    }
  }, [hubCategory, hubInitialized, hubSort, loadBrowse]);

  // Hub search debounce
  useEffect(() => {
    if (!hubSearchQuery.trim() || hubSearchQuery.trim().length < 2) {
      setHubSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setHubSearching(true);
      try {
        const res = await fetch(`/api/skills/search?q=${encodeURIComponent(hubSearchQuery.trim())}`);
        if (res.ok) setHubSearchResults(await res.json());
      } catch {} finally {
        setHubSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [hubSearchQuery]);

  // Close sort dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Global search: ClawHub debounce (300ms) ──────────────
  useEffect(() => {
    if (!isSearchMode) {
      setGlobalHubResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setGlobalHubSearching(true);
      try {
        const res = await fetch(`/api/skills/search?q=${encodeURIComponent(globalQuery.trim())}`);
        if (res.ok) setGlobalHubResults(await res.json());
      } catch {} finally {
        setGlobalHubSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalQuery, isSearchMode]);

  // ── Global search: AI debounce (800ms) ───────────────────
  useEffect(() => {
    if (!isSearchMode) {
      setAiResults([]);
      setAiError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch("/api/skills/ai-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: globalQuery.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "failed" }));
          setAiError(data.error || "failed");
          setAiResults([]);
          return;
        }
        const data = await res.json();
        setAiResults(data.results || []);
      } catch {
        setAiError("failed");
      } finally {
        setAiLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [globalQuery, isSearchMode]);

  // ── ClawHub install handler ────────────────────────────────

  async function handleHubInstall(slug: string) {
    setHubInstalling(slug);
    try {
      const res = await fetch("/api/skills/clawhub/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error || "Failed to install");
      }
      const { jobId } = await res.json();
      setHubInstallJobId(jobId);
      setHubInstallDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to install");
    } finally {
      setHubInstalling(null);
    }
  }

  // ── Derived data ───────────────────────────────────────────

  const activeSkills = skills.filter((s) => s.eligible);
  const availableSkills = skills.filter((s) => !s.eligible);

  const filteredAvailable = mySearchQuery
    ? availableSkills.filter((s) => {
        const q = mySearchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      })
    : availableSkills;

  const isSearchingHub = hubSearchQuery.trim().length >= 2;

  // Global search — filtered local skills
  const globalFilteredSkills = isSearchMode
    ? skills.filter((s) => {
        const q = globalQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      })
    : [];

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight" style={{ color: "var(--mc-text)" }}>
            Skills
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
            Manage agent capabilities and discover new skills
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => fetchSkills(true)}
          disabled={refreshing}
          className="rounded-xl h-10 px-4 text-sm gap-2"
          style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Global search bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.02 }}
        className="mb-4"
      >
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--mc-muted)" }}
          />
          <Input
            placeholder="Search installed skills, ClawHub, and AI recommendations..."
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            className="rounded-xl h-11 text-sm pl-11 pr-10"
            style={{
              backgroundColor: "var(--mc-surface)",
              borderColor: isSearchMode ? "var(--mc-accent)" : "var(--mc-border)",
              color: "var(--mc-text)",
            }}
          />
          {globalQuery && (
            <button
              onClick={() => setGlobalQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
              style={{ color: "var(--mc-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Tab bar — hidden during search */}
      {!isSearchMode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="mb-6"
        >
          <div className="flex gap-1" style={{ borderBottom: "1px solid var(--mc-border)" }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  color: activeTab === tab.id ? "var(--mc-text)" : "var(--mc-muted)",
                  borderBottom: activeTab === tab.id ? "2px solid var(--mc-accent)" : "2px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* UNIFIED SEARCH RESULTS                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {isSearchMode && (
        <motion.div
          key="search-results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* ── Section 1: Installed Skills ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                Installed Skills
              </h2>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
              >
                {globalFilteredSkills.length}
              </span>
            </div>
            {globalFilteredSkills.length > 0 ? (
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              >
                {globalFilteredSkills.map((skill) => (
                  <motion.div
                    key={skill.name}
                    variants={item}
                    className="glass-card-hover p-4 cursor-pointer group"
                    onClick={() => {
                      setSelectedSkill(skill.name);
                      setDetailOpen(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0 leading-none mt-0.5">{skill.emoji || "🔧"}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                          {skill.name}
                        </h3>
                        <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                          {skill.description}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex items-center justify-between mt-3 pt-3 border-t"
                      style={{ borderColor: "var(--mc-border)" }}
                    >
                      <span className="text-[10px]" style={{ color: skill.eligible ? "rgb(52, 211, 153)" : "var(--mc-muted)" }}>
                        {skill.eligible ? "Active" : "Needs Setup"}
                      </span>
                      <span
                        className="text-[10px] font-medium flex items-center gap-1 group-hover:opacity-100 opacity-0 transition-opacity"
                        style={{ color: "var(--mc-accent)" }}
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="glass-card p-6 text-center">
                <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                  No installed skills match &ldquo;{globalQuery}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* ── Section 2: ClawHub Results ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                ClawHub
              </h2>
              {globalHubSearching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mc-muted)" }} />
              )}
              {!globalHubSearching && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                >
                  {globalHubResults.length}
                </span>
              )}
            </div>
            {globalHubSearching ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass-card p-4 animate-pulse flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 rounded w-1/3" style={{ backgroundColor: "var(--mc-surface)" }} />
                      <div className="h-3 rounded w-2/3" style={{ backgroundColor: "var(--mc-surface)" }} />
                    </div>
                    <div className="h-8 w-20 rounded-xl" style={{ backgroundColor: "var(--mc-surface)" }} />
                  </div>
                ))}
              </div>
            ) : globalHubResults.length > 0 ? (
              <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                {globalHubResults.map((result) => (
                  <motion.div
                    key={result.slug}
                    variants={item}
                    className="glass-card-hover p-4 flex items-center gap-4 cursor-pointer"
                    onClick={() => {
                      setSelectedHubSlug(result.slug);
                      setHubDetailOpen(true);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                        {result.name}
                      </h3>
                      <p className="text-xs font-mono mt-0.5" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                        {result.slug}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHubInstall(result.slug);
                      }}
                      disabled={hubInstalling === result.slug}
                      className="rounded-xl h-8 px-3 text-xs gap-1.5 text-white"
                      style={{ backgroundColor: "var(--mc-accent)" }}
                    >
                      {hubInstalling === result.slug ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      Install
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="glass-card p-6 text-center">
                <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                  No ClawHub results for &ldquo;{globalQuery}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* ── Section 3: AI Recommended ── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                AI Recommended
              </h2>
              {aiLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mc-muted)" }} />
              )}
            </div>
            {aiLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass-card p-4 animate-pulse space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg" style={{ backgroundColor: "var(--mc-surface)" }} />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 rounded w-2/3" style={{ backgroundColor: "var(--mc-surface)" }} />
                        <div className="h-3 rounded w-full" style={{ backgroundColor: "var(--mc-surface)" }} />
                      </div>
                    </div>
                    <div className="h-3 rounded w-3/4" style={{ backgroundColor: "var(--mc-surface)" }} />
                    <div className="h-3 rounded w-1/2" style={{ backgroundColor: "var(--mc-surface)" }} />
                  </div>
                ))}
              </div>
            ) : aiError ? (
              <div className="glass-card p-6 text-center">
                <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                  {aiError === "gateway_offline"
                    ? "Gateway not running — AI search unavailable"
                    : aiError === "no_agent"
                    ? "No agent configured — AI search requires at least one agent"
                    : "AI search could not complete this request"}
                </p>
              </div>
            ) : aiResults.length > 0 ? (
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              >
                {aiResults.map((result, idx) => (
                  <motion.div
                    key={`${result.name}-${idx}`}
                    variants={item}
                    className="glass-card-hover p-4 group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "var(--mc-surface)" }}
                      >
                        <Brain className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                          {result.name}
                        </h3>
                        <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                          {result.description}
                        </p>
                      </div>
                    </div>
                    {result.whyRecommended && (
                      <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "var(--mc-muted)", opacity: 0.8 }}>
                        {result.whyRecommended}
                      </p>
                    )}
                    <div
                      className="flex items-center justify-between mt-3 pt-3 border-t"
                      style={{ borderColor: "var(--mc-border)" }}
                    >
                      <div className="flex items-center gap-3">
                        {result.popularitySignal && (
                          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mc-muted)" }}>
                            <TrendingUp className="w-3 h-3" />
                            {result.popularitySignal}
                          </span>
                        )}
                        {result.category && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                          >
                            {result.category}
                          </span>
                        )}
                      </div>
                      {result.sourceUrl && (
                        <a
                          href={result.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-medium flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--mc-accent)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Source <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {result.installHint && (
                      <div
                        className="mt-2 px-2.5 py-1.5 rounded-lg text-[10px] font-mono truncate"
                        style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                      >
                        {result.installHint}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="glass-card p-6 text-center">
                <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                  No AI recommendations yet
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 1: MY SKILLS                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSearchMode && activeTab === "my-skills" && (
        <AnimatePresence mode="wait">
          <motion.div key="my-skills" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
                />
              </div>
            ) : (
              <>
                {/* ── Recommended Skills (Dynamic) ── */}
                {(recommendedLoading || recommendedSkills.length > 0) && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                        Recommended
                      </h2>
                    </div>

                    {recommendedLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="glass-card p-4 animate-pulse">
                            <div className="h-4 rounded w-3/4 mb-3" style={{ backgroundColor: "var(--mc-surface)" }} />
                            <div className="h-3 rounded w-full mb-2" style={{ backgroundColor: "var(--mc-surface)" }} />
                            <div className="h-3 rounded w-1/2" style={{ backgroundColor: "var(--mc-surface)" }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <motion.div
                        variants={container}
                        initial="hidden"
                        animate="show"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                      >
                        {recommendedSkills.map((skill) => {
                          const tags = Object.values(skill.tags || {}).slice(0, 2);
                          return (
                            <motion.div
                              key={skill.slug}
                              variants={item}
                              className="glass-card-hover p-4 cursor-pointer group"
                              onClick={() => {
                                setSelectedHubSlug(skill.slug);
                                setHubDetailOpen(true);
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: "var(--mc-surface)" }}
                                >
                                  <Package className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                                    {skill.displayName || skill.slug}
                                  </h3>
                                  <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                                    {skill.summary || "No description"}
                                  </p>
                                </div>
                              </div>
                              <div
                                className="flex items-center justify-between mt-3 pt-3 border-t"
                                style={{ borderColor: "var(--mc-border)" }}
                              >
                                <div className="flex items-center gap-3">
                                  {skill.stats.stars > 0 && (
                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mc-muted)" }}>
                                      <Star className="w-3 h-3" />
                                      {formatNumber(skill.stats.stars)}
                                    </span>
                                  )}
                                  {skill.stats.downloads > 0 && (
                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--mc-muted)" }}>
                                      <Download className="w-3 h-3" />
                                      {formatNumber(skill.stats.downloads)}
                                    </span>
                                  )}
                                  {tags.length > 0 && (
                                    <span className="text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                                      {tags.join(" · ")}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className="text-[10px] font-medium flex items-center gap-1 group-hover:opacity-100 opacity-0 transition-opacity"
                                  style={{ color: "var(--mc-accent)" }}
                                >
                                  View <ChevronRight className="w-3 h-3" />
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Active Skills (Hero Section) ── */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                      Active Skills
                    </h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                    >
                      {activeSkills.length}
                    </span>
                  </div>

                  {activeSkills.length === 0 ? (
                    <div
                      className="glass-card p-8 text-center"
                    >
                      <Package className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
                      <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                        No active skills. Set up skills below or install from ClawHub.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                      {activeSkills.map((skill, idx) => (
                        <motion.div
                          key={skill.name}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="glass-card-hover p-4 cursor-pointer flex-shrink-0 w-[180px]"
                          onClick={() => {
                            setSelectedSkill(skill.name);
                            setDetailOpen(true);
                          }}
                        >
                          <div className="text-center">
                            <span className="text-3xl block mb-2">{skill.emoji || "🔧"}</span>
                            <h3
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--mc-text)" }}
                            >
                              {skill.name}
                            </h3>
                            <div className="flex items-center justify-center gap-1.5 mt-2">
                              <div className="status-dot-running" />
                              <span className="text-[10px] text-emerald-400 font-medium">Ready</span>
                            </div>
                            {skill.source && (
                              <span
                                className="text-[10px] mt-1 block"
                                style={{ color: "var(--mc-muted)", opacity: 0.5 }}
                              >
                                {skill.bundled ? "bundled" : "clawhub"}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Available Skills (Needs Setup) ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                        Available — Needs Setup
                      </h2>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                      >
                        {availableSkills.length}
                      </span>
                    </div>
                    <div className="relative max-w-xs w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
                      <Input
                        placeholder="Search available..."
                        value={mySearchQuery}
                        onChange={(e) => setMySearchQuery(e.target.value)}
                        className="rounded-xl h-9 text-xs pl-9"
                        style={{
                          backgroundColor: "var(--mc-surface)",
                          borderColor: "var(--mc-border)",
                          color: "var(--mc-text)",
                        }}
                      />
                    </div>
                  </div>

                  {filteredAvailable.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                      <Search className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
                      <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                        {mySearchQuery ? "No skills match your search." : "All skills are set up!"}
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      variants={container}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                    >
                      {filteredAvailable.map((skill) => {
                        const missingItems = [...skill.missing.bins, ...skill.missing.env, ...skill.missing.config];
                        return (
                          <motion.div
                            key={skill.name}
                            variants={item}
                            className="glass-card-hover p-4 cursor-pointer group"
                            onClick={() => {
                              setSelectedSkill(skill.name);
                              setDetailOpen(true);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xl flex-shrink-0 leading-none mt-0.5">{skill.emoji || "🔧"}</span>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                                  {skill.name}
                                </h3>
                                <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: "var(--mc-muted)" }}>
                                  {skill.description}
                                </p>
                              </div>
                            </div>
                            <div
                              className="flex items-center justify-between mt-3 pt-3 border-t"
                              style={{ borderColor: "var(--mc-border)" }}
                            >
                              <span
                                className="text-[10px] truncate max-w-[160px]"
                                style={{ color: "var(--mc-muted)", opacity: 0.6 }}
                              >
                                {missingItems.length > 0
                                  ? `Missing: ${missingItems.slice(0, 2).join(", ")}${missingItems.length > 2 ? "..." : ""}`
                                  : "Needs configuration"}
                              </span>
                              <span
                                className="text-[10px] font-medium flex items-center gap-1 group-hover:opacity-100 opacity-60 transition-opacity"
                                style={{ color: "var(--mc-accent)" }}
                              >
                                Setup <ChevronRight className="w-3 h-3" />
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 2: CLAWHUB (Steam-like Marketplace)                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSearchMode && activeTab === "clawhub" && (
        <AnimatePresence mode="wait">
          <motion.div key="clawhub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Search bar */}
            <div className="relative max-w-lg mb-6">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mc-muted)" }} />
              <Input
                placeholder="Search ClawHub skills..."
                value={hubSearchQuery}
                onChange={(e) => setHubSearchQuery(e.target.value)}
                className="rounded-xl h-11 text-sm pl-10"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  borderColor: "var(--mc-border)",
                  color: "var(--mc-text)",
                }}
              />
              {hubSearching && (
                <Loader2
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                  style={{ color: "var(--mc-muted)" }}
                />
              )}
            </div>

            {/* Search results overlay */}
            {isSearchingHub ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Search className="w-4 h-4" style={{ color: "var(--mc-muted)" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
                    Results for &ldquo;{hubSearchQuery}&rdquo;
                  </h2>
                </div>
                {hubSearchResults.length > 0 ? (
                  <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                    {hubSearchResults.map((result) => (
                      <motion.div
                        key={result.slug}
                        variants={item}
                        className="glass-card-hover p-4 flex items-center gap-4 cursor-pointer"
                        onClick={() => {
                          setSelectedHubSlug(result.slug);
                          setHubDetailOpen(true);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                            {result.name}
                          </h3>
                          <p className="text-xs font-mono mt-0.5" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                            {result.slug}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                          score: {result.score}
                        </span>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHubInstall(result.slug);
                          }}
                          disabled={hubInstalling === result.slug}
                          className="rounded-xl h-8 px-3 text-xs gap-1.5 text-white"
                          style={{ backgroundColor: "var(--mc-accent)" }}
                        >
                          {hubInstalling === result.slug ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Install
                        </Button>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : !hubSearching ? (
                  <div className="glass-card p-12 text-center">
                    <Search className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
                    <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                      No results for &ldquo;{hubSearchQuery}&rdquo;
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {/* ── Featured Skills (Horizontal Scroll) ── */}
                {hubFeatured.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <Star className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--mc-text)" }}>
                        Featured Skills
                      </h2>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
                      {hubFeatured.map((skill, idx) => (
                        <motion.div
                          key={skill.slug}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="glass-card-hover p-5 flex-shrink-0 w-[240px] cursor-pointer group"
                          onClick={() => {
                            setSelectedHubSlug(skill.slug);
                            setHubDetailOpen(true);
                          }}
                        >
                          <h3 className="text-sm font-semibold mb-1 truncate" style={{ color: "var(--mc-text)" }}>
                            {skill.displayName}
                          </h3>
                          <p className="text-xs line-clamp-2 leading-relaxed mb-3" style={{ color: "var(--mc-muted)" }}>
                            {skill.summary || "Community skill"}
                          </p>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--mc-muted)" }}>
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-400" />
                              {formatNumber(skill.stats.stars)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ArrowDownToLine className="w-3 h-3" />
                              {formatNumber(skill.stats.downloads)}
                            </span>
                            {skill.latestVersion && (
                              <span className="font-mono">v{skill.latestVersion.version}</span>
                            )}
                          </div>
                          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "var(--mc-border)" }}>
                            <span className="text-[10px] font-mono" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                              {skill.slug}
                            </span>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHubInstall(skill.slug);
                              }}
                              disabled={hubInstalling === skill.slug}
                              className="rounded-lg h-7 px-2.5 text-[10px] gap-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ backgroundColor: "var(--mc-accent)" }}
                            >
                              {hubInstalling === skill.slug ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              Install
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Browse Skills ── */}
                <div>
                  {/* Controls: Categories + Sort */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    {/* Category pills */}
                    <div className="flex gap-1.5 flex-wrap">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setHubCategory(cat.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            backgroundColor: hubCategory === cat.id ? "var(--mc-accent)" : "var(--mc-surface)",
                            color: hubCategory === cat.id ? "white" : "var(--mc-muted)",
                            border: hubCategory === cat.id ? "none" : "1px solid var(--mc-border)",
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* Sort dropdown */}
                    {hubCategory === "all" && (
                      <div className="relative" ref={sortRef}>
                        <button
                          onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            backgroundColor: "var(--mc-surface)",
                            color: "var(--mc-muted)",
                            border: "1px solid var(--mc-border)",
                          }}
                        >
                          <TrendingUp className="w-3 h-3" />
                          {SORT_OPTIONS.find((s) => s.id === hubSort)?.label}
                          <ChevronRight
                            className="w-3 h-3 transition-transform"
                            style={{ transform: sortDropdownOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                          />
                        </button>
                        {sortDropdownOpen && (
                          <div
                            className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 min-w-[180px] py-1"
                            style={{
                              backgroundColor: "var(--mc-bg)",
                              border: "1px solid var(--mc-border)",
                              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                            }}
                          >
                            {SORT_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => {
                                  setHubSort(opt.id);
                                  setSortDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs transition-all"
                                style={{
                                  color: hubSort === opt.id ? "var(--mc-accent)" : "var(--mc-text)",
                                  backgroundColor: hubSort === opt.id ? "var(--mc-surface)" : "transparent",
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Skill list */}
                  {hubLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div
                        className="w-6 h-6 border-2 rounded-full animate-spin"
                        style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
                      />
                    </div>
                  ) : hubItems.length === 0 ? (
                    <div className="glass-card p-12 text-center">
                      <Package className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--mc-muted)", opacity: 0.3 }} />
                      <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                        No skills found in this category.
                      </p>
                    </div>
                  ) : (
                    <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
                      {hubItems.map((skill) => {
                        const hasStats = skill.stats.stars > 0 || skill.stats.downloads > 0;
                        return (
                          <motion.div
                            key={skill.slug}
                            variants={item}
                            className="glass-card-hover p-4 flex items-center gap-4 cursor-pointer"
                            onClick={() => {
                              setSelectedHubSlug(skill.slug);
                              setHubDetailOpen(true);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                                  {skill.displayName}
                                </h3>
                                {skill.latestVersion && (
                                  <span
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                                  >
                                    v{skill.latestVersion.version}
                                  </span>
                                )}
                              </div>
                              {skill.summary && (
                                <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--mc-muted)" }}>
                                  {skill.summary}
                                </p>
                              )}
                              {/* Tags */}
                              {Object.keys(skill.tags).filter((t) => t !== "latest").length > 0 && (
                                <div className="flex gap-1 mt-1.5">
                                  {Object.keys(skill.tags)
                                    .filter((t) => t !== "latest")
                                    .slice(0, 3)
                                    .map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                        style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)", opacity: 0.7 }}
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                </div>
                              )}
                            </div>

                            {/* Stats */}
                            {hasStats && (
                              <div className="flex items-center gap-4 flex-shrink-0 text-[11px]" style={{ color: "var(--mc-muted)" }}>
                                {skill.stats.stars > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Star className="w-3 h-3 text-amber-400" />
                                    {formatNumber(skill.stats.stars)}
                                  </span>
                                )}
                                {skill.stats.downloads > 0 && (
                                  <span className="flex items-center gap-1">
                                    <ArrowDownToLine className="w-3 h-3" />
                                    {formatNumber(skill.stats.downloads)}
                                  </span>
                                )}
                              </div>
                            )}

                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHubInstall(skill.slug);
                              }}
                              disabled={hubInstalling === skill.slug}
                              className="rounded-xl h-8 px-3 text-xs gap-1.5 text-white flex-shrink-0"
                              style={{ backgroundColor: "var(--mc-accent)" }}
                            >
                              {hubInstalling === skill.slug ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              Install
                            </Button>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* Load More */}
                  {hubCursor && !hubLoading && hubCategory === "all" && (
                    <div className="flex justify-center mt-6">
                      <Button
                        variant="ghost"
                        onClick={loadMore}
                        disabled={hubLoadingMore}
                        className="rounded-xl h-10 px-6 text-sm gap-2"
                        style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
                      >
                        {hubLoadingMore ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 3: SMITHERY                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {!isSearchMode && activeTab === "smithery" && (
        <AnimatePresence mode="wait">
          <motion.div key="smithery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="glass-card p-12 text-center max-w-xl mx-auto">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
              >
                <Package className="w-8 h-8" style={{ color: "var(--mc-accent)" }} />
              </div>
              <h2 className="font-heading text-xl font-semibold mb-2" style={{ color: "var(--mc-text)" }}>
                Smithery — MCP Servers
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--mc-muted)" }}>
                Smithery is a registry of MCP (Model Context Protocol) servers that extend agent capabilities
                with tools like database access, web browsing, API integrations, and more.
              </p>
              <a
                href="https://smithery.ai"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: "var(--mc-accent)" }}
              >
                Browse Smithery
                <ExternalLink className="w-4 h-4" />
              </a>
              <p className="text-xs mt-4" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                Full Smithery integration coming soon — install and manage MCP servers directly from Clawboard.
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* Local skill detail */}
      <SkillDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        skillName={selectedSkill}
        onRefresh={() => fetchSkills(false)}
      />

      {/* ClawHub skill detail */}
      <ClawHubDetailDialog
        open={hubDetailOpen}
        onOpenChange={setHubDetailOpen}
        slug={selectedHubSlug}
        onInstall={handleHubInstall}
        installing={hubInstalling}
      />

      {/* Install progress */}
      <InstallProgressDialog
        open={hubInstallDialogOpen}
        onOpenChange={setHubInstallDialogOpen}
        jobId={hubInstallJobId}
        title="Installing from ClawHub"
        onComplete={() => fetchSkills(false)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ClawHub Skill Detail Dialog
// ═══════════════════════════════════════════════════════════════

interface ClawHubSkillDetailData {
  skill: ClawHubSkill;
  latestVersion: { version: string; createdAt: number; changelog: string } | null;
  owner: { handle: string; userId: string; displayName: string; image: string } | null;
}

interface ClawHubDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string | null;
  onInstall: (slug: string) => void;
  installing: string | null;
}

function ClawHubDetailDialog({ open, onOpenChange, slug, onInstall, installing }: ClawHubDetailDialogProps) {
  const [detail, setDetail] = useState<ClawHubSkillDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && slug) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/skills/clawhub/${encodeURIComponent(slug)}`)
        .then(async (res) => {
          if (res.ok) setDetail(await res.json());
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, slug]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: "var(--mc-bg)", borderColor: "var(--mc-border)" }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
            />
          </div>
        ) : detail ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                {/* Owner avatar */}
                {detail.owner?.image ? (
                  <img
                    src={detail.owner.image}
                    alt={detail.owner.handle}
                    className="w-12 h-12 rounded-xl flex-shrink-0 object-cover"
                    style={{ border: "1px solid var(--mc-border)" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : detail.owner ? (
                  <div
                    className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-lg font-semibold"
                    style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)", color: "var(--mc-muted)" }}
                  >
                    {(detail.owner.handle || "?")[0].toUpperCase()}
                  </div>
                ) : null}
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg" style={{ color: "var(--mc-text)" }}>
                    {detail.skill.displayName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {detail.owner && (
                      <span className="text-xs" style={{ color: "var(--mc-muted)" }}>
                        by {detail.owner.displayName || detail.owner.handle}
                      </span>
                    )}
                    {detail.latestVersion && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-muted)" }}
                      >
                        v{detail.latestVersion.version}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Stats bar */}
            <div
              className="flex items-center gap-5 py-3 px-4 rounded-xl my-2"
              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
            >
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--mc-muted)" }}>
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium" style={{ color: "var(--mc-text)" }}>
                  {formatNumber(detail.skill.stats.stars)}
                </span>
                stars
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--mc-muted)" }}>
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span className="font-medium" style={{ color: "var(--mc-text)" }}>
                  {formatNumber(detail.skill.stats.downloads)}
                </span>
                downloads
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--mc-muted)" }}>
                <Package className="w-3.5 h-3.5" />
                <span className="font-medium" style={{ color: "var(--mc-text)" }}>
                  {formatNumber(detail.skill.stats.installsAllTime)}
                </span>
                installs
              </div>
              {detail.skill.stats.versions > 0 && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--mc-muted)" }}>
                  <span className="font-medium" style={{ color: "var(--mc-text)" }}>
                    {detail.skill.stats.versions}
                  </span>
                  versions
                </div>
              )}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
              {/* Summary */}
              {detail.skill.summary && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--mc-text)", opacity: 0.85 }}>
                  {detail.skill.summary}
                </p>
              )}

              {/* Tags */}
              {Object.keys(detail.skill.tags).filter((t) => t !== "latest").length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {Object.keys(detail.skill.tags)
                    .filter((t) => t !== "latest")
                    .map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-1 rounded-lg font-mono"
                        style={{
                          backgroundColor: "var(--mc-surface)",
                          color: "var(--mc-muted)",
                          border: "1px solid var(--mc-border)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              )}

              {/* Changelog */}
              {detail.latestVersion?.changelog && (
                <div
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                >
                  <h4 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--mc-muted)" }}>
                    Changelog — v{detail.latestVersion.version}
                  </h4>
                  <MarkdownRenderer content={detail.latestVersion.changelog} className="text-xs" />
                </div>
              )}

              {/* Metadata */}
              {detail.skill.metadata?.os && detail.skill.metadata.os.length > 0 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--mc-muted)" }}>
                  <span className="font-medium">Platforms:</span>
                  {detail.skill.metadata.os.map((os) => (
                    <span
                      key={os}
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: "var(--mc-surface)" }}
                    >
                      {os}
                    </span>
                  ))}
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-[10px]" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                {detail.skill.createdAt > 0 && <span>Created {timeAgo(detail.skill.createdAt)}</span>}
                {detail.skill.updatedAt > 0 && <span>Updated {timeAgo(detail.skill.updatedAt)}</span>}
              </div>
            </div>

            {/* Install button */}
            <div className="pt-3 border-t" style={{ borderColor: "var(--mc-border)" }}>
              <Button
                onClick={() => slug && onInstall(slug)}
                disabled={!slug || installing === slug}
                className="w-full rounded-xl h-10 text-sm gap-2 text-white"
                style={{ backgroundColor: "var(--mc-accent)" }}
              >
                {installing === slug ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Install Skill
              </Button>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-sm" style={{ color: "var(--mc-muted)" }}>
            Skill not found on ClawHub.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
