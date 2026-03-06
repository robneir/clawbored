import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CronExpressionParser } from "cron-parser";

// ── Types matching OpenClaw's actual job structure ──

export interface CronSchedule {
  kind: "cron" | "every" | "at";
  // cron kind uses expr, every kind uses everyMs, at kind uses atMs or expr
  expr?: string;
  everyMs?: number;
  anchorMs?: number;
  atMs?: number;
  tz?: string;
}

export interface CronPayload {
  kind: "systemEvent" | "agentTurn";
  event?: string | null;
  message?: string | null;
}

export interface CronDelivery {
  mode?: string;
  channel?: string;
  to?: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: CronSchedule;
  sessionTarget: "main" | "isolated";
  wakeMode: string;
  payload: CronPayload;
  delivery?: CronDelivery;
  enabled: boolean;
  agentId?: string;
  createdAtMs?: number;
  state?: {
    nextRunAtMs?: number;
  };
}

export interface CronRun {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  error?: string;
  summary?: string;
  deliveryStatus?: string;
  sessionId?: string;
  runAtMs: number;
  durationMs: number;
  nextRunAtMs?: number;
  model?: string;
  provider?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export interface CronOccurrence {
  jobId: string;
  jobName: string;
  agentId?: string;
  time: string; // ISO string
  scheduleKind: "cron" | "every" | "at";
  scheduleExpr: string; // human-readable description
  tz?: string;
  enabled: boolean;
  payload: CronPayload;
}

// ── Read jobs from disk ──

export function listCronJobs(profileDir: string): CronJob[] {
  const jobsPath = join(profileDir, "cron", "jobs.json");
  if (!existsSync(jobsPath)) return [];

  try {
    const raw = readFileSync(jobsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    return jobs as CronJob[];
  } catch {
    return [];
  }
}

// ── Human-readable schedule description ──

function describeSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "cron":
      return schedule.expr || "cron";
    case "every": {
      if (schedule.everyMs) {
        const seconds = schedule.everyMs / 1000;
        if (seconds < 60) return `every ${seconds}s`;
        const minutes = seconds / 60;
        if (minutes < 60) return `every ${minutes}m`;
        const hours = minutes / 60;
        if (hours < 24) return `every ${hours}h`;
        return `every ${hours / 24}d`;
      }
      return schedule.expr || "interval";
    }
    case "at": {
      if (schedule.atMs) return new Date(schedule.atMs).toLocaleString();
      return schedule.expr || "one-shot";
    }
    default:
      return "unknown";
  }
}

// ── Compute occurrences ──

const MAX_OCCURRENCES_PER_JOB = 500;

export function computeOccurrences(
  jobs: CronJob[],
  rangeStart: Date,
  rangeEnd: Date,
): CronOccurrence[] {
  const results: CronOccurrence[] = [];

  for (const job of jobs) {
    if (!job.enabled) continue;

    const base = {
      jobId: job.id,
      jobName: job.name,
      agentId: job.agentId,
      scheduleKind: job.schedule.kind,
      scheduleExpr: describeSchedule(job.schedule),
      tz: job.schedule.tz,
      enabled: job.enabled,
      payload: job.payload,
    };

    switch (job.schedule.kind) {
      case "cron": {
        if (!job.schedule.expr) break;
        try {
          const interval = CronExpressionParser.parse(job.schedule.expr, {
            currentDate: rangeStart,
            endDate: rangeEnd,
            tz: job.schedule.tz || undefined,
          });
          let count = 0;
          try {
            while (count < MAX_OCCURRENCES_PER_JOB) {
              const next = interval.next();
              results.push({ ...base, time: next.toDate().toISOString() });
              count++;
            }
          } catch {
            // Iterator exhausted — normal
          }
        } catch {
          // Invalid cron expression — skip
        }
        break;
      }

      case "every": {
        const ms = job.schedule.everyMs;
        if (!ms || ms <= 0) break;

        // Use the job's anchor if available, otherwise align to midnight
        const anchorTime = job.schedule.anchorMs
          ? job.schedule.anchorMs
          : new Date(rangeStart).setHours(0, 0, 0, 0);

        // Find the first occurrence at or after rangeStart
        let t: number;
        if (anchorTime >= rangeStart.getTime()) {
          t = anchorTime;
        } else {
          // Step forward from anchor to find first occurrence in range
          const elapsed = rangeStart.getTime() - anchorTime;
          const skipIntervals = Math.floor(elapsed / ms);
          t = anchorTime + skipIntervals * ms;
          if (t < rangeStart.getTime()) t += ms;
        }

        let count = 0;
        while (t <= rangeEnd.getTime() && count < MAX_OCCURRENCES_PER_JOB) {
          results.push({ ...base, time: new Date(t).toISOString() });
          count++;
          t += ms;
        }
        break;
      }

      case "at": {
        try {
          const atTime = job.schedule.atMs
            ? new Date(job.schedule.atMs)
            : job.schedule.expr
              ? new Date(job.schedule.expr)
              : null;
          if (atTime && atTime >= rangeStart && atTime <= rangeEnd) {
            results.push({ ...base, time: atTime.toISOString() });
          }
        } catch {
          // Invalid date — skip
        }
        break;
      }
    }
  }

  // Sort by time
  results.sort((a, b) => a.time.localeCompare(b.time));
  return results;
}

// ── Mutate jobs.json directly (fallback when CLI unavailable) ──

function readJobsFile(profileDir: string): { version: number; jobs: CronJob[] } {
  const jobsPath = join(profileDir, "cron", "jobs.json");
  if (!existsSync(jobsPath)) return { version: 1, jobs: [] };
  const raw = readFileSync(jobsPath, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version || 1,
    jobs: Array.isArray(parsed) ? parsed : parsed.jobs || [],
  };
}

function writeJobsFile(profileDir: string, data: { version: number; jobs: CronJob[] }) {
  const jobsPath = join(profileDir, "cron", "jobs.json");
  writeFileSync(jobsPath, JSON.stringify(data, null, 2));
  // Also write backup
  writeFileSync(jobsPath + ".bak", JSON.stringify(data, null, 2));
}

export function removeCronJob(profileDir: string, jobId: string): void {
  const data = readJobsFile(profileDir);
  const before = data.jobs.length;
  data.jobs = data.jobs.filter((j) => j.id !== jobId);
  if (data.jobs.length === before) {
    throw new Error(`Job '${jobId}' not found`);
  }
  writeJobsFile(profileDir, data);
}

export function toggleCronJob(profileDir: string, jobId: string, enabled: boolean): void {
  const data = readJobsFile(profileDir);
  const job = data.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`Job '${jobId}' not found`);
  job.enabled = enabled;
  writeJobsFile(profileDir, data);
}

// ── Next run computation ──

export function getNextRun(job: CronJob): number | null {
  if (!job.enabled) return null;

  // If the scheduler already computed it, use that
  if (job.state?.nextRunAtMs) return job.state.nextRunAtMs;

  const now = Date.now();

  switch (job.schedule.kind) {
    case "cron": {
      if (!job.schedule.expr) return null;
      try {
        const interval = CronExpressionParser.parse(job.schedule.expr, {
          currentDate: new Date(now),
          tz: job.schedule.tz || undefined,
        });
        return interval.next().toDate().getTime();
      } catch {
        return null;
      }
    }
    case "every": {
      const ms = job.schedule.everyMs;
      if (!ms || ms <= 0) return null;
      const anchor = job.schedule.anchorMs || new Date(now).setHours(0, 0, 0, 0);
      const elapsed = now - anchor;
      const intervals = Math.floor(elapsed / ms);
      let next = anchor + (intervals + 1) * ms;
      if (next <= now) next += ms;
      return next;
    }
    case "at": {
      const atTime = job.schedule.atMs
        ? job.schedule.atMs
        : job.schedule.expr
          ? new Date(job.schedule.expr).getTime()
          : null;
      if (atTime && atTime > now) return atTime;
      return null;
    }
    default:
      return null;
  }
}

// ── Execution history ──

export function listCronRuns(profileDir: string, jobId?: string, limit = 50): CronRun[] {
  const runsDir = join(profileDir, "cron", "runs");
  if (!existsSync(runsDir)) return [];

  try {
    const files = readdirSync(runsDir).filter((f) => f.endsWith(".jsonl"));
    const targetFiles = jobId
      ? files.filter((f) => f === `${jobId}.jsonl`)
      : files;

    const allRuns: CronRun[] = [];

    for (const file of targetFiles) {
      const content = readFileSync(join(runsDir, file), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const run = JSON.parse(line) as CronRun;
          if (run.action === "finished") {
            allRuns.push(run);
          }
        } catch {
          // Malformed line — skip
        }
      }
    }

    allRuns.sort((a, b) => b.ts - a.ts);
    return allRuns.slice(0, limit);
  } catch {
    return [];
  }
}
