"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { coursesAPI } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { Course, CourseAnalytics } from "@/lib/types";
import NextClassCard from "@/components/next-class-card";

export default function TodayPage() {
  const { user } = useSession();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [courseId, setCourseId] = useState("");
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      if (c.length) setCourseId(c[0].id);
    }).catch(() => setCourses([]));
  }, []);

  const loadAnalytics = useCallback(() => {
    if (courseId) coursesAPI.getAnalytics(courseId).then(setAnalytics).catch(() => setAnalytics(null));
  }, [courseId]);
  useEffect(loadAnalytics, [loadAnalytics]);

  const course = courses?.find((c) => c.id === courseId);
  const firstName = (user?.full_name || "").replace(/^(Prof|Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (courses === null) {
    return <div className="skeleton" style={{ height: 320 }} />;
  }

  if (courses.length === 0) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: "1.75rem" }}>{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
        <p style={{ color: "var(--pencil)", margin: "8px 0 20px" }}>
          You don&apos;t have a course yet. Import your syllabus and OptiTeach will lay out the topics and plan each class.
        </p>
        <Link href="/upload" className="btn btn-primary">Import a syllabus</Link>
      </div>
    );
  }

  const attention = analytics?.alerts.filter((a) => a.severity === "danger" || a.severity === "warning") || [];

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
          <p>{course ? `${course.code} ${course.title}` : ""}</p>
        </div>
        {courses.length > 1 && (
          <select className="select" aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
          </select>
        )}
      </header>

      <NextClassCard key={courseId} courseId={courseId} onRecorded={loadAnalytics} />

      <div className="today-grid">
        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="section-title">Needs attention</h2>
          {!analytics ? <div className="skeleton" style={{ height: 120 }} /> : attention.length === 0 ? (
            <p style={{ color: "var(--pencil)" }}>Nothing is holding the class back right now.</p>
          ) : (
            <ul className="attention-list">
              {attention.map((a) => (
                <li key={a.id} className={a.severity === "danger" ? "is-urgent" : ""}>
                  <strong>{a.title}</strong>
                  <p>{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="progress-title">
          <h2 id="progress-title" className="section-title">How the course is going</h2>
          {!analytics ? <div className="skeleton" style={{ height: 120 }} /> : (
            <div className="card" style={{ padding: 20 }}>
              <Meter label="Periods taught" value={analytics.completed_sessions} of={analytics.total_sessions} />
              <Meter label="Teaching minutes used" value={analytics.actual_minutes_taught} of={analytics.planned_minutes} />
              <dl className="health-row">
                <div><dt>Strong</dt><dd style={{ color: "var(--tick)" }}>{analytics.concept_health.strong}</dd></div>
                <div><dt>On track</dt><dd>{analytics.concept_health.moderate}</dd></div>
                <div><dt>Weak</dt><dd style={{ color: "var(--caution)" }}>{analytics.concept_health.weak}</dd></div>
                <div><dt>Holding others back</dt><dd style={{ color: "var(--redpen)" }}>{analytics.concept_health.bottleneck}</dd></div>
              </dl>
              <p style={{ fontSize: "0.85rem", color: "var(--pencil)", marginTop: 12 }}>
                Concepts, by how students scored on them. <Link href={`/courses/${courseId}`}>See the course</Link>
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Meter({ label, value, of }: { label: string; value: number; of: number }) {
  const pct = of ? Math.round((value / of) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: "var(--pencil)" }}>{value.toLocaleString()} of {of.toLocaleString()}</span>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
