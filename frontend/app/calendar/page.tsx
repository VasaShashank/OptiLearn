"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Download, FileText, Presentation } from "lucide-react";
import { coursesAPI, exportsAPI } from "@/lib/api";
import type { ClassSessionItem, Course } from "@/lib/types";
import SessionLogModal from "@/components/session-log-modal";

const STATUS_STYLE: Record<string, { badge: string; tint: string; label: string }> = {
  completed: { badge: "badge-success", tint: "var(--tick-wash)", label: "Taught" },
  scheduled: { badge: "badge-info", tint: "var(--ink-wash)", label: "Scheduled" },
  in_progress: { badge: "badge-warning", tint: "var(--caution-wash)", label: "In progress" },
  cancelled: { badge: "badge-neutral", tint: "transparent", label: "Cancelled" },
};

export default function CalendarPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [sessions, setSessions] = useState<ClassSessionItem[]>([]);
  const [selected, setSelected] = useState<ClassSessionItem | null>(null);
  const [logging, setLogging] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      if (c.length) setCourseId(c[0].id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const s = await coursesAPI.listSessions(courseId);
      setSessions(s);
      setSelected((prev) => s.find((x) => x.session_number === prev?.session_number) || s.find((x) => x.status === "scheduled") || s[0] || null);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const course = courses.find((c) => c.id === courseId);
  const counts = useMemo(() => sessions.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {}), [sessions]);
  const nextScheduled = sessions.find((s) => s.status === "scheduled")?.session_number;

  // Group consecutive periods by unit for a readable timeline
  const groups = useMemo(() => {
    const out: { unit: number | null; items: ClassSessionItem[] }[] = [];
    for (const s of sessions) {
      const last = out[out.length - 1];
      if (last && last.unit === s.unit_number) last.items.push(s);
      else out.push({ unit: s.unit_number, items: [s] });
    }
    return out;
  }, [sessions]);

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>Calendar</h1>
          <p>Every period of the course: what it covers, whether its plan is reviewed, and what was actually taught.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {courses.length > 0 && (
            <select className="select" aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.title}</option>)}
            </select>
          )}
          {courseId && (
            <button type="button" className="btn btn-secondary" onClick={() => exportsAPI.downloadCalendar(courseId).catch(() => {})}>
              <Download size={14} /> Add to my calendar app
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(STATUS_STYLE).filter(([k]) => counts[k]).map(([k, v]) => (
          <span key={k} className={`badge ${v.badge}`}>{v.label}: {counts[k]}</span>
        ))}
        {course && <span className="badge badge-neutral">{course.period_duration} min periods</span>}
      </div>

      {loading ? <div className="skeleton" style={{ height: 420, borderRadius: "var(--radius-lg)" }} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {groups.map((g, gi) => (
              <div key={gi}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
                  {g.unit ? `Unit ${g.unit}` : "No unit"}: {g.items[0].topic_title || "No topic"}{g.items.length > 1 && g.items[g.items.length - 1].topic_title !== g.items[0].topic_title ? " …" : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                  {g.items.map((s) => {
                    const st = STATUS_STYLE[s.status] || STATUS_STYLE.scheduled;
                    const isSelected = selected?.session_number === s.session_number;
                    return (
                      <button key={s.id} type="button" onClick={() => setSelected(s)} className="card"
                        aria-pressed={isSelected}
                        style={{ padding: 10, textAlign: "left", color: "inherit", cursor: "pointer", background: st.tint,
                          borderColor: isSelected ? "var(--brand-start)" : s.session_number === nextScheduled ? "var(--ink)" : undefined }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>P{s.session_number}</span>
                          {s.status === "completed" ? <CheckCircle2 size={13} style={{ color: "var(--tick)" }} aria-label="taught" />
                            : s.session_number === nextScheduled ? <span className="badge badge-purple" style={{ fontSize: "0.8rem" }}>next</span> : null}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.topic_title || "—"}
                        </div>
                        {s.lesson_plan_status && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>Plan {PLAN_LABEL[s.lesson_plan_status] || s.lesson_plan_status}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="glass-card" style={{ padding: 20, position: "sticky", top: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Period {selected.session_number}</h2>
                <span className={`badge ${(STATUS_STYLE[selected.status] || STATUS_STYLE.scheduled).badge}`}>{(STATUS_STYLE[selected.status] || STATUS_STYLE.scheduled).label}</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "6px 0 14px" }}>
                {selected.unit_number ? `Unit ${selected.unit_number}: ` : ""}{selected.topic_title || "No topic assigned"}
              </p>
              <Row label="Length" value={`${selected.duration_minutes} min`} />
              <Row label="Date" value={selected.scheduled_date ? new Date(selected.scheduled_date).toLocaleDateString() : "Not dated"} />
              <Row label="Lesson plan" value={selected.lesson_plan_status ? `${PLAN_LABEL[selected.lesson_plan_status] || selected.lesson_plan_status}, version ${selected.lesson_plan_version}` : "Not prepared"} />

              {selected.logged && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-default)" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>What was taught</div>
                  <Row label="Method" value={selected.logged.method_name || "—"} />
                  <Row label="Minutes" value={String(selected.logged.actual_minutes)} />
                  <Row label="Engagement" value={`${selected.logged.student_engagement_rating} / 5`} />
                  <Row label="Covered" value={`${Math.round(selected.logged.completion_rate * 100)}%`} />
                  {selected.logged.teacher_notes && <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>{selected.logged.teacher_notes}</p>}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                <Link href={`/lesson-plans?course=${courseId}&session=${selected.session_number}`} className="btn btn-secondary" style={{ textDecoration: "none", justifyContent: "center" }}>
                  <FileText size={14} /> {selected.lesson_plan_status ? "Open lesson plan" : "Prepare lesson plan"}
                </Link>
                {selected.status === "scheduled" && (
                  <Link href={`/present?course=${courseId}&session=${selected.session_number}`} className="btn btn-primary" style={{ justifyContent: "center" }}>
                    <Presentation size={14} /> Start class
                  </Link>
                )}
                {selected.status === "scheduled" && (
                  <button type="button" className="btn btn-secondary" style={{ justifyContent: "center" }} onClick={() => setLogging(true)}>
                    <ClipboardCheck size={14} /> Record this class
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {logging && selected && course && (
        <SessionLogModal
          courseId={courseId}
          sessionNumber={selected.session_number}
          topicTitle={selected.topic_title}
          periodMinutes={course.period_duration}
          onClose={() => setLogging(false)}
          onLogged={() => { setLogging(false); load(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", padding: "4px 0" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const PLAN_LABEL: Record<string, string> = {
  draft: "needs review",
  modified: "edited",
  approved: "approved",
  rejected: "rejected",
  completed: "taught",
};
