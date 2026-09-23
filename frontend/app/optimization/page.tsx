"use client";

import { useEffect, useState } from "react";
import {
  Zap, Clock, BarChart3, AlertTriangle, CheckCircle2, RefreshCw,
  Play, Target, Layers, ArrowRight, TrendingUp,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { Course, CourseOptimization, NextClassPlan, TopicAllocation, PeriodPhase } from "@/lib/types";

export default function OptimizationPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [optimization, setOptimization] = useState<CourseOptimization | null>(null);
  const [nextClass, setNextClass] = useState<NextClassPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [nextClassLoading, setNextClassLoading] = useState(false);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      if (c.length > 0) {
        setSelectedCourse(c[0].id);
        return coursesAPI.getOptimization(c[0].id).then(setOptimization);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourse(courseId);
    setOptimization(null);
    setNextClass(null);
    try {
      const result = await coursesAPI.getOptimization(courseId);
      setOptimization(result);
    } catch { /* ignore */ }
  };

  const runOptimizer = async () => {
    if (!selectedCourse) return;
    setOptimizing(true);
    try {
      const result = await coursesAPI.optimize(selectedCourse);
      setOptimization(result);
    } catch { /* ignore */ }
    setOptimizing(false);
  };

  const optimizeNextClass = async (sessionNum?: number) => {
    if (!selectedCourse) return;
    setNextClassLoading(true);
    try {
      const result = await coursesAPI.optimizeNextClass(selectedCourse, sessionNum);
      setNextClass(result);
    } catch { /* ignore */ }
    setNextClassLoading(false);
  };

  const pressureConfig: Record<string, { label: string; color: string; badge: string }> = {
    healthy: { label: "Healthy", color: "var(--accent-emerald)", badge: "badge-success" },
    balanced: { label: "Balanced", color: "var(--accent-amber)", badge: "badge-warning" },
    high_pressure: { label: "High Pressure", color: "var(--accent-rose)", badge: "badge-danger" },
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 250, height: 32, marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: "var(--radius-lg)" }} />)}
        </div>
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius-lg)" }} />
      </div>
    );
  }

  const pc = optimization ? pressureConfig[optimization.time_pressure_status] || pressureConfig.healthy : null;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            <Zap size={24} style={{ display: "inline", verticalAlign: "middle", marginRight: 8, color: "var(--accent-amber)" }} />
            Optimization Engine
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
            Constrained time allocation & adaptive class planning
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {courses.length > 0 && (
            <select
              value={selectedCourse}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="input-select"
              style={{
                padding: "8px 14px",
                fontSize: "0.8125rem",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-secondary" onClick={runOptimizer} disabled={optimizing}>
            {optimizing ? <><div className="spinner" /> Running...</> : <><RefreshCw size={16} /> Re-Optimize</>}
          </button>
          <button className="btn btn-primary" onClick={() => optimizeNextClass()} disabled={nextClassLoading}>
            {nextClassLoading ? <><div className="spinner" /> Planning...</> : <><Play size={16} /> Optimize Next Class</>}
          </button>
        </div>
      </div>

      {optimization && (
        <>
          {/* Budget Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }} className="animate-fade-in-up">
            <BudgetCard label="Total Available" value={optimization.total_available_minutes} unit="min" icon={<Clock size={18} />} color="var(--accent-blue)" />
            <BudgetCard label="Instructional" value={optimization.total_allocated_minutes} unit="min" icon={<BarChart3 size={18} />} color="var(--accent-purple)" />
            <BudgetCard label="Revision" value={optimization.revision_budget_minutes} unit="min" icon={<RefreshCw size={18} />} color="var(--accent-amber)" />
            <BudgetCard label="Assessment" value={optimization.assessment_budget_minutes} unit="min" icon={<Target size={18} />} color="var(--accent-cyan)" />
            <BudgetCard label="Buffer" value={optimization.unallocated_buffer_minutes} unit="min" icon={<Zap size={18} />} color={pc?.color || "var(--text-muted)"} />
          </div>

          {/* Time Pressure + Budget Bar */}
          <div className="glass-card animate-fade-in-up stagger-2" style={{ padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`badge ${pc?.badge}`}>{pc?.label}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Time Pressure Status</span>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {optimization.formula_explanation?.model}
              </span>
            </div>
            {/* Stacked bar */}
            <div style={{ display: "flex", height: 28, borderRadius: "var(--radius-full)", overflow: "hidden", background: "var(--bg-secondary)" }}>
              <div style={{ width: `${(optimization.total_allocated_minutes / optimization.total_available_minutes) * 100}%`, background: "linear-gradient(90deg, var(--brand-start), var(--brand-mid))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.625rem", fontWeight: 600, color: "white" }} data-tooltip="Instructional">
                {Math.round((optimization.total_allocated_minutes / optimization.total_available_minutes) * 100)}%
              </div>
              <div style={{ width: `${(optimization.revision_budget_minutes / optimization.total_available_minutes) * 100}%`, background: "var(--accent-amber)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.625rem", fontWeight: 600, color: "var(--text-inverse)" }}>
                Rev
              </div>
              <div style={{ width: `${(optimization.assessment_budget_minutes / optimization.total_available_minutes) * 100}%`, background: "var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.625rem", fontWeight: 600, color: "var(--text-inverse)" }}>
                Assess
              </div>
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
              {optimization.formula_explanation?.invariant}
            </div>
          </div>

          {/* Topic Allocations Table */}
          <div className="card animate-fade-in-up stagger-3" style={{ overflow: "hidden", marginBottom: 32 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={16} style={{ color: "var(--accent-purple)" }} />
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Topic Time Allocations</h3>
              <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>{optimization.topic_allocations.length} topics</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Topic</th>
                  <th>Estimated</th>
                  <th>Allocated</th>
                  <th>Periods</th>
                  <th>Priority</th>
                  <th>Key Concepts</th>
                  <th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {optimization.topic_allocations.map((a: TopicAllocation) => (
                  <tr key={a.topic_id}>
                    <td><span className="badge badge-neutral">U{a.unit_number}</span></td>
                    <td style={{ fontWeight: 500, color: "var(--text-primary)", maxWidth: 200 }}>{a.topic_title}</td>
                    <td>{a.estimated_minutes}m</td>
                    <td style={{ fontWeight: 600, color: a.allocated_minutes >= a.estimated_minutes ? "var(--accent-emerald)" : "var(--accent-rose)" }}>
                      {a.allocated_minutes}m
                    </td>
                    <td style={{ fontWeight: 600 }}>{a.recommended_periods}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--bg-secondary)", overflow: "hidden" }}>
                          <div style={{ width: `${a.priority_score * 100}%`, height: "100%", background: a.priority_score > 0.6 ? "var(--accent-amber)" : "var(--accent-blue)", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>{a.priority_score.toFixed(3)}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {a.key_concepts.slice(0, 2).map((c) => (
                          <span key={c} className="badge badge-neutral" style={{ fontSize: "0.5625rem", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: 200 }}>{a.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Next Class Plan */}
      {nextClass && (
        <div className="animate-fade-in-up" style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <Play size={20} style={{ color: "var(--accent-emerald)" }} />
            Next Class Plan — Period {nextClass.session_number}
          </h2>

          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-info">Unit {nextClass.unit_number}</span>
                  <span className="badge badge-neutral">{nextClass.period_duration}m</span>
                  {nextClass.revision_needed && <span className="badge badge-warning">Revision Required</span>}
                </div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 700 }}>{nextClass.topic_title}</h3>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Predicted Gain</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-emerald)" }}>+{nextClass.learning_gain_prediction}%</div>
              </div>
            </div>

            {nextClass.revision_needed && nextClass.revision_concept && (
              <div style={{ padding: 12, borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <AlertTriangle size={14} style={{ color: "#fbbf24" }} />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#fbbf24" }}>Prerequisite Revision: {nextClass.revision_concept}</span>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>{nextClass.revision_reason}</p>
              </div>
            )}

            {/* Why Explanation */}
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16, padding: 12, borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", borderLeft: "3px solid var(--brand-start)" }}>
              {nextClass.why_explanation}
            </p>

            {/* Phase Breakdown */}
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
              Period Phase Breakdown ({nextClass.total_phase_minutes}m total)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {nextClass.phases.map((phase: PeriodPhase, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-default)" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: `linear-gradient(135deg, ${i === 0 ? "var(--accent-amber)" : i === nextClass.phases.length - 1 ? "var(--accent-emerald)" : "var(--brand-start)"}30, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", fontWeight: 700, color: i === 0 ? "var(--accent-amber)" : i === nextClass.phases.length - 1 ? "var(--accent-emerald)" : "var(--brand-start)", flexShrink: 0 }}>
                    {phase.duration_minutes}m
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{phase.phase_name}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 2 }}>{phase.activity_description}</div>
                  </div>
                  <span className="badge badge-neutral" style={{ fontSize: "0.625rem" }}>{phase.method_name}</span>
                </div>
              ))}
            </div>

            {/* Methods & Concepts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Recommended Methods</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {nextClass.recommended_methods.map((m) => (
                    <span key={m} className="badge badge-purple">{m}</span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Target Concepts</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {nextClass.target_concepts.map((c) => (
                    <span key={c} className="badge badge-info">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetCard({ label, value, unit, icon, color }: { label: string; value: number; unit: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.375rem", fontWeight: 700, color }}>{value}<span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>{unit}</span></div>
    </div>
  );
}
