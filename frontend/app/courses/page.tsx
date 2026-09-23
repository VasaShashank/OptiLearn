"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, BookOpen, Layers, Lightbulb, Clock, ArrowRight, Calendar, Users, Upload, Check } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { Course } from "@/lib/types";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [justCreatedCourse, setJustCreatedCourse] = useState<Course | null>(null);

  useEffect(() => {
    coursesAPI.list().then(setCourses).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const newCourse = await coursesAPI.create({
        code: fd.get("code") as string,
        title: fd.get("title") as string,
        semester: fd.get("semester") as string,
        academic_year: fd.get("academic_year") as string || "2026-2027",
        total_classes: Number(fd.get("total_classes")) || 40,
        period_duration: Number(fd.get("period_duration")) || 55,
        section_name: fd.get("section_name") as string || "Section A",
        student_count: Number(fd.get("student_count")) || 60,
      });
      setCourses((prev) => [...prev, newCourse]);
      setShowModal(false);
      setJustCreatedCourse(newCourse);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create course");
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 200, borderRadius: "var(--radius-lg)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Courses</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
            Manage your courses and track curriculum progress
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Course
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="glass-card" style={{ padding: 64, textAlign: "center" }}>
          <BookOpen size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 8 }}>No courses found</h3>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Create a new course or upload a syllabus to begin.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Create Course
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 }}>
          {courses.map((course, idx) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className={`glass-card animate-fade-in-up stagger-${idx + 1}`}
              style={{ padding: 24, textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <span className="badge badge-info" style={{ marginBottom: 10 }}>{course.code}</span>
                  <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, marginTop: 8, letterSpacing: "-0.01em" }}>{course.title}</h3>
                </div>
                <ArrowRight size={18} style={{ color: "var(--text-muted)", marginTop: 4 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <span className="badge badge-neutral"><Calendar size={12} /> {course.semester}</span>
                <span className="badge badge-neutral"><Users size={12} /> {course.teacher_name || "Faculty"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <MiniStat icon={<Layers size={14} />} label="Units" value={course.units_count} />
                <MiniStat icon={<BookOpen size={14} />} label="Topics" value={course.topics_count} />
                <MiniStat icon={<Lightbulb size={14} />} label="Concepts" value={course.concepts_count} />
                <MiniStat icon={<Clock size={14} />} label="Minutes" value={course.total_available_minutes} />
              </div>
              {course.units_count === 0 && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-amber)", fontWeight: 500 }}>
                    Syllabus Pending
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: "0.6875rem", display: "flex", alignItems: "center", gap: 4 }}>
                    <Upload size={10} /> Upload Syllabus
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-content" style={{ padding: 32 }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 20 }}>Create New Course</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Course Code *
                  </label>
                  <input name="code" className="input" placeholder="CS302" required />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Course Title *
                  </label>
                  <input name="title" className="input" placeholder="Database Management Systems" required />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Semester *
                  </label>
                  <input name="semester" className="input" placeholder="Fall 2026" required />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Academic Year
                  </label>
                  <input name="academic_year" className="input" defaultValue="2026-2027" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Total Classes
                  </label>
                  <input name="total_classes" className="input" type="number" defaultValue={40} />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Period (min)
                  </label>
                  <input name="period_duration" className="input" type="number" defaultValue={55} />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Section
                  </label>
                  <input name="section_name" className="input" defaultValue="Section A" />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Students
                  </label>
                  <input name="student_count" className="input" type="number" defaultValue={60} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post-Creation Prompt Modal */}
      {justCreatedCourse && (
        <div className="modal-overlay" onClick={() => setJustCreatedCourse(null)}>
          <div className="modal-content animate-fade-in-up" style={{ padding: 32, maxWidth: 500, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16, 185, 129, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--accent-emerald)" }}>
              <Check size={28} />
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 8 }}>
              {justCreatedCourse.code} Created Successfully!
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 24, lineHeight: 1.5 }}>
              Would you like to upload a syllabus copy now? OptiTeach will extract all units, topics, and concepts without synthetic fallbacks and configure pedagogical allocations.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href={`/upload?courseId=${justCreatedCourse.id}`} className="btn btn-primary">
                <Upload size={16} /> Upload Syllabus Copy
              </Link>
              <Link href={`/courses/${justCreatedCourse.id}`} className="btn btn-secondary">
                View Course Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4, display: "flex", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: "1rem", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}
