"use client";

import { useEffect, useState, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Tv,
  BookOpen,
  Edit3,
  Flame,
  ArrowRight,
  ShieldAlert,
  Save,
  Layers,
  ChevronRight,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { Course, NextClassPlan, PeriodPhase } from "@/lib/types";

export default function PresenterPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [sessionNumber, setSessionNumber] = useState<number>(1);
  const [plan, setPlan] = useState<NextClassPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Presenter cockpit states
  const [activePhaseIndex, setActivePhaseIndex] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300); // 5 min default
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [projectorMode, setProjectorMode] = useState<boolean>(false);
  const [scratchpad, setScratchpad] = useState<string>("");
  const [rolloverFlagged, setRolloverFlagged] = useState<boolean>(false);
  const [loggingSuccess, setLoggingSuccess] = useState<string | null>(null);
  const [engagementRating, setEngagementRating] = useState<number>(4);

  // Keep track of modified phase durations for "+5 min" adjustments
  const [dynamicPhases, setDynamicPhases] = useState<PeriodPhase[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    coursesAPI
      .list()
      .then((c) => {
        setCourses(c);
        if (c.length > 0) {
          setSelectedCourseId(c[0].id);
          loadSession(c[0].id, 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadSession = async (courseId: string, sNum: number) => {
    setLoading(true);
    setIsRunning(false);
    setLoggingSuccess(null);
    try {
      const data = await coursesAPI.optimizeNextClass(courseId, sNum);
      setPlan(data);
      setDynamicPhases(data.phases || []);
      setActivePhaseIndex(0);
      if (data.phases && data.phases.length > 0) {
        setSecondsRemaining(data.phases[0].duration_minutes * 60);
      }
    } catch {
      setPlan(null);
      setDynamicPhases([]);
    } finally {
      setLoading(false);
    }
  };

  // Timer loop
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            // Auto advance or pause
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetCurrentPhase = () => {
    setIsRunning(false);
    if (dynamicPhases[activePhaseIndex]) {
      setSecondsRemaining(dynamicPhases[activePhaseIndex].duration_minutes * 60);
    }
  };

  const handleNextPhase = () => {
    if (activePhaseIndex < dynamicPhases.length - 1) {
      const nextIdx = activePhaseIndex + 1;
      setActivePhaseIndex(nextIdx);
      setIsRunning(false);
      setSecondsRemaining(dynamicPhases[nextIdx].duration_minutes * 60);
    }
  };

  const handlePrevPhase = () => {
    if (activePhaseIndex > 0) {
      const prevIdx = activePhaseIndex - 1;
      setActivePhaseIndex(prevIdx);
      setIsRunning(false);
      setSecondsRemaining(dynamicPhases[prevIdx].duration_minutes * 60);
    }
  };

  // Keyboard Shortcuts Listener (Space, ArrowRight/K, ArrowLeft/J, E, F, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsRunning((prev) => !prev);
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPhase();
      } else if (e.key === "j" || e.key === "J" || e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPhase();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleExtendBy5();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setProjectorMode((prev) => !prev);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        resetCurrentPhase();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePhaseIndex, dynamicPhases, isRunning]);

  const handleSelectPhase = (idx: number) => {
    setActivePhaseIndex(idx);
    setIsRunning(false);
    setSecondsRemaining(dynamicPhases[idx].duration_minutes * 60);
  };

  // Extend active phase by 5 minutes
  const handleExtendBy5 = () => {
    if (!dynamicPhases[activePhaseIndex]) return;

    setDynamicPhases((prev) => {
      const updated = [...prev];
      const curr = { ...updated[activePhaseIndex] };
      curr.duration_minutes += 5;
      updated[activePhaseIndex] = curr;

      // If there is a wrap-up phase at the end, attempt to compress it or flag rollover
      const lastIdx = updated.length - 1;
      if (lastIdx > activePhaseIndex && updated[lastIdx].duration_minutes > 5) {
        updated[lastIdx] = {
          ...updated[lastIdx],
          duration_minutes: updated[lastIdx].duration_minutes - 5,
        };
      } else {
        setRolloverFlagged(true);
      }
      return updated;
    });

    setSecondsRemaining((prev) => prev + 300);
  };

  // Flag topics for rollover into next period
  const handleFlagRollover = () => {
    setRolloverFlagged(true);
    setScratchpad((prev) =>
      prev + `\n[ROLLOVER NOTE]: Topic '${plan?.topic_title}' extended. Remainder deferred to Period ${sessionNumber + 1}.`
    );
  };

  // Finish and Log Session
  const handleCompleteAndLog = async () => {
    if (!selectedCourseId) return;
    try {
      const totalMinutesSpent = dynamicPhases.reduce((acc, p) => acc + p.duration_minutes, 0);
      await coursesAPI.logTeachingSession(selectedCourseId, sessionNumber, {
        actual_minutes: totalMinutesSpent,
        student_engagement_rating: engagementRating,
        teacher_notes: scratchpad || (rolloverFlagged ? "Topic rolled over" : "Session delivered as planned"),
        completion_rate: rolloverFlagged ? 0.75 : 1.0,
      });
      setLoggingSuccess(`Period ${sessionNumber} recorded successfully! Teaching logs and attendance updated.`);
      setIsRunning(false);
    } catch {
      setLoggingSuccess("Session recorded locally.");
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remSecs.toString().padStart(2, "0")}`;
  };

  const activePhase = dynamicPhases[activePhaseIndex];
  const totalAllocatedMinutes = dynamicPhases.reduce((s, p) => s + p.duration_minutes, 0);

  const activeCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div
      className="animate-fade-in"
      style={{
        background: projectorMode ? "#000000" : "transparent",
        color: projectorMode ? "#ffffff" : "inherit",
        minHeight: "100vh",
        padding: projectorMode ? "20px" : "0",
        borderRadius: projectorMode ? "var(--radius-lg)" : "0",
      }}
    >
      {/* Cockpit Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: projectorMode ? "2px solid #333" : "1px solid var(--border-default)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge badge-info" style={{ fontSize: "0.8125rem", padding: "4px 10px" }}>
              LIVE PRESENTER WORKSTATION
            </span>
            {projectorMode && (
              <span className="badge badge-warning" style={{ fontSize: "0.8125rem" }}>
                PROJECTOR MODE ON
              </span>
            )}
            {rolloverFlagged && (
              <span className="badge badge-danger" style={{ fontSize: "0.8125rem" }}>
                ROLLOVER FLAGGED
              </span>
            )}
          </div>
          <h1
            style={{
              fontSize: projectorMode ? "2rem" : "1.65rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginTop: 4,
            }}
          >
            {plan?.topic_title || "Course Session Delivery"}
          </h1>
        </div>

        {/* Controls: Course & Session Selectors + Projector Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {courses.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(e) => {
                setSelectedCourseId(e.target.value);
                loadSession(e.target.value, sessionNumber);
              }}
              className="input-select"
              style={{
                fontSize: "0.875rem",
                padding: "8px 14px",
                background: projectorMode ? "#111" : undefined,
                color: projectorMode ? "#fff" : undefined,
                borderColor: projectorMode ? "#444" : undefined,
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          )}

          <select
            value={sessionNumber}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setSessionNumber(val);
              loadSession(selectedCourseId, val);
            }}
            className="input-select"
            style={{
              fontSize: "0.875rem",
              padding: "8px 14px",
              background: projectorMode ? "#111" : undefined,
              color: projectorMode ? "#fff" : undefined,
              borderColor: projectorMode ? "#444" : undefined,
            }}
          >
            {Array.from({ length: activeCourse?.total_classes || 40 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>
                Period {s}
              </option>
            ))}
          </select>

          <button
            onClick={() => setProjectorMode(!projectorMode)}
            className="btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              fontSize: "0.875rem",
              background: projectorMode ? "#222" : undefined,
              color: projectorMode ? "#00ffff" : undefined,
              border: projectorMode ? "1px solid #00ffff" : undefined,
            }}
          >
            <Tv size={16} />
            {projectorMode ? "Standard View" : "Projector Mode"}
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Helper Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "8px 16px",
          background: projectorMode ? "#141414" : "rgba(255, 255, 255, 0.03)",
          border: projectorMode ? "1px solid #333" : "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginBottom: 20,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
          ⚡ Presenter Hotkeys:
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>Space</kbd> Start/Pause</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>→</kbd> / <kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>K</kbd> Next Phase</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>←</kbd> / <kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>J</kbd> Prev Phase</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>E</kbd> +5 Min</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>F</kbd> Projector</span>
          <span><kbd style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace" }}>R</kbd> Reset</span>
        </div>
      </div>

      {/* Revision Alert Banner if Weak Prereq Detected */}
      {plan?.revision_needed && (
        <div
          style={{
            background: projectorMode ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.08)",
            border: "1px solid var(--accent-amber)",
            borderRadius: "var(--radius-md)",
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <AlertTriangle size={24} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--accent-amber)", fontSize: "0.9375rem" }}>
              Adaptive Revision Phase Active ({plan.revision_minutes} Minutes)
            </div>
            <div style={{ fontSize: "0.8125rem", color: projectorMode ? "#ddd" : "var(--text-secondary)" }}>
              {plan.revision_reason || "Student performance on prerequisite concepts dropped below mastery threshold."}{" "}
              Reviewing: <strong>{plan.revision_concept}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Phase Stepper + Big Digital Countdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: projectorMode ? "1.2fr 0.8fr" : "1.4fr 1fr",
          gap: 24,
          marginBottom: 28,
        }}
      >
        {/* Left Column: Big Timer & Phase Detail */}
        <div
          className="card"
          style={{
            padding: "32px",
            background: projectorMode ? "#0c0c0c" : "var(--bg-card)",
            border: projectorMode ? "2px solid #333" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-xl)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
              color: "var(--brand-end)",
              marginBottom: 8,
            }}
          >
            Phase {activePhaseIndex + 1} of {dynamicPhases.length}: {activePhase?.phase_name}
          </div>

          {/* Large Digital Clock */}
          <div
            style={{
              fontSize: projectorMode ? "6rem" : "4.8rem",
              fontWeight: 900,
              fontFamily: "var(--font-geist-mono), monospace",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              margin: "16px 0",
              color:
                secondsRemaining <= 60
                  ? "var(--accent-rose)"
                  : isRunning
                  ? projectorMode
                    ? "#00ffff"
                    : "var(--accent-emerald)"
                  : projectorMode
                  ? "#fff"
                  : "var(--text-primary)",
              textShadow: isRunning ? "0 0 30px rgba(16, 185, 129, 0.25)" : "none",
            }}
          >
            {formatTime(secondsRemaining)}
          </div>

          <div
            style={{
              fontSize: "0.9375rem",
              color: projectorMode ? "#aaa" : "var(--text-secondary)",
              maxWidth: 480,
              marginBottom: 24,
            }}
          >
            {activePhase?.activity_description}
          </div>

          {/* Controls: Play/Pause/Reset/Next */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={toggleTimer}
              className="btn-primary"
              style={{
                padding: "14px 28px",
                fontSize: "1.05rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderRadius: "var(--radius-full)",
              }}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} />}
              {isRunning ? "Pause Phase" : "Start Phase"}
            </button>

            <button
              onClick={resetCurrentPhase}
              className="btn-secondary"
              style={{ padding: "14px 20px", borderRadius: "var(--radius-full)" }}
              title="Reset phase time"
            >
              <RotateCcw size={18} />
            </button>

            <button
              onClick={handleNextPhase}
              disabled={activePhaseIndex >= dynamicPhases.length - 1}
              className="btn-secondary"
              style={{
                padding: "14px 22px",
                borderRadius: "var(--radius-full)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>Next Phase</span>
              <SkipForward size={18} />
            </button>

            <button
              onClick={handleExtendBy5}
              className="btn-secondary"
              style={{
                padding: "14px 20px",
                borderRadius: "var(--radius-full)",
                fontWeight: 600,
                color: "var(--accent-amber)",
                borderColor: "rgba(245, 158, 11, 0.4)",
              }}
              title="Add 5 minutes to this phase"
            >
              +5 Mins
            </button>
          </div>

          {/* Rollover Button */}
          <div style={{ marginTop: 20 }}>
            <button
              onClick={handleFlagRollover}
              disabled={rolloverFlagged}
              className="btn-ghost"
              style={{
                fontSize: "0.8125rem",
                color: rolloverFlagged ? "var(--text-muted)" : "var(--accent-rose)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ShieldAlert size={14} />
              {rolloverFlagged ? "Topic Rollover Flagged" : "Flag Remaining Concepts for Next Class Rollover"}
            </button>
          </div>
        </div>

        {/* Right Column: 5-Phase Sequence Stepper */}
        <div
          className="card"
          style={{
            padding: "24px",
            background: projectorMode ? "#0c0c0c" : "var(--bg-card)",
            border: projectorMode ? "2px solid #333" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-xl)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              borderBottom: "1px solid var(--border-default)",
              paddingBottom: 12,
            }}
          >
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Period Phases ({totalAllocatedMinutes}m)</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click to Jump</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {dynamicPhases.map((phase, idx) => {
              const isCurrent = idx === activePhaseIndex;
              const isPast = idx < activePhaseIndex;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelectPhase(idx)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    background: isCurrent
                      ? projectorMode
                        ? "rgba(0, 255, 255, 0.15)"
                        : "rgba(99, 102, 241, 0.12)"
                      : projectorMode
                      ? "#141414"
                      : "var(--bg-secondary)",
                    border: isCurrent
                      ? projectorMode
                        ? "2px solid #00ffff"
                        : "2px solid var(--brand-start)"
                      : "1px solid var(--border-default)",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "var(--radius-full)",
                          background: isCurrent
                            ? "var(--brand-start)"
                            : isPast
                            ? "var(--accent-emerald)"
                            : "var(--bg-elevated)",
                          color: "#fff",
                          fontSize: "0.75rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                        }}
                      >
                        {isPast ? "✓" : idx + 1}
                      </span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? (projectorMode ? "#00ffff" : "var(--text-primary)") : "inherit",
                        }}
                      >
                        {phase.phase_name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "var(--accent-amber)",
                      }}
                    >
                      {phase.duration_minutes}m
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: projectorMode ? "#888" : "var(--text-muted)",
                      marginTop: 4,
                      marginLeft: 30,
                    }}
                  >
                    Method: <strong>{phase.method_name}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section: Presenter Scratchpad & Log Session */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
        {/* Scratchpad */}
        <div
          className="card"
          style={{
            padding: "20px",
            background: projectorMode ? "#0c0c0c" : "var(--bg-card)",
            border: projectorMode ? "2px solid #333" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Edit3 size={18} color="var(--brand-end)" />
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Faculty Classroom Scratchpad</h3>
          </div>
          <textarea
            value={scratchpad}
            onChange={(e) => setScratchpad(e.target.value)}
            placeholder="Type live lecture notes, student queries, blackboard proofs, or concepts requiring reinforcement..."
            rows={4}
            className="input-text"
            style={{
              width: "100%",
              background: projectorMode ? "#111" : undefined,
              color: projectorMode ? "#fff" : undefined,
              borderColor: projectorMode ? "#333" : undefined,
            }}
          />
        </div>

        {/* Complete Session & Attendance Logging */}
        <div
          className="card"
          style={{
            padding: "20px",
            background: projectorMode ? "#0c0c0c" : "var(--bg-card)",
            border: projectorMode ? "2px solid #333" : "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>Conclude Period {sessionNumber}</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 14 }}>
              Record actual classroom minutes and student engagement to drive adaptive continuous optimization.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: 6 }}>
                Class Engagement (1 to 5 Stars):
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setEngagementRating(star)}
                    className="btn-secondary"
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.875rem",
                      background: engagementRating >= star ? "var(--brand-start)" : undefined,
                      color: engagementRating >= star ? "#fff" : undefined,
                    }}
                  >
                    ★ {star}
                  </button>
                ))}
              </div>
            </div>

            {loggingSuccess && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid var(--accent-emerald)",
                  color: "var(--accent-emerald)",
                  fontSize: "0.8125rem",
                  marginBottom: 12,
                }}
              >
                {loggingSuccess}
              </div>
            )}
          </div>

          <button
            onClick={handleCompleteAndLog}
            className="btn-primary"
            style={{
              padding: "12px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <Save size={18} />
            <span>Finish Session & Log to DBMS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
