"use client";

import { useMemo } from "react";
import { EventPill, type CronOccurrence } from "./event-pill";

interface DailyViewProps {
  occurrences: CronOccurrence[];
  date: Date;
  agentAvatars?: Record<string, string>;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DailyView({ occurrences, date, agentAvatars = {} }: DailyViewProps) {
  const byHour = useMemo(() => {
    const map = new Map<number, CronOccurrence[]>();
    for (const occ of occurrences) {
      const occDate = new Date(occ.time);
      if (!isSameDay(occDate, date)) continue;
      const hour = occDate.getHours();
      if (!map.has(hour)) map.set(hour, []);
      map.get(hour)!.push(occ);
    }
    return map;
  }, [occurrences, date]);

  const now = new Date();
  const isViewingToday = isSameDay(date, now);
  const nowHour = now.getHours();
  const nowMinutePercent = (now.getMinutes() / 60) * 100;

  return (
    <div className="glass-card overflow-hidden">
      <div
        className="overflow-y-auto"
        style={{ maxHeight: "700px", scrollbarGutter: "stable" }}
      >
        {HOURS.map((hour) => {
          const events = byHour.get(hour) || [];
          const hasEvents = events.length > 0;
          const isCurrentHour = isViewingToday && nowHour === hour;

          return (
            <div
              key={hour}
              className="grid relative"
              style={{
                gridTemplateColumns: "72px 1fr",
                minHeight: "52px",
                borderBottom: "1px solid var(--mc-border)",
              }}
            >
              {isCurrentHour && (
                <div
                  className="absolute left-[72px] right-0 z-[5] pointer-events-none"
                  style={{ top: `${nowMinutePercent}%` }}
                >
                  <div className="flex items-center">
                    <div
                      className="w-2 h-2 rounded-full -ml-1 flex-shrink-0"
                      style={{ backgroundColor: "var(--mc-accent)" }}
                    />
                    <div
                      className="h-[2px] flex-1"
                      style={{ backgroundColor: "var(--mc-accent)", opacity: 0.6 }}
                    />
                  </div>
                </div>
              )}

              <div
                className="text-[11px] text-right pr-4 pt-3 select-none font-medium"
                style={{
                  color: hasEvents ? "var(--mc-text)" : "var(--mc-muted)",
                  opacity: hasEvents ? 0.8 : 0.35,
                  borderRight: "1px solid var(--mc-border)",
                }}
              >
                {formatHour(hour)}
              </div>

              <div className="py-1.5 px-3 space-y-1.5">
                {events.map((occ) => (
                  <div
                    key={occ.jobId + occ.time}
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor: "var(--mc-surface)",
                      border: "1px solid var(--mc-border)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {occ.agentId && agentAvatars[occ.agentId] && (
                        <span className="text-base leading-none">
                          {agentAvatars[occ.agentId]}
                        </span>
                      )}
                      <EventPill occurrence={occ} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span style={{ color: "var(--mc-muted)" }}>Schedule</span>
                        <span
                          className="font-mono"
                          style={{ color: "var(--mc-text)", opacity: 0.7 }}
                        >
                          {occ.scheduleExpr}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--mc-muted)" }}>Agent</span>
                        <span style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                          {occ.agentId || "unassigned"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--mc-muted)" }}>Type</span>
                        <span style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                          {occ.payload.kind}
                        </span>
                      </div>
                      {occ.tz && (
                        <div className="flex justify-between">
                          <span style={{ color: "var(--mc-muted)" }}>Timezone</span>
                          <span style={{ color: "var(--mc-text)", opacity: 0.7 }}>
                            {occ.tz}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
