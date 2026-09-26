"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import PeriodStrip from "@/components/period-strip";
import type { Course, CourseOptimization, NextClassPlan, TopicAllocation } from "@/lib/types";

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function TimePlanPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [plan, setPlan] = useState<CourseOptimization | null>(null);
  const [nextClass, setNextClass] = useState<NextClassPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      const wanted = new URLSearchParams(window.location.search).get("course");
      const start = c.find((x) => x.id === wanted) || c[0];
      if (start) {
        setSelectedCourse(start.id);
        return coursesAPI.getOptimization(start.id).then(setPlan);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const changeCourse = async (courseId: string) => {
    setSelectedCourse(courseId);
    setPlan(null);
    setNextClass(null);
    setError(null);
    try {
      setPlan(await coursesAPI.getOptimization(courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The time plan couldn't be loaded");
    }
  };

  const rebuild = async () => {
    if (!selectedCourse) return;
    setRebuilding(true);
    setError(null);
    try {
      setPlan(await coursesAPI.optimize(selectedCourse));
      setNextClass(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The time plan couldn't be rebuilt");
    }
    setRebuilding(false);
  };

  const previewNextClass = async () => {
    if (!selectedCourse) return;
    setPreviewing(true);
    setError(null);
    try {
      setNextClass(await coursesAPI.optimizeNextClass(selectedCourse));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The next class couldn't be planned");
    }
    setPreviewing(false);
  };

  if (loading) return <div className="skeleton" style={{ height: 320 }} />;

  const course = courses.find((c) => c.id === selectedCourse);

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>Time plan</h1>
          <p>
            How the semester&apos;s minutes are shared between topics, revision and tests. Rebuild it after you
            change the syllabus or record a few classes.
          </p>
        </div>
        {courses.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              aria-label="Course"
              value={selectedCourse}
              onChange={(e) => changeCourse(e.target.value)}
              className="input-select"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code}: {c.title}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={rebuild} disabled={rebuilding}>
              {rebuilding ? <><div className="spinner" /> Rebuilding…</> : <><RefreshCw size={16} /> Rebuild plan</>}
            </button>
          </div>
        )}
      </header>

      {error && <p role="alert" style={{ color: "var(--redpen)", fontWeight: 600, marginBottom: 16 }}>{error}</p>}

      {courses.length === 0 && (
        <p>
          There are no courses yet. <Link href="/courses">Create a course</Link> and import its syllabus first.
        </p>
      )}

      {plan && plan.topic_allocations.length === 0 && (
        <p>
          This course has no topics yet, so there is nothing to plan.{" "}
          <Link href={`/upload?courseId=${selectedCourse}`}>Import its syllabus</Link>.
        </p>
      )}

      {plan && plan.topic_allocations.length > 0 && (
        <>
          <Budget plan={plan} course={course} />

          <section className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule)" }}>
              <h2 style={{ fontSize: "1.1rem" }}>Topics by unit</h2>
              <p style={{ color: "var(--pencil)", marginTop: 2 }}>
                Topics shown in red get less time than their syllabus estimate.
              </p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Topic</th>
                    <th scope="col" style={{ textAlign: "right" }}>Periods</th>
                    <th scope="col" style={{ textAlign: "right" }}>Minutes</th>
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.topic_allocations].sort((a, b) => a.unit_number - b.unit_number).map((a) => <TopicRow key={a.topic_id} a={a} />)}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem" }}>Next class</h2>
                <p style={{ color: "var(--pencil)", marginTop: 2 }}>
                  What the next period would cover, including any revision the class needs first.
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={previewNextClass} disabled={previewing}>
                {previewing ? <><div className="spinner" /> Planning…</> : nextClass ? "Plan it again" : "Plan the next class"}
              </button>
            </div>
            {nextClass && <NextClass plan={nextClass} />}
          </section>

          <details style={{ color: "var(--pencil)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>How this plan is worked out</summary>
            <div style={{ marginTop: 10, maxWidth: "75ch", display: "flex", flexDirection: "column", gap: 8 }}>
              <p>
                Each topic gets a priority from how important and hard its concepts are, how many later topics
                depend on it, its exam weight and how students did on it. Revision and test time are set aside first.
                Then every topic gets the periods its syllabus estimate asks for; any periods left over go to the
                highest-priority topics, and if there aren&apos;t enough, the lowest-priority topics are cut first.
              </p>
              {plan.formula_explanation?.model && <p>Method used: {String(plan.formula_explanation.model)}</p>}
              {plan.formula_explanation?.invariant && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{String(plan.formula_explanation.invariant)}</p>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Budget({ plan, course }: { plan: CourseOptimization; course?: Course }) {
  const total = plan.total_available_minutes || 1;
  const parts = [
    { label: "Teaching topics", minutes: plan.total_allocated_minutes, color: "var(--ink)" },
    { label: "Revision", minutes: plan.revision_budget_minutes, color: "var(--highlighter)" },
    { label: "Tests", minutes: plan.assessment_budget_minutes, color: "var(--caution)" },
    { label: "Spare", minutes: plan.unallocated_buffer_minutes, color: "var(--rule-strong)" },
  ];
  const used = plan.total_allocated_minutes + plan.revision_budget_minutes + plan.assessment_budget_minutes;
  const status =
    plan.time_pressure_status === "high_pressure"
      ? { text: `Over by ${fmt(used - total)} minutes. Remove or shorten topics, or add periods to the course.`, color: "var(--redpen)" }
      : plan.time_pressure_status === "balanced"
        ? { text: `It fits, but only just: ${fmt(plan.unallocated_buffer_minutes)} minutes spare.`, color: "var(--caution)" }
        : { text: `Everything fits, with ${fmt(plan.unallocated_buffer_minutes)} minutes spare.`, color: "var(--tick)" };

  return (
    <section className="card" style={{ padding: 20, marginBottom: 24 }}>
      <p style={{ fontSize: "1.05rem" }}>
        {course ? `${course.total_classes} periods of ${course.period_duration} minutes gives ` : ""}
        <strong>{fmt(plan.total_available_minutes)} minutes</strong> this semester.{" "}
        <strong style={{ color: status.color }}>{status.text}</strong>
      </p>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${fmt(p.minutes)} minutes`).join(", ")}
        style={{ display: "flex", height: 18, borderRadius: "var(--radius-sm)", overflow: "hidden", margin: "14px 0 10px", background: "var(--surface-sunk)" }}
      >
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.minutes / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 20, flexWrap: "wrap" }}>
        {parts.map((p) => (
          <li key={p.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            {p.label} <strong>{fmt(p.minutes)} min</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicRow({ a }: { a: TopicAllocation }) {
  const short = a.allocated_minutes < a.estimated_minutes;
  return (
    <tr>
      <td>{a.unit_number}</td>
      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{a.topic_title}</td>
      <td style={{ textAlign: "right" }}>{a.recommended_periods}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap", color: short ? "var(--redpen)" : undefined }}>
        <strong>{a.allocated_minutes}</strong>
        <span style={{ color: short ? undefined : "var(--pencil)" }}> of {a.estimated_minutes} needed</span>
      </td>
      <td style={{ color: "var(--pencil)", minWidth: 260 }}>{a.explanation}</td>
    </tr>
  );
}

function NextClass({ plan }: { plan: NextClassPlan }) {
  return (
    <div className="card animate-fade-in" style={{ padding: 20 }}>
      <p style={{ color: "var(--pencil)" }}>Period {plan.session_number}, unit {plan.unit_number}, {plan.period_duration} minutes</p>
      <h3 style={{ fontSize: "1.25rem", margin: "2px 0 12px" }}>{plan.topic_title}</h3>

      {plan.revision_needed && plan.revision_concept && (
        <p style={{ padding: "10px 14px", background: "var(--caution-wash)", borderLeft: "4px solid var(--caution)", borderRadius: "var(--radius-sm)", marginBottom: 14 }}>
          <strong>Revise {plan.revision_concept} first ({plan.revision_minutes} min).</strong>
        </p>
      )}

      <PeriodStrip phases={plan.phases} />

      <ol style={{ margin: "14px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.phases.map((p, i) => (
          <li key={i}>
            <strong>{p.phase_name}</strong>, {p.duration_minutes} min, {p.method_name.toLowerCase()}.{" "}
            <span style={{ color: "var(--pencil)" }}>{p.activity_description}</span>
          </li>
        ))}
      </ol>

      <p style={{ color: "var(--pencil)", marginTop: 14 }}>{plan.why_explanation}</p>
      {plan.target_concepts.length > 0 && (
        <p style={{ marginTop: 8 }}><strong>Concepts:</strong> {plan.target_concepts.join(", ")}</p>
      )}
    </div>
  );
}
