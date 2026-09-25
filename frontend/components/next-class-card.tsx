"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Clock, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { ClassSessionItem, NextClassPlan } from "@/lib/types";
import SessionLogModal from "@/components/session-log-modal";

/**
 * "Next Class": the teacher's first view of the day (master plan §18/§33). Finds the
 * next scheduled period, asks the class optimizer what to teach, whether revision is
 * needed and how, and offers the two actions around it: prepare, then record.
 */
export default function NextClassCard({ courseId, firstName }: { courseId: string; firstName: string }) {
  const [session, setSession] = useState<ClassSessionItem | null>(null);
  const [plan, setPlan] = useState<NextClassPlan | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessions = await coursesAPI.listSessions(courseId);
      const upcoming = sessions.filter((s) => s.status === "scheduled");
      const next = upcoming[0] || null;
      setRemaining(upcoming.length);
      setSession(next);
      setPlan(next ? await coursesAPI.optimizeNextClass(courseId, next.session_number) : null);
    } catch {
      setPlan(null);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) return <div className="skeleton" style={{ height: 260, borderRadius: "var(--radius-lg)", marginBottom: 28 }} />;

  if (!session || !plan) {
    return (
      <div className="glass-card" style={{ padding: 24, marginBottom: 28 }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>{greeting}, {firstName}.</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: 6, fontSize: "0.875rem" }}>
          {notice || "No scheduled periods remain for this course."}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card animate-fade-in-up" style={{ padding: 24, marginBottom: 28, borderColor: "rgba(99,102,241,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
            Next class · Period {session.session_number} · {remaining} periods left
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: 6 }}>
            {greeting}, {firstName}. Next up: <span className="gradient-text">{plan.topic_title}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className="badge badge-info"><Clock size={10} /> {plan.period_duration} min</span>
            {plan.revision_needed
              ? <span className="badge badge-warning"><RefreshCw size={10} /> Revise {plan.revision_concept} · {plan.revision_minutes} min</span>
              : <span className="badge badge-success">No revision needed</span>}
            {plan.recommended_methods.slice(0, 2).map((m) => <span key={m} className="badge badge-purple">{m}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Link href={`/lesson-plans?course=${courseId}&session=${session.session_number}`} className="btn btn-primary" style={{ textDecoration: "none" }}>
            <Wand2 size={15} /> Prepare my class
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setLogging(true)}>
            <ClipboardCheck size={15} /> Record this class
          </button>
        </div>
      </div>

      {/* Period timeline: widths proportional to minutes */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }} aria-label="Period plan">
        {plan.phases.map((p, i) => (
          <div key={i} title={`${p.phase_name}: ${p.activity_description}`}
            style={{ flex: p.duration_minutes, minWidth: 0, padding: "10px 12px", borderRadius: "var(--radius-md)",
              background: /revision|recap/i.test(p.phase_name) ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.1)",
              border: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700 }}>{p.duration_minutes}m</div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.phase_name}</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.method_name}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <Sparkles size={15} style={{ color: "var(--accent-purple)", flexShrink: 0, marginTop: 3 }} />
        <span><strong style={{ color: "var(--text-primary)" }}>Why: </strong>{plan.revision_reason || plan.why_explanation}</span>
      </div>
      {notice && <div role="status" style={{ marginTop: 10, fontSize: "0.8125rem", color: "#34d399" }}>{notice}</div>}

      {logging && (
        <SessionLogModal
          courseId={courseId}
          sessionNumber={session.session_number}
          topicTitle={plan.topic_title}
          periodMinutes={plan.period_duration}
          onClose={() => setLogging(false)}
          onLogged={(r) => {
            setLogging(false);
            setNotice(`Period ${r.session_number} recorded${r.topic_status ? ` · ${r.topic_title} is now ${r.topic_status.replace("_", " ")}` : ""}. Tomorrow's recommendation has been updated.`);
            load();
          }}
        />
      )}
    </div>
  );
}
