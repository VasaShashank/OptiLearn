"use client";

import { useEffect, useState } from "react";
import {
  FileText, Clock, Lightbulb, AlertTriangle, CheckCircle2,
  BookOpen, Target, Play, RefreshCw, Calendar, Printer, Download,
} from "lucide-react";
import { coursesAPI, exportsAPI } from "@/lib/api";
import type { Course, LessonPlan, PeriodPhase } from "@/lib/types";

export default function LessonPlansPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedSessionNumber, setSelectedSessionNumber] = useState<number>(1);

  useEffect(() => {
    async function load() {
      try {
        const c = await coursesAPI.list();
        setCourses(c);
        if (c.length > 0) {
          setSelectedCourseId(c[0].id);
          const p = await coursesAPI.listLessonPlans(c[0].id);
          setPlans(p);
          if (p.length > 0) {
            setSelectedPlan(p[0]);
            setSelectedSessionNumber(p[0].session_number || 1);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setLoading(true);
    try {
      const p = await coursesAPI.listLessonPlans(courseId);
      setPlans(p);
      setSelectedPlan(p.length > 0 ? p[0] : null);
      if (p.length > 0) setSelectedSessionNumber(p[0].session_number || 1);
    } catch {
      setPlans([]);
      setSelectedPlan(null);
    }
    setLoading(false);
  };

  const handleSessionChange = async (sessionNum: number) => {
    setSelectedSessionNumber(sessionNum);
    const existing = plans.find((p) => p.session_number === sessionNum);
    if (existing) {
      setSelectedPlan(existing);
      return;
    }
    // Fetch or generate plan for this session
    setGenerating(true);
    try {
      const fetched = await coursesAPI.listLessonPlans(selectedCourseId, sessionNum);
      if (fetched.length > 0) {
        setPlans((prev) => {
          const filtered = prev.filter((p) => p.id !== fetched[0].id);
          return [...filtered, fetched[0]].sort((a, b) => a.session_number - b.session_number);
        });
        setSelectedPlan(fetched[0]);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const generatePlan = async () => {
    const cId = selectedCourseId || (courses.length > 0 ? courses[0].id : null);
    if (!cId) return;
    setGenerating(true);
    try {
      const opt = await coursesAPI.optimizeNextClass(cId, selectedSessionNumber);
      const plan = await coursesAPI.generateLessonPlan(cId, {
        ...opt,
        session_number: selectedSessionNumber
      });
      setPlans((prev) => [plan, ...prev.filter((p) => p.id !== plan.id)].sort((a, b) => a.session_number - b.session_number));
      setSelectedPlan(plan);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
          <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius-lg)" }} />
          <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius-lg)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            <FileText size={24} style={{ display: "inline", verticalAlign: "middle", marginRight: 8, color: "var(--accent-blue)" }} />
            Lesson Plans
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
            AI-generated pedagogical plans with polyglot persistence
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {courses.length > 0 && (
            <>
              <select
                value={selectedCourseId}
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

              <select
                value={selectedSessionNumber}
                onChange={(e) => handleSessionChange(Number(e.target.value))}
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
                {Array.from({ length: courses.find(c => c.id === selectedCourseId)?.total_classes || 40 }, (_, idx) => idx + 1).map((sNum) => (
                  <option key={sNum} value={sNum}>
                    Period {sNum}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => exportsAPI.downloadCalendar(selectedCourseId).catch(() => {})}
                className="btn btn-secondary"
                title="Download iCalendar file for Google Calendar / Outlook"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}
              >
                <Calendar size={15} /> Export iCal
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={generatePlan} disabled={generating}>
            {generating ? <><div className="spinner" /> Generating...</> : <><Play size={16} /> Generate Plan</>}
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="glass-card" style={{ padding: 64, textAlign: "center" }}>
          <FileText size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>No Lesson Plans Yet</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Generate a lesson plan for the next scheduled class.</p>
          <button className="btn btn-primary" onClick={generatePlan} disabled={generating}>
            <Play size={16} /> Generate First Plan
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
          {/* Plans List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className="card"
                style={{
                  padding: 14,
                  cursor: "pointer",
                  borderColor: selectedPlan?.id === plan.id ? "var(--brand-start)" : "var(--border-default)",
                  background: selectedPlan?.id === plan.id ? "rgba(99,102,241,0.06)" : "var(--bg-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Period {plan.session_number}</span>
                  <span className={`badge ${plan.status === "approved" ? "badge-success" : plan.status === "draft" ? "badge-warning" : "badge-neutral"}`}>
                    {plan.status}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{plan.topic_title}</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 4 }}>{plan.title}</div>
              </div>
            ))}
          </div>

          {/* Plan Detail */}
          {selectedPlan && (
            <div className="animate-fade-in" key={selectedPlan.id}>
              <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <span className="badge badge-info">Period {selectedPlan.session_number}</span>
                      <span className={`badge ${selectedPlan.status === "approved" ? "badge-success" : "badge-warning"}`}>
                        {selectedPlan.status}
                      </span>
                      {selectedPlan.teacher_overridden && <span className="badge badge-purple">Teacher Modified</span>}
                    </div>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{selectedPlan.title}</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: 4 }}>{selectedPlan.topic_title}</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => exportsAPI.openPrintableLessonPlan(selectedPlan.session_id).catch(() => {})}
                      className="btn btn-secondary"
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}
                    >
                      <Printer size={15} /> Print / Save PDF
                    </button>
                  </div>
                </div>

                {/* Phases */}
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
                    <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                    Period Phases
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedPlan.phases.map((phase: PeriodPhase, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, var(--brand-start)20, transparent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-start)", flexShrink: 0 }}>
                          {phase.duration_minutes}m
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{phase.phase_name}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{phase.activity_description}</div>
                        </div>
                        <span className="badge badge-neutral" style={{ fontSize: "0.625rem" }}>{phase.method_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pedagogical Content */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <ContentSection title="Learning Objectives" icon={<Target size={14} />} items={selectedPlan.learning_objectives} color="var(--accent-blue)" />
                <ContentSection title="Worked Examples" icon={<BookOpen size={14} />} items={selectedPlan.worked_examples} color="var(--accent-emerald)" />
                <ContentSection title="Common Misconceptions" icon={<AlertTriangle size={14} />} items={selectedPlan.misconceptions} color="var(--accent-amber)" />
                <ContentSection title="Assessment Questions" icon={<CheckCircle2 size={14} />} items={selectedPlan.assessment_questions} color="var(--accent-purple)" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContentSection({ title, icon, items, color }: { title: string; icon: React.ReactNode; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color }}>{icon}</span> {title}
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, paddingLeft: 12, borderLeft: `2px solid ${color}30` }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
