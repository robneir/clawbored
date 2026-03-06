"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Filter,
  Zap,
  Trash2,
  List,
  LayoutGrid,
  Repeat,
  Timer,
  CalendarClock,
  Bot,
  Plus,
  Play,
  Search,
  ArrowUpDown,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { WeeklyView } from "@/components/calendar/weekly-view";
import { DailyView } from "@/components/calendar/daily-view";
import { MonthlyView } from "@/components/calendar/monthly-view";
import { DeleteCronJobDialog } from "@/components/delete-cron-job-dialog";
import { CreateCronJobDialog } from "@/components/create-cron-job-dialog";
import type { CronOccurrence } from "@/components/calendar/event-pill";

interface CronJob {
  id: string;
  name: string;
  schedule: { kind: string; expr?: string; everyMs?: number };
  sessionTarget: string;
  wakeMode: string;
  payload: { kind: string; message?: string };
  enabled: boolean;
  agentId?: string;
  createdAtMs?: number;
  state?: { nextRunAtMs?: number };
  nextRun?: number | null;
}

interface CronRun {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  error?: string;
  summary?: string;
  runAtMs: number;
  durationMs: number;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface Agent {
  id: string;
  displayName: string;
  avatar: string;
}

type CalendarView = "daily" | "weekly" | "monthly";
type PageView = "calendar" | "list";
type SortField = "name" | "schedule" | "agent" | "nextRun" | "status";
type SortDir = "asc" | "desc";

const VIEW_LABELS: Record<CalendarView, string> = {
  daily: "Day",
  weekly: "Week",
  monthly: "Month",
};

const SCHEDULE_ICONS: Record<string, typeof Repeat> = {
  cron: Repeat,
  every: Timer,
  at: CalendarClock,
};

// ── Date helpers ──

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeRange(
  view: CalendarView,
  date: Date,
): { rangeStart: Date; rangeEnd: Date } {
  switch (view) {
    case "daily": {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    case "weekly": {
      const start = getWeekStart(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    case "monthly": {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
  }
}

function formatRangeLabel(view: CalendarView, date: Date): string {
  switch (view) {
    case "daily":
      return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "weekly": {
      const start = getWeekStart(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const startStr = start.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const endStr = end.toLocaleDateString(undefined, {
        month: sameMonth ? undefined : "short",
        day: "numeric",
        year: "numeric",
      });
      return `${startStr} – ${endStr}`;
    }
    case "monthly":
      return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
  }
}

function describeSchedule(schedule: CronJob["schedule"]): string {
  switch (schedule.kind) {
    case "cron":
      return schedule.expr || "cron";
    case "every": {
      if (schedule.everyMs) {
        const s = schedule.everyMs / 1000;
        if (s < 60) return `Every ${s}s`;
        const m = s / 60;
        if (m < 60) return `Every ${m}m`;
        const h = m / 60;
        if (h < 24) return `Every ${h}h`;
        return `Every ${h / 24}d`;
      }
      return schedule.expr || "interval";
    }
    case "at":
      return schedule.expr || "one-shot";
    default:
      return "unknown";
  }
}

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  if (diff < 0) return "overdue";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Page ──

export default function CronPage() {
  const [pageView, setPageView] = useState<PageView>("calendar");
  const [calView, setCalView] = useState<CalendarView>("weekly");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [occurrences, setOccurrences] = useState<CronOccurrence[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    scheduleExpr: string;
    agentId?: string;
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Search & sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // History state
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Record<string, CronRun[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  // Run Now state
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  const { rangeStart, rangeEnd } = useMemo(
    () => computeRange(calView, currentDate),
    [calView, currentDate],
  );

  const fetchCronData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/cron?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setOccurrences(data.occurrences || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    setLoading(true);
    fetchCronData();
  }, [fetchCronData]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Build agent lookups
  const agentAvatars = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of agents) {
      if (a.avatar) map[a.id] = a.avatar;
    }
    return map;
  }, [agents]);

  const agentNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of agents) {
      map[a.id] = a.displayName || a.id;
    }
    return map;
  }, [agents]);

  // Filter occurrences by agent
  const filtered = useMemo(() => {
    if (selectedAgent === "all") return occurrences;
    if (selectedAgent === "unassigned") {
      return occurrences.filter((o) => !o.agentId);
    }
    return occurrences.filter((o) => o.agentId === selectedAgent);
  }, [occurrences, selectedAgent]);

  // Filter + search + sort jobs for list view
  const filteredJobs = useMemo(() => {
    let list = jobs;

    // Agent filter
    if (selectedAgent === "unassigned") {
      list = list.filter((j) => !j.agentId);
    } else if (selectedAgent !== "all") {
      list = list.filter((j) => j.agentId === selectedAgent);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          (j.payload.message || "").toLowerCase().includes(q) ||
          (j.agentId && (agentNames[j.agentId] || j.agentId).toLowerCase().includes(q)),
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "schedule":
          cmp = describeSchedule(a.schedule).localeCompare(describeSchedule(b.schedule));
          break;
        case "agent": {
          const aName = a.agentId ? agentNames[a.agentId] || a.agentId : "zzz";
          const bName = b.agentId ? agentNames[b.agentId] || b.agentId : "zzz";
          cmp = aName.localeCompare(bName);
          break;
        }
        case "nextRun":
          cmp = (a.nextRun || Infinity) - (b.nextRun || Infinity);
          break;
        case "status":
          cmp = (a.enabled ? 0 : 1) - (b.enabled ? 0 : 1);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [jobs, selectedAgent, searchQuery, sortBy, sortDir, agentNames]);

  function navigate(direction: -1 | 1) {
    const d = new Date(currentDate);
    switch (calView) {
      case "daily":
        d.setDate(d.getDate() + direction);
        break;
      case "weekly":
        d.setDate(d.getDate() + direction * 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + direction);
        break;
    }
    setCurrentDate(d);
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  function handleDayClick(date: Date) {
    setCurrentDate(date);
    setCalView("daily");
  }

  function openDeleteDialog(job: CronJob) {
    setDeleteTarget({
      id: job.id,
      name: job.name,
      scheduleExpr: describeSchedule(job.schedule),
      agentId: job.agentId,
    });
  }

  async function handleToggleJob(jobId: string, enabled: boolean) {
    try {
      const res = await fetch("/api/cron", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to update job");
      }
      toast.success(enabled ? "Job enabled" : "Job disabled");
      fetchCronData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update job");
    }
  }

  async function handleRunNow(jobId: string, jobName: string) {
    setRunningJobId(jobId);
    try {
      const res = await fetch("/api/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error || "Failed to trigger job");
      }
      toast.success(`Triggered "${jobName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setRunningJobId(null);
    }
  }

  async function toggleHistory(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }

    setExpandedJobId(jobId);

    // Fetch history if not cached
    if (!runHistory[jobId]) {
      setLoadingHistory(jobId);
      try {
        const res = await fetch(`/api/cron/runs?jobId=${jobId}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setRunHistory((prev) => ({ ...prev, [jobId]: data.runs || [] }));
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingHistory(null);
      }
    }
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  const enabledCount = jobs.filter((j) => j.enabled).length;

  const GRID_COLS = "2fr 120px 130px 120px 80px 64px 80px";

  return (
    <div className="p-4 pt-14 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Cron Jobs
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mc-muted)" }}>
            Scheduled tasks across your agents
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* New Job button */}
          <Button
            className="rounded-xl px-3 h-9 text-sm font-medium gap-1.5"
            style={{ backgroundColor: "var(--mc-accent)", color: "white" }}
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Job
          </Button>

          {/* Page view toggle */}
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--mc-border)" }}
          >
            <button
              className="px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: pageView === "calendar" ? "var(--mc-surface)" : "transparent",
                color: pageView === "calendar" ? "var(--mc-text)" : "var(--mc-muted)",
                borderRight: "1px solid var(--mc-border)",
              }}
              onClick={() => setPageView("calendar")}
            >
              <LayoutGrid className="w-3 h-3" />
              Calendar
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: pageView === "list" ? "var(--mc-surface)" : "transparent",
                color: pageView === "list" ? "var(--mc-text)" : "var(--mc-muted)",
              }}
              onClick={() => setPageView("list")}
            >
              <List className="w-3 h-3" />
              List
            </button>
          </div>

          {/* Agent filter */}
          <div className="relative" ref={filterRef}>
            <Button
              variant="ghost"
              className="rounded-xl px-3 h-9 text-sm font-medium gap-2"
              style={{
                color: selectedAgent !== "all" ? "var(--mc-accent)" : "var(--mc-muted)",
                border: "1px solid var(--mc-border)",
              }}
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <Filter className="w-3.5 h-3.5" />
              {selectedAgent === "all"
                ? "All Agents"
                : selectedAgent === "unassigned"
                  ? "Unassigned"
                  : agents.find((a) => a.id === selectedAgent)?.displayName || selectedAgent}
            </Button>
            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-xl py-1.5 z-50 shadow-xl"
                  style={{
                    backgroundColor: "var(--mc-surface)",
                    border: "1px solid var(--mc-border)",
                  }}
                >
                  {[
                    { id: "all", label: "All Agents", avatar: "" },
                    { id: "unassigned", label: "Unassigned", avatar: "" },
                    ...agents.map((a) => ({
                      id: a.id,
                      label: a.displayName || a.id,
                      avatar: a.avatar,
                    })),
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      className="w-full text-left px-3 py-2 text-sm transition-colors truncate flex items-center gap-2"
                      style={{
                        color: selectedAgent === opt.id ? "var(--mc-accent)" : "var(--mc-text)",
                        backgroundColor:
                          selectedAgent === opt.id
                            ? "color-mix(in srgb, var(--mc-accent) 10%, transparent)"
                            : "transparent",
                      }}
                      onClick={() => {
                        setSelectedAgent(opt.id);
                        setFilterOpen(false);
                      }}
                    >
                      {opt.avatar && (
                        <span className="text-sm leading-none">{opt.avatar}</span>
                      )}
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Calendar view switcher */}
          {pageView === "calendar" && (
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--mc-border)" }}
            >
              {(["daily", "weekly", "monthly"] as CalendarView[]).map(
                (v, i, arr) => (
                  <button
                    key={v}
                    className="px-3.5 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: calView === v ? "var(--mc-surface)" : "transparent",
                      color: calView === v ? "var(--mc-text)" : "var(--mc-muted)",
                      borderRight: i < arr.length - 1 ? "1px solid var(--mc-border)" : undefined,
                    }}
                    onClick={() => setCalView(v)}
                  >
                    {VIEW_LABELS[v]}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Date navigation (calendar mode only) */}
      {pageView === "calendar" && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-3 mb-6 flex items-center justify-between"
        >
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-8 w-8 p-0"
            style={{ color: "var(--mc-muted)" }}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
              {formatRangeLabel(calView, currentDate)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg h-7 px-2.5 text-xs"
              style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
              onClick={goToday}
            >
              Today
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-8 w-8 p-0"
            style={{ color: "var(--mc-muted)" }}
            onClick={() => navigate(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      {/* Search bar (list mode only) */}
      {pageView === "list" && jobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4"
        >
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{
              backgroundColor: "var(--mc-surface)",
              border: "1px solid var(--mc-border)",
            }}
          >
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)", opacity: 0.5 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs by name, message, or agent..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "var(--mc-text)" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ color: "var(--mc-muted)" }}
              >
                Clear
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
            />
          </div>
        ) : jobs.length === 0 ? (
          /* ── Empty state ── */
          <div className="glass-card p-16 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--mc-accent) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--mc-accent) 15%, transparent)",
                }}
              >
                <Calendar
                  className="w-10 h-10"
                  style={{ color: "var(--mc-accent)", opacity: 0.6 }}
                />
              </div>
              <h3
                className="font-heading text-xl font-semibold mb-2"
                style={{ color: "var(--mc-text)" }}
              >
                No Cron Jobs Yet
              </h3>
              <p
                className="text-sm max-w-md mx-auto mb-6"
                style={{ color: "var(--mc-muted)" }}
              >
                Schedule recurring tasks for your agents. Create jobs that run on a cron schedule, at fixed intervals, or at a specific time.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  className="rounded-xl gap-2"
                  style={{ backgroundColor: "var(--mc-accent)", color: "white" }}
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Job
                </Button>
                <span className="text-xs" style={{ color: "var(--mc-muted)", opacity: 0.5 }}>or</span>
                <code
                  className="text-xs px-2.5 py-1.5 rounded-lg"
                  style={{ backgroundColor: "var(--mc-surface)", color: "var(--mc-text)", border: "1px solid var(--mc-border)" }}
                >
                  openclaw cron add
                </code>
              </div>
            </motion.div>
          </div>
        ) : pageView === "calendar" ? (
          <>
            {calView === "daily" && (
              <DailyView occurrences={filtered} date={currentDate} agentAvatars={agentAvatars} />
            )}
            {calView === "weekly" && (
              <WeeklyView
                occurrences={filtered}
                weekStart={getWeekStart(currentDate)}
                agentAvatars={agentAvatars}
              />
            )}
            {calView === "monthly" && (
              <MonthlyView
                occurrences={filtered}
                month={currentDate}
                onDayClick={handleDayClick}
                agentAvatars={agentAvatars}
              />
            )}
          </>
        ) : (
          /* ── List view ── */
          <div className="glass-card overflow-hidden">
            {/* Table header with sortable columns */}
            <div
              className="grid items-center px-4 py-3 text-[11px] font-medium uppercase tracking-wider select-none"
              style={{
                gridTemplateColumns: GRID_COLS,
                color: "var(--mc-muted)",
                borderBottom: "1px solid var(--mc-border)",
              }}
            >
              <SortHeader field="name" label="Job" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="agent" label="Agent" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="schedule" label="Schedule" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="nextRun" label="Next Run" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <span>Target</span>
              <SortHeader field="status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-center" />
              <span className="text-right">Actions</span>
            </div>

            {/* Rows */}
            {filteredJobs.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: "var(--mc-muted)" }}>
                {searchQuery ? "No jobs match your search" : "No jobs match the selected filter"}
              </div>
            ) : (
              filteredJobs.map((job) => {
                const ScheduleIcon = SCHEDULE_ICONS[job.schedule.kind] || Clock;
                const avatar = job.agentId ? agentAvatars[job.agentId] : undefined;
                const agentName = job.agentId ? agentNames[job.agentId] || job.agentId : "Unassigned";
                const isExpanded = expandedJobId === job.id;
                const runs = runHistory[job.id] || [];
                const isLoadingRuns = loadingHistory === job.id;
                const isRunning = runningJobId === job.id;

                return (
                  <div key={job.id}>
                    <div
                      className="grid items-center px-4 py-3 transition-colors"
                      style={{
                        gridTemplateColumns: GRID_COLS,
                        borderBottom: isExpanded ? undefined : "1px solid var(--mc-border)",
                        opacity: job.enabled ? 1 : 0.5,
                      }}
                    >
                      {/* Job name + payload preview */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            className="flex items-center gap-1 min-w-0"
                            onClick={() => toggleHistory(job.id)}
                            title="Toggle run history"
                          >
                            <ChevronDown
                              className="w-3 h-3 flex-shrink-0 transition-transform"
                              style={{
                                color: "var(--mc-muted)",
                                opacity: 0.5,
                                transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                              }}
                            />
                            <span className="text-sm font-medium truncate" style={{ color: "var(--mc-text)" }}>
                              {job.name}
                            </span>
                          </button>
                        </div>
                        {job.payload.message && (
                          <div
                            className="text-[11px] truncate mt-0.5 pl-[18px]"
                            style={{ color: "var(--mc-muted)", opacity: 0.7 }}
                          >
                            {job.payload.message.slice(0, 80)}
                            {job.payload.message.length > 80 ? "..." : ""}
                          </div>
                        )}
                      </div>

                      {/* Agent */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {avatar ? (
                          <span className="text-sm leading-none flex-shrink-0">{avatar}</span>
                        ) : (
                          <Bot className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mc-muted)", opacity: 0.5 }} />
                        )}
                        <span className="text-xs truncate" style={{ color: "var(--mc-muted)" }}>
                          {agentName}
                        </span>
                      </div>

                      {/* Schedule */}
                      <div className="flex items-center gap-1.5">
                        <ScheduleIcon className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mc-muted)", opacity: 0.6 }} />
                        <span className="text-xs font-mono truncate" style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                          {describeSchedule(job.schedule)}
                        </span>
                      </div>

                      {/* Next run */}
                      <div className="text-xs" style={{ color: "var(--mc-muted)" }}>
                        {job.enabled && job.nextRun ? (
                          <span title={new Date(job.nextRun).toLocaleString()}>
                            {formatRelativeTime(job.nextRun)}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </div>

                      {/* Session target */}
                      <div>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "var(--mc-surface)",
                            color: "var(--mc-muted)",
                            border: "1px solid var(--mc-border)",
                          }}
                        >
                          {job.sessionTarget}
                        </span>
                      </div>

                      {/* Enabled toggle */}
                      <div className="flex justify-center">
                        <button
                          className="w-9 h-5 rounded-full relative transition-colors"
                          style={{
                            backgroundColor: job.enabled
                              ? "var(--mc-accent)"
                              : "var(--mc-surface)",
                            border: `1px solid ${job.enabled ? "var(--mc-accent)" : "var(--mc-border)"}`,
                          }}
                          onClick={() => handleToggleJob(job.id, !job.enabled)}
                          title={job.enabled ? "Disable" : "Enable"}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
                            style={{
                              backgroundColor: job.enabled ? "white" : "var(--mc-muted)",
                              left: job.enabled ? "18px" : "2px",
                            }}
                          />
                        </button>
                      </div>

                      {/* Actions: Run Now + Delete */}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: "var(--mc-muted)" }}
                          onClick={() => handleRunNow(job.id, job.name)}
                          disabled={isRunning}
                          title="Run now"
                        >
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:text-red-400"
                          style={{ color: "var(--mc-muted)" }}
                          onClick={() => openDeleteDialog(job)}
                          title="Delete job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded history panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                          style={{ borderBottom: "1px solid var(--mc-border)" }}
                        >
                          <div
                            className="px-6 py-4"
                            style={{ backgroundColor: "color-mix(in srgb, var(--mc-surface) 50%, transparent)" }}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <History className="w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
                              <span className="text-xs font-medium" style={{ color: "var(--mc-muted)" }}>
                                Recent Executions
                              </span>
                            </div>

                            {isLoadingRuns ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mc-muted)" }} />
                              </div>
                            ) : runs.length === 0 ? (
                              <div className="text-xs text-center py-4" style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                                No execution history found
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {runs.slice(0, 5).map((run, i) => (
                                  <div
                                    key={run.ts + "-" + i}
                                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                                    style={{
                                      backgroundColor: "var(--mc-surface)",
                                      border: "1px solid var(--mc-border)",
                                    }}
                                  >
                                    {/* Status icon */}
                                    <div className="mt-0.5">
                                      {run.status === "success" ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                                      )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-3 text-[11px]">
                                        <span style={{ color: "var(--mc-text)" }}>
                                          {formatTimestamp(run.runAtMs)}
                                        </span>
                                        <span style={{ color: "var(--mc-muted)", opacity: 0.6 }}>
                                          {formatDuration(run.durationMs)}
                                        </span>
                                        {run.model && (
                                          <span
                                            className="px-1.5 py-0.5 rounded"
                                            style={{
                                              backgroundColor: "var(--mc-sidebar)",
                                              color: "var(--mc-muted)",
                                              fontSize: "10px",
                                            }}
                                          >
                                            {run.model}
                                          </span>
                                        )}
                                        {run.usage && (
                                          <span style={{ color: "var(--mc-muted)", opacity: 0.5 }}>
                                            {run.usage.total_tokens.toLocaleString()} tokens
                                          </span>
                                        )}
                                      </div>
                                      {run.summary && (
                                        <p
                                          className="text-[11px] mt-1 line-clamp-2"
                                          style={{ color: "var(--mc-muted)", opacity: 0.8 }}
                                        >
                                          {run.summary}
                                        </p>
                                      )}
                                      {run.error && (
                                        <p className="text-[11px] mt-1 line-clamp-2 text-red-400/80">
                                          {run.error}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        )}
      </motion.div>

      {/* Summary footer */}
      {jobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 mt-6 flex items-center gap-8"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
            <span className="text-xs" style={{ color: "var(--mc-muted)" }}>Total Jobs</span>
            <span className="text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              {jobs.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" style={{ color: "#34d399" }} />
            <span className="text-xs" style={{ color: "var(--mc-muted)" }}>Enabled</span>
            <span className="text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
              {enabledCount}
            </span>
          </div>
          {pageView === "calendar" && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" style={{ color: "var(--mc-accent)" }} />
              <span className="text-xs" style={{ color: "var(--mc-muted)" }}>Events This Period</span>
              <span className="text-sm font-semibold" style={{ color: "var(--mc-text)" }}>
                {filtered.length}
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Delete cron job modal */}
      {deleteTarget && (
        <DeleteCronJobDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          jobId={deleteTarget.id}
          jobName={deleteTarget.name}
          scheduleExpr={deleteTarget.scheduleExpr}
          agentName={deleteTarget.agentId ? agentNames[deleteTarget.agentId] : undefined}
          agentAvatar={deleteTarget.agentId ? agentAvatars[deleteTarget.agentId] : undefined}
          onDeleted={fetchCronData}
        />
      )}

      {/* Create cron job modal */}
      <CreateCronJobDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        agents={agents}
        onCreated={fetchCronData}
      />
    </div>
  );
}

// ── Sort header helper ──

function SortHeader({
  field,
  label,
  sortBy,
  sortDir,
  onSort,
  className = "",
}: {
  field: SortField;
  label: string;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortBy === field;
  return (
    <button
      className={`flex items-center gap-1 hover:opacity-80 transition-opacity ${className}`}
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      <ArrowUpDown
        className="w-2.5 h-2.5"
        style={{ opacity: active ? 1 : 0.3, color: active ? "var(--mc-accent)" : "var(--mc-muted)" }}
      />
      {active && (
        <span className="text-[9px]" style={{ color: "var(--mc-accent)" }}>
          {sortDir === "asc" ? "\u25B2" : "\u25BC"}
        </span>
      )}
    </button>
  );
}
