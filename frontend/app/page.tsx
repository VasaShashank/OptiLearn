"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Layers,
  Lightbulb,
  Zap,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Upload,
  BarChart3,
  Database,
  Activity,
  FileText,
} from "lucide-react";
import { coursesAPI, healthAPI } from "@/lib/api";
import type { Course, CourseAnalytics, AlertItem } from "@/lib/types";
import { useSession } from "@/lib/auth";
import NextClassCard from "@/components/next-class-card";

export default function DashboardHome() {
  const { user } = useSession();
  const [activeCourseId, setActiveCourseId] = useState<string>("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [c, h] = await Promise.all([coursesAPI.list(), healthAPI.check()]);
        setCourses(c);
        setHealth(h);
        if (c.length > 0) {
          setActiveCourseId(c[0].id);
          const a = await coursesAPI.getAnalytics(c[0].id);
          setAnalytics(a);
        }
      } catch {
        // API may not be running
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCourseChange = async (id: string) => {
    setActiveCourseId(id);
    try {
      const a = await coursesAPI.getAnalytics(id);
      setAnalytics(a);
    } catch {
      setAnalytics(null);
    }
  };

  const activeCourse = courses.find((c) => c.id === activeCourseId) || courses[0];
  const isHealthy = health?.status === "healthy";

  const totalTopics = courses.reduce((s, c) => s + (c.topics_count || 0), 0);
  const totalConcepts = courses.reduce((s, c) => s + (c.concepts_count || 0), 0);
  const totalMinutes = courses.reduce((s, c) => s + (c.total_available_minutes || 0), 0);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <div className="skeleton" style={{ width: 280, height: 36, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 420, height: 20 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: "var(--radius-lg)" }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 300, borderRadius: "var(--radius-lg)" }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1
            style={{ fontSize: "1.875rem", fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 6 }}
            className="gradient-text"
          >
            OptiTeach Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
            Multi-Subject Intelligent Course Teaching & Optimization Platform
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/upload" className="btn btn-secondary" style={{ textDecoration: "none", fontSize: "0.8125rem" }}>
            <Upload size={14} /> Add Subject
          </Link>
          <span
            className={`badge ${isHealthy ? "badge-success" : "badge-danger"}`}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: isHealthy ? "#34d399" : "#fb7185",
                display: "inline-block",
              }}
            />
            {isHealthy ? "System Healthy" : "Backend Offline"}
          </span>
        </div>
      </div>

      {activeCourseId && (
        <NextClassCard key={activeCourseId} courseId={activeCourseId} firstName={(user?.full_name || "").replace(/^(Prof|Dr|Mr|Ms|Mrs)\.?\s+/i, "").split(" ")[0] || "there"} />
      )}

      {/* Stats Grid - Aggregate across all courses */}
      <div
        className="animate-fade-in-up"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 28 }}
      >
        <StatCard
          icon={<BookOpen size={22} />}
          label="Active Courses"
          value={courses.length.toString()}
          sub={courses.length === 1 ? courses[0].code : `${courses.length} subjects enrolled`}
          color="blue"
        />
        <StatCard
          icon={<Layers size={22} />}
          label="Total Topics"
          value={totalTopics.toString()}
          sub={`Across ${courses.length} courses`}
          color="purple"
        />
        <StatCard
          icon={<Lightbulb size={22} />}
          label="Concepts Mapped"
          value={totalConcepts.toString()}
          sub="Prerequisite graphs"
          color="amber"
        />
        <StatCard
          icon={<Clock size={22} />}
          label="Total Teaching Time"
          value={`${totalMinutes}m`}
          sub={`${(totalMinutes / 60).toFixed(1)} hrs planned`}
          color="emerald"
        />
      </div>

      {/* Course Switcher Pills (when teacher has multiple courses) */}
      {courses.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Select Subject:
          </span>
          {courses.map((c) => {
            const isSelected = activeCourse?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => handleCourseChange(c.id)}
                className={`badge ${isSelected ? "badge-info" : "badge-neutral"}`}
                style={{
                  padding: "7px 16px",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected ? "1px solid var(--accent-blue)" : "1px solid var(--border-subtle)",
                  background: isSelected ? "rgba(59,130,246,0.18)" : "var(--bg-card)",
                }}
              >
                {c.code} — {c.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        {/* Active Course Card */}
        <div className="animate-fade-in-up stagger-2">
          {activeCourse ? (
            <div className="glass-card" style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    Active Course
                  </div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {activeCourse.code} — {activeCourse.title}
                  </h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: 4 }}>
                    {activeCourse.semester} · {activeCourse.teacher_name || "Faculty"}
                  </p>
                </div>
                <Link href={`/courses/${activeCourse.id}`} className="btn btn-primary" style={{ textDecoration: "none" }}>
                  View Details <ArrowRight size={16} />
                </Link>
              </div>

              {/* Progress Bar */}
              {analytics && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Course Progress</span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--accent-emerald)" }}>
                      {analytics.progress_percentage}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${analytics.progress_percentage}%`,
                        background: "linear-gradient(90deg, var(--brand-start), var(--accent-emerald))",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
                    <MiniStat label="Completed" value={`${analytics.completed_sessions}/${analytics.total_sessions}`} />
                    <MiniStat label="Time Taught" value={`${analytics.actual_minutes_taught}m`} />
                    <MiniStat label="Remaining" value={`${analytics.remaining_minutes}m`} />
                  </div>
                </div>
              )}

              {/* Concept Health */}
              {analytics && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Concept Health Distribution
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <HealthBadge label="Strong" count={analytics.concept_health.strong} color="#34d399" />
                    <HealthBadge label="Moderate" count={analytics.concept_health.moderate} color="#fbbf24" />
                    <HealthBadge label="Weak" count={analytics.concept_health.weak} color="#fb7185" />
                    <HealthBadge label="Bottleneck" count={analytics.concept_health.bottleneck} color="#f43f5e" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
              <BookOpen size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>No Courses Yet</h3>
              <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
                Upload a syllabus or create a course to get started.
              </p>
              <Link href="/upload" className="btn btn-primary" style={{ textDecoration: "none" }}>
                <Upload size={16} /> Upload Syllabus
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Alerts + Quick Actions */}
        <div className="animate-fade-in-up stagger-3" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Alerts */}
          {analytics && analytics.alerts.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                <Activity size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                Intelligent Alerts
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {analytics.alerts.map((alert: AlertItem) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
              Quick Actions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <QuickAction href="/upload" icon={<Upload size={18} />} label="Upload Syllabus" desc="Extract curriculum" />
              <QuickAction href="/optimization" icon={<Zap size={18} />} label="Run Optimizer" desc="Allocate time" />
              <QuickAction href="/lesson-plans" icon={<FileText size={18} />} label="Lesson Plans" desc="View/Generate" />
              <QuickAction href="/dbms" icon={<Database size={18} />} label="DBMS Showcase" desc="Schema & Queries" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "var(--accent-blue)",
    purple: "var(--accent-purple)",
    amber: "var(--accent-amber)",
    emerald: "var(--accent-emerald)",
    rose: "var(--accent-rose)",
    cyan: "var(--accent-cyan)",
  };
  return (
    <div className={`card stat-glow-${color}`} style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ color: colorMap[color] || "var(--text-muted)" }}>{icon}</div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function HealthBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: "var(--radius-full)",
      background: `${color}12`, border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color }}>{count}</span>
      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const iconMap: Record<string, React.ReactNode> = {
    danger: <AlertTriangle size={16} style={{ color: "#fb7185" }} />,
    warning: <AlertTriangle size={16} style={{ color: "#fbbf24" }} />,
    info: <TrendingUp size={16} style={{ color: "#60a5fa" }} />,
    success: <CheckCircle2 size={16} style={{ color: "#34d399" }} />,
  };
  const bgMap: Record<string, string> = {
    danger: "rgba(244,63,94,0.06)",
    warning: "rgba(245,158,11,0.06)",
    info: "rgba(59,130,246,0.06)",
    success: "rgba(16,185,129,0.06)",
  };
  return (
    <div style={{
      padding: 12, borderRadius: "var(--radius-md)", background: bgMap[alert.severity] || bgMap.info,
      border: `1px solid ${alert.severity === "danger" ? "rgba(244,63,94,0.15)" : alert.severity === "warning" ? "rgba(245,158,11,0.15)" : alert.severity === "success" ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {iconMap[alert.severity]}
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{alert.title}</span>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{alert.message}</p>
    </div>
  );
}

function QuickAction({ href, icon, label, desc }: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
      borderRadius: "var(--radius-md)", textDecoration: "none", color: "inherit",
      transition: "all var(--transition-fast)", background: "transparent",
      border: "1px solid transparent",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.06)"; e.currentTarget.style.borderColor = "var(--border-hover)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
    >
      <div style={{ color: "var(--brand-start)" }}>{icon}</div>
      <div>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{desc}</div>
      </div>
      <ArrowRight size={14} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
    </Link>
  );
}
