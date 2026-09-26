import type { PeriodPhase } from "@/lib/types";

export const isRevisionPhase = (p: Pick<PeriodPhase, "phase_name">) => /revision|recap/i.test(p.phase_name);

/**
 * One class period drawn to scale: each phase's width is its share of the minutes,
 * faint ticks mark every 5 minutes, revision is highlighted, and (in presenter mode)
 * finished phases fade while the current one carries an ink underline.
 */
export default function PeriodStrip({ phases, current, compact = false, label }: {
  phases: Pick<PeriodPhase, "phase_name" | "duration_minutes" | "method_name">[];
  current?: number;
  compact?: boolean;
  label?: string;
}) {
  const total = phases.reduce((n, p) => n + p.duration_minutes, 0);
  return (
    <div
      className="period-strip"
      role="list"
      aria-label={label || `Class plan, ${total} minutes`}
      style={{ ["--period-minutes" as string]: total }}
    >
      {phases.map((p, i) => {
        const state = current === undefined ? "" : i < current ? " period-strip__phase--done" : i === current ? " period-strip__phase--current" : "";
        return (
          <div
            key={i}
            role="listitem"
            className={`period-strip__phase${isRevisionPhase(p) ? " period-strip__phase--revision" : ""}${state}`}
            style={{ flex: p.duration_minutes }}
            title={`${p.duration_minutes} min · ${p.phase_name}${p.method_name ? ` · ${p.method_name}` : ""}`}
          >
            <div className="period-strip__minutes">{p.duration_minutes}<span style={{ fontWeight: 400, fontSize: "0.8em" }}> min</span></div>
            {!compact && <div className="period-strip__name">{p.phase_name}</div>}
            {!compact && p.method_name && <div className="period-strip__method">{p.method_name}</div>}
          </div>
        );
      })}
    </div>
  );
}
