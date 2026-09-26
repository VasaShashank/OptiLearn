"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, Plus } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { LessonPlan, PeriodPhase, SessionLogResult } from "@/lib/types";
import ResourceList from "@/components/resource-list";
import PeriodStrip from "@/components/period-strip";
import SessionLogModal from "@/components/session-log-modal";

const EXTEND_MINUTES = 5;

function fmt(totalSeconds: number): string {
  const s = Math.abs(Math.round(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Presenter() {
  const params = useSearchParams();
  const courseId = params.get("course") || "";
  const sessionNumber = Number(params.get("session")) || 0;
  const [theme, setTheme] = useTheme();

  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phases, setPhases] = useState<PeriodPhase[]>([]);
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [spent, setSpent] = useState<number[]>([]);        // ms already spent in each phase
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [overrun, setOverrun] = useState(0);                 // minutes the class will run over
  const [note, setNote] = useState("");
  const [scratch, setScratch] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState<SessionLogResult | null>(null);
  const scratchKey = `optiteach_scratch_${courseId}_${sessionNumber}`;
  const planned = useRef(0);

  useEffect(() => {
    if (!courseId || !sessionNumber) { setError("Open presenter mode from Today, the calendar or a lesson plan."); return; }
    coursesAPI.listLessonPlans(courseId, sessionNumber).then(([p]) => {
      if (!p) { setError("There is no plan for this period yet."); return; }
      setPlan(p);
      setPhases(p.phases);
      setSpent(p.phases.map(() => 0));
      planned.current = p.phases.reduce((n, x) => n + x.duration_minutes, 0);
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load the lesson plan"));
    try { setScratch(localStorage.getItem(scratchKey) || ""); } catch { /* no storage */ }
  }, [courseId, sessionNumber, scratchKey]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);

  // Time is derived from timestamps, not counted ticks, so it never drifts
  const currentMs = (spent[idx] || 0) + (running && startedAt ? Date.now() - startedAt : 0);
  const phase = phases[idx];
  const remaining = phase ? phase.duration_minutes * 60 - currentMs / 1000 : 0;
  const totalMs = spent.reduce((n, ms, i) => n + (i === idx ? 0 : ms), 0) + currentMs;

  const bank = useCallback(() => {
    // Fold the running interval into the current phase's total
    setSpent((prev) => prev.map((ms, i) => (i === idx && running && startedAt ? ms + Date.now() - startedAt : ms)));
    setStartedAt(running ? Date.now() : null);
  }, [idx, running, startedAt]);

  const toggle = useCallback(() => {
    if (running) {
      setSpent((prev) => prev.map((ms, i) => (i === idx && startedAt ? ms + Date.now() - startedAt : ms)));
      setStartedAt(null);
      setRunning(false);
    } else {
      setStartedAt(Date.now());
      setRunning(true);
    }
  }, [running, idx, startedAt]);

  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= phases.length) return;
    bank();
    setIdx(next);
  }, [phases.length, bank]);

  const extend = useCallback(() => {
    setPhases((prev) => {
      const nextPhases = prev.map((p) => ({ ...p }));
      nextPhases[idx].duration_minutes += EXTEND_MINUTES;
      let need = EXTEND_MINUTES;
      const squeezed: string[] = [];
      // Take the time back from the end of the period (the wrap-up first), keeping 1 min each
      for (let j = nextPhases.length - 1; j > idx && need > 0; j--) {
        const take = Math.min(need, nextPhases[j].duration_minutes - 1);
        if (take > 0) {
          nextPhases[j].duration_minutes -= take;
          need -= take;
          squeezed.push(`${take} min from ${nextPhases[j].phase_name}`);
        }
      }
      setOverrun((o) => o + need);
      setNote(`Added ${EXTEND_MINUTES} min to ${nextPhases[idx].phase_name}${squeezed.length ? `, taken as ${squeezed.join(" and ")}` : ""}.`);
      return nextPhases;
    });
  }, [idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (finishing || target.closest("textarea, input, select")) return;
      if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" || e.key === "j") goTo(idx + 1);
      else if (e.key === "ArrowLeft" || e.key === "k") goTo(idx - 1);
      else if (e.key === "e") extend();
      else if (e.key === "p") setTheme(theme === "projector" ? "light" : "projector");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, goTo, extend, idx, finishing, theme, setTheme]);

  const saveScratch = (value: string) => {
    setScratch(value);
    try { localStorage.setItem(scratchKey, value); } catch { /* no storage */ }
  };

  const resources = useMemo(() => plan?.resources || [], [plan]);

  if (error) {
    return (
      <div className="present-wrap">
        <p role="alert" style={{ fontSize: "1.2rem" }}>{error}</p>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: 16 }}><ArrowLeft size={16} /> Back to Today</Link>
      </div>
    );
  }
  if (!plan || !phase) return <div className="present-wrap"><div className="spinner" /></div>;

  if (done) {
    return (
      <div className="present-wrap">
        <h1 style={{ fontSize: "2rem" }}>Period {sessionNumber} recorded.</h1>
        <p style={{ color: "var(--pencil)", marginTop: 8, maxWidth: "60ch" }}>
          {done.carried_over?.to_session
            ? `${plan.topic_title} continues in period ${done.carried_over.to_session}.${done.carried_over.dropped_topic ? ` ${done.carried_over.dropped_topic} no longer fits in the remaining periods.` : ""}`
            : `${plan.topic_title} is ${done.topic_status === "completed" ? "finished" : "in progress"}.`}
        </p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 20 }}>Back to Today</Link>
      </div>
    );
  }

  const over = remaining < 0;
  const upcoming = phases[idx + 1];

  return (
    <div className="present">
      <header className="present-bar">
        <Link href="/" className="btn btn-ghost"><ArrowLeft size={18} /> Today</Link>
        <div style={{ minWidth: 0, textAlign: "center" }}>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plan.topic_title}</div>
          <div style={{ color: "var(--pencil)", fontSize: "0.9rem" }}>Period {sessionNumber}, {Math.floor(totalMs / 60000)} of {planned.current} min used</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setTheme(theme === "projector" ? "light" : "projector")} aria-pressed={theme === "projector"}>
            Projector
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { bank(); setRunning(false); setStartedAt(null); setFinishing(true); }}>
            Finish class
          </button>
        </div>
      </header>

      <div className="present-grid">
        <main className="present-main" aria-live="polite">
          <div className="present-phase">
            Phase {idx + 1} of {phases.length}
            {phase.phase_name ? `: ${phase.phase_name}` : ""}
          </div>
          <div className={`present-clock${over ? " is-over" : ""}`} role="timer" aria-label={over ? `Over time by ${fmt(remaining)}` : `${fmt(remaining)} left in this phase`}>
            {over ? "+" : ""}{fmt(remaining)}
          </div>
          <p className="present-activity">{phase.activity_description}</p>
          <p style={{ color: "var(--pencil)" }}>{phase.method_name}</p>

          <div className="present-controls">
            <button type="button" className="btn btn-secondary" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
              <ChevronLeft size={18} /> Previous
            </button>
            <button type="button" className="btn btn-primary present-play" onClick={toggle}>
              {running ? <><Pause size={20} /> Pause</> : <><Play size={20} /> {currentMs > 0 ? "Resume" : "Start"}</>}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => goTo(idx + 1)} disabled={idx === phases.length - 1}>
              Next phase <ChevronRight size={18} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={extend}>
              <Plus size={18} /> {EXTEND_MINUTES} min
            </button>
          </div>
          {note && <p role="status" style={{ color: "var(--pencil)", marginTop: 8 }}>{note}{overrun > 0 ? ` The class will run ${overrun} min over.` : ""}</p>}

          <div style={{ marginTop: 28 }}>
            <PeriodStrip phases={phases} current={idx} compact={false} label="Class progress" />
          </div>
          {upcoming && <p style={{ marginTop: 10, color: "var(--pencil)" }}>Next: {upcoming.phase_name}, {upcoming.duration_minutes} min</p>}

          <p className="present-keys">
            <span className="kbd">Space</span> start/pause <span className="kbd">→</span>/<span className="kbd">J</span> next
            <span className="kbd">←</span>/<span className="kbd">K</span> previous <span className="kbd">E</span> +5 min <span className="kbd">P</span> projector
          </p>
        </main>

        <aside className="present-side">
          <label className="field" style={{ marginTop: 0 }}>
            Scratchpad
            <textarea className="input" rows={8} value={scratch} onChange={(e) => saveScratch(e.target.value)}
              placeholder="Questions students asked, what to revisit next time…" style={{ resize: "vertical", fontWeight: 400 }} />
          </label>
          <p style={{ fontSize: "0.8rem", color: "var(--pencil)", marginTop: 4 }}>Saved on this device; added to the class record when you finish.</p>
          {resources.length > 0 && (
            <>
              <h2 className="builder-subhead">Material</h2>
              <ResourceList resources={resources} />
            </>
          )}
        </aside>
      </div>

      {finishing && (
        <SessionLogModal
          courseId={courseId}
          sessionNumber={sessionNumber}
          topicTitle={plan.topic_title}
          periodMinutes={planned.current}
          defaultMinutes={Math.max(1, Math.round(totalMs / 60000))}
          defaultNotes={scratch}
          onClose={() => setFinishing(false)}
          onLogged={(r) => {
            setFinishing(false);
            setDone(r);
            try { localStorage.removeItem(scratchKey); } catch { /* no storage */ }
          }}
        />
      )}
    </div>
  );
}

export default function PresentPage() {
  return (
    <Suspense fallback={null}>
      <Presenter />
    </Suspense>
  );
}
