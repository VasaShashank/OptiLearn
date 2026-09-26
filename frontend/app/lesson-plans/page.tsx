"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Presentation, Printer } from "lucide-react";
import { coursesAPI, exportsAPI } from "@/lib/api";
import type { Course, LessonPlan, PeriodPhase } from "@/lib/types";
import PlanReview from "@/components/plan-review";
import PeriodStrip from "@/components/period-strip";

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
        const params = new URLSearchParams(window.location.search);
        const course = c.find((x) => x.id === params.get("course")) || c[0];
        const wantedSession = Number(params.get("session")) || null;
        if (course) {
          setSelectedCourseId(course.id);
          const p = await coursesAPI.listLessonPlans(course.id);
          if (wantedSession) {
            // Fetch (or generate) the requested period's plan
            const [target] = await coursesAPI.listLessonPlans(course.id, wantedSession);
            const merged = target ? [...p.filter((x) => x.id !== target.id), target].sort((a, b) => a.session_number - b.session_number) : p;
            setPlans(merged);
            setSelectedPlan(target || merged[0] || null);
            setSelectedSessionNumber(wantedSession);
          } else {
            setPlans(p);
            if (p.length > 0) {
              setSelectedPlan(p[0]);
              setSelectedSessionNumber(p[0].session_number || 1);
            }
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

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;

  const course = courses.find((c) => c.id === selectedCourseId);
  const hasSelectedPeriod = plans.some((p) => p.session_number === selectedSessionNumber);

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>Lesson plans</h1>
          <p>
            One plan per period: what to teach, how, and for how long. Read each plan and approve it, or edit the
            timings to suit your class.
          </p>
        </div>
        {courses.length > 0 && (
          <button
            type="button"
            onClick={() => exportsAPI.downloadCalendar(selectedCourseId).catch(() => {})}
            className="btn btn-ghost"
            title="Downloads an .ics file you can import into Google Calendar or Outlook"
          >
            <Calendar size={15} /> Add periods to my calendar app
          </button>
        )}
      </header>

      {courses.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <label className="field" style={{ marginTop: 0 }}>
            Course
            <select value={selectedCourseId} onChange={(e) => handleCourseChange(e.target.value)} className="input-select">
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code}: {c.title}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginTop: 0 }}>
            Period
            <select value={selectedSessionNumber} onChange={(e) => handleSessionChange(Number(e.target.value))} className="input-select">
              {Array.from({ length: course?.total_classes || 40 }, (_, idx) => idx + 1).map((n) => (
                <option key={n} value={n}>
                  Period {n}{plans.some((p) => p.session_number === n) ? "" : " (no plan yet)"}
                </option>
              ))}
            </select>
          </label>
          {!hasSelectedPeriod && (
            <button className="btn btn-primary" onClick={generatePlan} disabled={generating}>
              {generating ? <><div className="spinner" /> Writing the plan…</> : `Make a plan for period ${selectedSessionNumber}`}
            </button>
          )}
        </div>
      )}

      {courses.length === 0 ? (
        <p>There are no courses yet. <Link href="/courses">Create a course</Link> first.</p>
      ) : plans.length === 0 ? (
        <div style={{ maxWidth: 560 }}>
          <p style={{ marginBottom: 12 }}>
            This course has no lesson plans yet. Pick a period above and make its plan: OptiTeach picks the topic
            from the time plan, adds revision if the class needs it, and splits the period into steps.
          </p>
        </div>
      ) : (
        <div className="lesson-plans">
          <nav aria-label="Lesson plans" className="lesson-plans__list">
            {plans.map((plan) => {
              const selected = selectedPlan?.id === plan.id;
              return (
                <button
                  type="button"
                  key={plan.id}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    setSelectedPlan(plan);
                    setSelectedSessionNumber(plan.session_number);
                  }}
                  className={`lesson-plans__item${selected ? " lesson-plans__item--selected" : ""}`}
                >
                  <span className="lesson-plans__period">Period {plan.session_number}</span>
                  <span className="lesson-plans__topic">{plan.topic_title}</span>
                  <span className={`badge ${STATUS[plan.status]?.badge || "badge-neutral"}`}>{STATUS[plan.status]?.label || plan.status}</span>
                </button>
              );
            })}
          </nav>

          {selectedPlan && (
            <article className="animate-fade-in" key={selectedPlan.id} style={{ minWidth: 0 }}>
              <section className="card" style={{ padding: 22, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <p style={{ color: "var(--pencil)" }}>
                      Period {selectedPlan.session_number}.{" "}
                      {STATUS[selectedPlan.status]?.sentence || ""}
                      {selectedPlan.teacher_overridden ? " You have edited it." : ""}
                    </p>
                    <h2 style={{ fontSize: "1.3rem", marginTop: 2 }}>{selectedPlan.topic_title}</h2>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link href={`/present?course=${selectedCourseId}&session=${selectedPlan.session_number}`} className="btn btn-primary">
                      <Presentation size={15} /> Start class
                    </Link>
                    <button
                      type="button"
                      onClick={() => exportsAPI.openPrintableLessonPlan(selectedPlan.session_id).catch(() => {})}
                      className="btn btn-secondary"
                    >
                      <Printer size={15} /> Print
                    </button>
                  </div>
                </div>

                <PeriodStrip phases={selectedPlan.phases} />
                <ol style={{ margin: "14px 0 18px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedPlan.phases.map((p: PeriodPhase, i: number) => (
                    <li key={i}>
                      <strong>{p.phase_name}</strong>, {p.duration_minutes} min, {p.method_name.toLowerCase()}.{" "}
                      <span style={{ color: "var(--pencil)" }}>{p.activity_description}</span>
                    </li>
                  ))}
                </ol>

                <PlanReview
                  courseId={selectedCourseId}
                  plan={selectedPlan}
                  onUpdated={(updated) => {
                    setSelectedPlan(updated);
                    setPlans((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  }}
                />
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <ContentSection title="By the end, students can" items={selectedPlan.learning_objectives} />
                <ContentSection title="Examples to work through" items={selectedPlan.worked_examples} />
                <ContentSection title="Mistakes to watch for" items={selectedPlan.misconceptions} />
                <ContentSection title="Questions to check understanding" items={selectedPlan.assessment_questions} />
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, { label: string; badge: string; sentence: string }> = {
  draft: { label: "Needs review", badge: "badge-warning", sentence: "Suggested by OptiTeach and waiting for your review." },
  modified: { label: "Edited", badge: "badge-info", sentence: "Edited and waiting for approval." },
  approved: { label: "Approved", badge: "badge-success", sentence: "Approved." },
  rejected: { label: "Rejected", badge: "badge-danger", sentence: "Rejected. Edit it or make a new plan." },
  completed: { label: "Taught", badge: "badge-neutral", sentence: "Already taught." },
};

function ContentSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card" style={{ padding: 18 }}>
      <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
