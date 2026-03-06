"use client";

import { Repeat, Timer, CalendarClock } from "lucide-react";

export interface CronOccurrence {
  jobId: string;
  jobName: string;
  agentId?: string;
  time: string;
  scheduleKind: "cron" | "every" | "at";
  scheduleExpr: string;
  tz?: string;
  enabled: boolean;
  payload: {
    kind: "systemEvent" | "agentTurn";
    event?: string | null;
    message?: string | null;
  };
}

interface EventPillProps {
  occurrence: CronOccurrence;
  compact?: boolean;
  agentAvatar?: string;
}

const kindConfig = {
  cron: { icon: Repeat, color: "var(--mc-accent)" },
  every: { icon: Timer, color: "#f59e0b" },
  at: { icon: CalendarClock, color: "#34d399" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EventPill({ occurrence, compact, agentAvatar }: EventPillProps) {
  const config = kindConfig[occurrence.scheduleKind];
  const Icon = config.icon;

  return (
    <div
      className="rounded-md px-1.5 py-1 text-[11px] cursor-default flex items-center gap-1 min-w-0"
      style={{
        backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${config.color} 20%, transparent)`,
        color: "var(--mc-text)",
      }}
      title={`${occurrence.jobName}\nSchedule: ${occurrence.scheduleExpr}\nAgent: ${occurrence.agentId || "unassigned"}\nType: ${occurrence.payload.kind}`}
    >
      {agentAvatar ? (
        <span className="text-[11px] leading-none flex-shrink-0">{agentAvatar}</span>
      ) : (
        <Icon
          className="w-2.5 h-2.5 flex-shrink-0"
          style={{ color: config.color, opacity: 0.8 }}
        />
      )}
      {compact ? (
        <span className="truncate">{occurrence.jobName}</span>
      ) : (
        <>
          <span
            className="font-medium flex-shrink-0"
            style={{ color: config.color }}
          >
            {formatTime(occurrence.time)}
          </span>
          <span className="truncate" style={{ opacity: 0.8 }}>
            {occurrence.jobName}
          </span>
        </>
      )}
    </div>
  );
}
