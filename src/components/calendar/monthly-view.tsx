"use client";

import { useMemo } from "react";
import { EventPill, type CronOccurrence } from "./event-pill";

interface MonthlyViewProps {
  occurrences: CronOccurrence[];
  month: Date;
  onDayClick?: (date: Date) => void;
  agentAvatars?: Record<string, string>;
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

export function MonthlyView({ occurrences, month, onDayClick, agentAvatars = {} }: MonthlyViewProps) {
  const m = month.getMonth();
  const year = month.getFullYear();

  const weeks = useMemo(() => {
    const firstDay = new Date(year, m, 1);
    const firstDow = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - firstDow);

    const result: Date[][] = [];
    const d = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let di = 0; di < 7; di++) {
        week.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      if (week.some((day) => day.getMonth() === m)) {
        result.push(week);
      }
    }
    return result;
  }, [year, m]);

  const byDay = useMemo(() => {
    const map = new Map<string, CronOccurrence[]>();
    for (const occ of occurrences) {
      const d = new Date(occ.time);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(occ);
    }
    return map;
  }, [occurrences]);

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr>
            {DAY_NAMES.map((name, i) => (
              <th
                key={name}
                className="text-center py-2.5 text-[11px] font-medium uppercase tracking-wider"
                style={{
                  color: "var(--mc-muted)",
                  borderBottom: "1px solid var(--mc-border)",
                  borderRight: i < 6 ? "1px solid var(--mc-border)" : undefined,
                }}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const inMonth = day.getMonth() === m;
                const today = isToday(day);
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const events = byDay.get(key) || [];
                const hasEvents = events.length > 0;

                return (
                  <td
                    key={di}
                    className="align-top cursor-pointer transition-colors"
                    style={{
                      height: "110px",
                      padding: "6px",
                      borderBottom:
                        wi < weeks.length - 1
                          ? "1px solid var(--mc-border)"
                          : undefined,
                      borderRight:
                        di < 6 ? "1px solid var(--mc-border)" : undefined,
                      backgroundColor: today
                        ? "color-mix(in srgb, var(--mc-accent) 5%, transparent)"
                        : hasEvents
                          ? "color-mix(in srgb, var(--mc-surface) 60%, transparent)"
                          : undefined,
                      opacity: inMonth ? 1 : 0.25,
                    }}
                    onClick={() => onDayClick?.(day)}
                  >
                    <div className="flex justify-end mb-1">
                      <span
                        className="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full"
                        style={{
                          color: today ? "white" : "var(--mc-text)",
                          backgroundColor: today ? "var(--mc-accent)" : "transparent",
                        }}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {events.slice(0, 3).map((occ) => (
                        <EventPill
                          key={occ.jobId + occ.time}
                          occurrence={occ}
                          compact
                          agentAvatar={occ.agentId ? agentAvatars[occ.agentId] : undefined}
                        />
                      ))}
                      {events.length > 3 && (
                        <div
                          className="text-[10px] px-1 text-center font-medium"
                          style={{ color: "var(--mc-muted)" }}
                        >
                          +{events.length - 3} more
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
