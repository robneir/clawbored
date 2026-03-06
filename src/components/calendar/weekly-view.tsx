"use client";

import { useMemo } from "react";
import { EventPill, type CronOccurrence } from "./event-pill";

interface WeeklyViewProps {
  occurrences: CronOccurrence[];
  weekStart: Date;
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

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const COL_TEMPLATE = "56px repeat(7, minmax(0, 1fr))";

export function WeeklyView({ occurrences, weekStart, agentAvatars = {} }: WeeklyViewProps) {
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const byDayHour = useMemo(() => {
    const map = new Map<string, CronOccurrence[]>();
    for (const occ of occurrences) {
      const occDate = new Date(occ.time);
      const dayIdx = days.findIndex((d) => isSameDay(d, occDate));
      if (dayIdx === -1) continue;
      const hour = occDate.getHours();
      const key = `${dayIdx}-${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(occ);
    }
    return map;
  }, [occurrences, days]);

  const now = new Date();
  const todayIdx = days.findIndex((d) => isToday(d));
  const nowHour = now.getHours();
  const nowMinutePercent = (now.getMinutes() / 60) * 100;

  return (
    <div className="glass-card overflow-hidden">
      <div
        className="overflow-y-auto"
        style={{ maxHeight: "640px", scrollbarGutter: "stable" }}
      >
        {/* Sticky header */}
        <div
          className="grid sticky top-0 z-10"
          style={{
            gridTemplateColumns: COL_TEMPLATE,
            borderBottom: "1px solid var(--mc-border)",
            backgroundColor: "var(--mc-surface)",
          }}
        >
          <div style={{ borderRight: "1px solid var(--mc-border)" }} />
          {days.map((day, i) => {
            const today = isToday(day);
            return (
              <div
                key={i}
                className="text-center py-3"
                style={{
                  borderRight: i < 6 ? "1px solid var(--mc-border)" : undefined,
                  backgroundColor: today
                    ? "color-mix(in srgb, var(--mc-accent) 4%, transparent)"
                    : undefined,
                }}
              >
                <div
                  className="text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: today ? "var(--mc-accent)" : "var(--mc-muted)" }}
                >
                  {DAY_NAMES[i]}
                </div>
                <div className="flex justify-center mt-1">
                  <span
                    className="text-base font-semibold w-8 h-8 flex items-center justify-center rounded-full"
                    style={{
                      color: today ? "white" : "var(--mc-text)",
                      backgroundColor: today ? "var(--mc-accent)" : "transparent",
                    }}
                  >
                    {day.getDate()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid"
            style={{
              gridTemplateColumns: COL_TEMPLATE,
              minHeight: "52px",
              borderBottom: "1px solid var(--mc-border)",
            }}
          >
            <div
              className="text-[10px] text-right pr-2 pt-1.5 select-none"
              style={{
                color: "var(--mc-muted)",
                opacity: 0.5,
                borderRight: "1px solid var(--mc-border)",
              }}
            >
              {formatHour(hour)}
            </div>

            {days.map((_, dayIdx) => {
              const key = `${dayIdx}-${hour}`;
              const events = byDayHour.get(key) || [];
              const isCurrentHour = todayIdx === dayIdx && nowHour === hour;

              return (
                <div
                  key={dayIdx}
                  className="relative px-1 py-1"
                  style={{
                    borderRight: dayIdx < 6 ? "1px solid var(--mc-border)" : undefined,
                    backgroundColor:
                      todayIdx === dayIdx
                        ? "color-mix(in srgb, var(--mc-accent) 2%, transparent)"
                        : undefined,
                  }}
                >
                  {isCurrentHour && (
                    <div
                      className="absolute left-0 right-0 z-[5] pointer-events-none"
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

                  <div className="space-y-0.5">
                    {events.slice(0, 3).map((occ) => (
                      <EventPill
                        key={occ.jobId + occ.time}
                        occurrence={occ}
                        agentAvatar={occ.agentId ? agentAvatars[occ.agentId] : undefined}
                      />
                    ))}
                    {events.length > 3 && (
                      <div
                        className="text-[10px] px-1 font-medium"
                        style={{ color: "var(--mc-muted)" }}
                      >
                        +{events.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
