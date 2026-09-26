"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, Presentation } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { ClassSessionItem, NextClassPlan } from "@/lib/types";
import SessionLogModal from "@/components/session-log-modal";
import PeriodStrip from "@/components/period-strip";

/**
 * The next scheduled period: what to teach, the planned period drawn to scale, why the
 * plan looks the way it does, and the actions around it (prepare, then record).
 */
export default function NextClassCard({ courseId, onRecorded }: { courseId: string; onRecorded?: () => void }) {
  const [session, setSession] = useState<ClassSessionItem | null>(null);
  const [plan, setPlan] = useState<NextClassPlan | null>(null);
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessions = await coursesAPI.listSessions(courseId);
      const next = sessions.find((s) => s.status === "scheduled") || null;
      setSession(next);
      setPlan(next ? await coursesAPI.optimizeNextClass(courseId, next.session_number) : null);
    } catch {
      setPlan(null);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="skeleton" style={{ height: 250 }} />;

  if (!session || !plan) {
    return (
      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: "1.25rem" }}>{notice || "Every period of this course has been taught."}</h2>
        <p style={{ color: "var(--pencil)", marginTop: 6 }}>Review how it went on the calendar.</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 24, borderColor: "var(--rule-strong)" }} aria-labelledby="next-class-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="badge badge-now">Next</span>
            <span style={{ color: "var(--pencil)", fontWeight: 600 }}>Period {session.session_number}</span>
          </div>
          <h2 id="next-class-title" style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 8, maxWidth: "36ch" }}>
            {plan.topic_title}
          </h2>
          <p style={{ color: "var(--pencil)", marginTop: 4 }}>
            {plan.period_duration} minutes
            {plan.revision_needed
              ? `, starting with ${plan.revision_minutes} minutes of revision on ${plan.revision_concept}`
              : ", no revision needed first"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/present?course=${courseId}&session=${session.session_number}`} className="btn btn-primary">
            <Presentation size={16} /> Start class
          </Link>
          <Link href={`/lesson-plans?course=${courseId}&session=${session.session_number}`} className="btn btn-secondary">
            <FileText size={16} /> Lesson plan
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setLogging(true)}>
            <ClipboardCheck size={16} /> Record this class
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <PeriodStrip phases={plan.phases} label={`Plan for period ${session.session_number}`} />
      </div>

      <p style={{ marginTop: 16, maxWidth: "75ch", lineHeight: 1.6 }}>
        <strong>Why this plan: </strong>
        <span style={{ color: "var(--pencil)" }}>{plan.revision_reason || plan.why_explanation}</span>
      </p>
      {notice && <p role="status" style={{ marginTop: 10, color: "var(--tick)", fontWeight: 600 }}>{notice}</p>}

      {logging && (
        <SessionLogModal
          courseId={courseId}
          sessionNumber={session.session_number}
          topicTitle={plan.topic_title}
          periodMinutes={plan.period_duration}
          onClose={() => setLogging(false)}
          onLogged={(r) => {
            setLogging(false);
            setNotice(`Recorded period ${r.session_number}. The next class below is already updated.`);
            load();
            onRecorded?.();
          }}
        />
      )}
    </section>
  );
}
