"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen, Layers, Lightbulb, Clock, Zap, FileText, BarChart3,
  CheckCircle2, AlertTriangle, TrendingUp, Calendar, Users, ArrowRight,
  Target, Activity, GitBranch, Upload,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import CurriculumGraphView from "@/components/curriculum-graph-view";
import AssessmentResults from "@/components/assessment-results";
import CoursePeople from "@/components/course-people";
import type {
  Course, CurriculumGraph, CourseOptimization, CourseAnalytics,
  AssessmentItem, GraphNode,
} from "@/lib/types";

type Tab = "overview" | "curriculum" | "optimization" | "assessments" | "analytics" | "people";

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [graph, setGraph] = useState<CurriculumGraph | null>(null);
  const [optimization, setOptimization] = useState<CourseOptimization | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [c, g, o, a, assess] = await Promise.all([
          coursesAPI.get(courseId),
          coursesAPI.getGraph(courseId).catch(() => null),
          coursesAPI.getOptimization(courseId).catch(() => null),
          coursesAPI.getAnalytics(courseId).catch(() => null),
          coursesAPI.listAssessments(courseId).catch(() => []),
        ]);
        setCourse(c);
        setGraph(g);
        setOptimization(o);
        setAnalytics(a);
        setAssessments(assess);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [courseId]);

  // New results change weakness flags, priorities and alerts: reload what depends on them
  const refreshAfterResults = async () => {
    const [assess, g, a] = await Promise.all([
      coursesAPI.listAssessments(courseId).catch(() => assessments),
      coursesAPI.getGraph(courseId).catch(() => graph),
      coursesAPI.getAnalytics(courseId).catch(() => analytics),
    ]);
    setAssessments(assess);
    setGraph(g);
    setAnalytics(a);
  };

  if (loading) return <LoadingSkeleton />;
  if (!course) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Course not found</div>;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BookOpen size={14} /> },
    { key: "curriculum", label: "Curriculum Graph", icon: <GitBranch size={14} /> },
    { key: "optimization", label: "Optimization", icon: <Zap size={14} /> },
    { key: "assessments", label: "Assessments", icon: <FileText size={14} /> },
    { key: "analytics", label: "Analytics", icon: <BarChart3 size={14} /> },
    { key: "people", label: "People", icon: <Users size={14} /> },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span className="badge badge-info">{course.code}</span>
          <span className="badge badge-neutral">{course.semester}</span>
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{course.title}</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.93rem", marginTop: 4 }}>
          {course.teacher_name || "Faculty"} · {course.total_classes} periods × {course.period_duration}m = {course.total_available_minutes}m total
        </p>
      </div>

      {/* Tabs */}
      {course.my_role === "viewer" && (
        <p role="note" className="card" style={{ padding: "10px 14px", marginBottom: 16, borderColor: "var(--caution)" }}>
          This course is shared with you to view. You can look at everything, but only the owner or a co-teacher can change it.
        </p>
      )}
      <div className="tab-list" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in" key={activeTab}>
        {activeTab === "overview" && <OverviewTab course={course} analytics={analytics} graph={graph} />}
        {activeTab === "curriculum" && <CurriculumTab graph={graph} courseId={courseId} />}
        {activeTab === "optimization" && <OptimizationTab optimization={optimization} />}
        {activeTab === "assessments" && (
          <AssessmentResults
            courseId={courseId}
            assessments={assessments}
            concepts={graph?.nodes ?? []}
            onRecorded={refreshAfterResults}
          />
        )}
        {activeTab === "analytics" && <AnalyticsTab analytics={analytics} />}
        {activeTab === "people" && <CoursePeople courseId={courseId} canManage={course.my_role === "owner" || course.my_role === "admin"} />}
      </div>
    </div>
  );
}

function OverviewTab({ course, analytics, graph }: { course: Course; analytics: CourseAnalytics | null; graph: CurriculumGraph | null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {course.units_count === 0 && (
        <div
          className="glass-card animate-fade-in"
          style={{
            gridColumn: "1 / -1",
            padding: "32px 28px",
            textAlign: "center",
            background: "rgba(139, 92, 246, 0.06)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
          }}
        >
          <Upload size={40} style={{ color: "var(--accent-purple)", margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: 8 }}>
            No Curriculum Attached Yet
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.93rem", marginBottom: 20, maxWidth: 480, margin: "0 auto 20px" }}>
            Upload a syllabus copy to generate the full curriculum tree, topic allocations, and optimization. No synthetic data will be injected.
          </p>
          <Link href={`/upload?courseId=${course.id}`} className="btn btn-primary">
            <Upload size={16} /> Upload Syllabus Copy
          </Link>
        </div>
      )}

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: "0.93rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 16 }}>
          Course Summary
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <InfoRow icon={<Layers size={16} />} label="Units" value={course.units_count.toString()} />
          <InfoRow icon={<BookOpen size={16} />} label="Topics" value={course.topics_count.toString()} />
          <InfoRow icon={<Lightbulb size={16} />} label="Concepts" value={course.concepts_count.toString()} />
          <InfoRow icon={<Clock size={16} />} label="Total Time" value={`${course.total_available_minutes}m`} />
          <InfoRow icon={<Calendar size={16} />} label="Periods" value={course.total_classes.toString()} />
          <InfoRow icon={<Users size={16} />} label="Section" value={course.section_name || "A"} />
        </div>
      </div>

      {analytics && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: "0.93rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 16 }}>
            Progress
          </h3>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "2.5rem", fontWeight: 800, background: "linear-gradient(135deg, var(--brand-start), var(--accent-emerald))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {analytics.progress_percentage}%
            </div>
            <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 4 }}>
              {analytics.completed_sessions} of {analytics.total_sessions} sessions completed
            </div>
          </div>
          <div className="progress-bar" style={{ marginTop: 12 }}>
            <div className="progress-bar-fill" style={{ width: `${analytics.progress_percentage}%`, background: "linear-gradient(90deg, var(--brand-start), var(--accent-emerald))" }} />
          </div>
        </div>
      )}

      {graph && graph.bottlenecks.length > 0 && (
        <div className="card" style={{ padding: 24, gridColumn: "1 / -1" }}>
          <h3 style={{ fontSize: "0.93rem", fontWeight: 600, color: "var(--accent-rose)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} /> Prerequisite Bottlenecks
          </h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {graph.nodes.filter((n) => graph.bottlenecks.includes(n.id)).map((n) => (
              <div key={n.id} className="badge badge-danger" style={{ padding: "8px 14px" }}>
                {n.name} — {n.avg_score}% avg · {n.downstream_count} dependents
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurriculumTab({ graph, courseId }: { graph: CurriculumGraph | null; courseId: string }) {
  if (!graph) return (
    <div className="card" style={{ padding: 48, textAlign: "center" }}>
      <GitBranch size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
      <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 8 }}>No Curriculum Data</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.93rem", marginBottom: 20 }}>
        Upload and confirm a syllabus to generate the curriculum graph with prerequisite DAGs.
      </p>
      <Link href={`/upload?courseId=${courseId}`} className="btn btn-primary">
        <Upload size={16} /> Upload Syllabus Copy
      </Link>
    </div>
  );
  return <CurriculumGraphView graph={graph} />;
}

function OptimizationTab({ optimization }: { optimization: CourseOptimization | null }) {
  if (!optimization) return <EmptyState message="No optimization data available." />;

  const pressureColors: Record<string, string> = {
    healthy: "var(--accent-emerald)", balanced: "var(--accent-amber)", high_pressure: "var(--accent-rose)",
  };

  return (
    <div>
      {/* Budget Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        <BudgetCard label="Total Available" value={`${optimization.total_available_minutes}m`} color="var(--accent-blue)" />
        <BudgetCard label="Allocated" value={`${optimization.total_allocated_minutes}m`} color="var(--accent-purple)" />
        <BudgetCard label="Revision Budget" value={`${optimization.revision_budget_minutes}m`} color="var(--accent-amber)" />
        <BudgetCard label="Assessment Budget" value={`${optimization.assessment_budget_minutes}m`} color="var(--accent-cyan)" />
        <BudgetCard label="Buffer" value={`${optimization.unallocated_buffer_minutes}m`} color={pressureColors[optimization.time_pressure_status]} />
      </div>

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`badge ${optimization.time_pressure_status === "healthy" ? "badge-success" : optimization.time_pressure_status === "balanced" ? "badge-warning" : "badge-danger"}`}>
          {optimization.time_pressure_status.replace("_", " ")}
        </span>
        <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Time Pressure: {optimization.formula_explanation?.invariant}
        </span>
      </div>

      {/* Allocations Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Topic</th>
              <th>Estimated</th>
              <th>Allocated</th>
              <th>Periods</th>
              <th>Priority</th>
              <th>Reason Codes</th>
            </tr>
          </thead>
          <tbody>
            {optimization.topic_allocations.map((alloc) => (
              <tr key={alloc.topic_id}>
                <td><span className="badge badge-neutral">U{alloc.unit_number}</span></td>
                <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{alloc.topic_title}</td>
                <td>{alloc.estimated_minutes}m</td>
                <td style={{ fontWeight: 600, color: "var(--accent-blue)" }}>{alloc.allocated_minutes}m</td>
                <td>{alloc.recommended_periods}</td>
                <td>
                  <span style={{ fontWeight: 600, color: alloc.priority_score > 0.6 ? "var(--accent-amber)" : "var(--text-secondary)" }}>
                    {alloc.priority_score.toFixed(3)}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {alloc.reason_codes.slice(0, 2).map((r) => (
                      <span key={r} className="badge badge-neutral" style={{ fontSize: "0.8rem" }}>{r}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsTab({ analytics }: { analytics: CourseAnalytics | null }) {
  if (!analytics) return <EmptyState message="No analytics available." />;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="card stat-glow-emerald" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-emerald)" }}>{analytics.progress_percentage}%</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Course Progress</div>
        </div>
        <div className="card stat-glow-blue" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-blue)" }}>{analytics.actual_minutes_taught}m</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Minutes Taught</div>
        </div>
        <div className="card stat-glow-amber" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-amber)" }}>{analytics.remaining_minutes}m</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Remaining</div>
        </div>
      </div>

      {/* Method Effectiveness */}
      {analytics.teaching_method_effectiveness.length > 0 && (
        <div className="card" style={{ overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)" }}>
            <h3 style={{ fontSize: "0.93rem", fontWeight: 600 }}>Teaching Method Effectiveness</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Concept Type</th>
                <th>Baseline</th>
                <th>Post-Score</th>
                <th>Gain</th>
                <th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {analytics.teaching_method_effectiveness.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{m.method_name}</td>
                  <td><span className="badge badge-neutral">{m.concept_type}</span></td>
                  <td>{m.baseline_score}%</td>
                  <td>{m.post_score}%</td>
                  <td style={{ fontWeight: 600, color: "var(--accent-emerald)" }}>+{m.observed_gain}%</td>
                  <td>{m.sessions_tracked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alerts */}
      {analytics.alerts.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: "0.93rem", fontWeight: 600, marginBottom: 12 }}>Intelligent Alerts</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analytics.alerts.map((alert) => (
              <div key={alert.id} style={{ padding: 12, borderRadius: "var(--radius-md)", background: alert.severity === "danger" ? "var(--redpen-wash)" : alert.severity === "warning" ? "var(--caution-wash)" : alert.severity === "success" ? "var(--tick-wash)" : "var(--ink-wash)", border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {alert.severity === "danger" ? <AlertTriangle size={14} style={{ color: "var(--redpen)" }} /> : alert.severity === "warning" ? <AlertTriangle size={14} style={{ color: "var(--caution)" }} /> : <CheckCircle2 size={14} style={{ color: "var(--tick)" }} />}
                  <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{alert.title}</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: 16, textAlign: "center" }}>
      <div style={{ fontSize: "1.375rem", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ color: "var(--text-muted)" }}>{icon}</div>
      <div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{label}</div>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card" style={{ padding: 48, textAlign: "center" }}>
      <Target size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
      <p style={{ color: "var(--text-secondary)" }}>{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ width: 300, height: 32, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 500, height: 18, marginBottom: 24 }} />
      <div className="skeleton" style={{ width: "100%", height: 44, borderRadius: "var(--radius-md)", marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="skeleton" style={{ height: 250, borderRadius: "var(--radius-lg)" }} />
        <div className="skeleton" style={{ height: 250, borderRadius: "var(--radius-lg)" }} />
      </div>
    </div>
  );
}
