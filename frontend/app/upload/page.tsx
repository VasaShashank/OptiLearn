"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  X,
  Layers,
  Target,
  Sparkles,
  ArrowRight,
  PlusCircle,
  AlertCircle,
} from "lucide-react";
import { syllabusAPI, coursesAPI } from "@/lib/api";
import type { ExtractedCurriculum, UnitDraft, TopicDraft, ConceptDraft, OutcomeDraft, Course } from "@/lib/types";

export default function UploadPage() {
  const [curriculum, setCurriculum] = useState<ExtractedCurriculum | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCourse, setConfirmedCourse] = useState<{ id: string; title: string; code: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rawText, setRawText] = useState("");
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Target Course mode: "new" or "existing"
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [targetCourseId, setTargetCourseId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editable course parameters
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [semester, setSemester] = useState("Fall 2026");
  const [totalClasses, setTotalClasses] = useState(40);
  const [periodDuration, setPeriodDuration] = useState(55);

  useEffect(() => {
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const cid = urlParams?.get("courseId");

    coursesAPI.list().then((c) => {
      setCourses(c);
      if (cid && c.some((item) => item.id === cid)) {
        setTargetMode("existing");
        setTargetCourseId(cid);
        const match = c.find((item) => item.id === cid);
        if (match) {
          setCourseTitle(match.title);
          setCourseCode(match.code);
          setSemester(match.semester);
          setTotalClasses(match.total_classes);
          setPeriodDuration(match.period_duration);
        }
      } else if (c.length > 0) {
        setTargetCourseId(c[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleUpload = async (file?: File) => {
    setLoading(true);
    setConfirmedCourse(null);
    setErrorMessage(null);
    try {
      const result = await syllabusAPI.upload(file, !file ? rawText || undefined : undefined);
      setCurriculum(result);
      if (result.course_name && result.course_name !== "Untitled Course") {
        setCourseTitle(result.course_name);
      }
      if (result.course_code) {
        setCourseCode(result.course_code);
      }
      setExpandedUnits(new Set(result.units.map((_, i) => i)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed. Please verify the syllabus format.";
      setErrorMessage(msg);
    }
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleConfirm = async () => {
    if (!curriculum) return;
    setConfirming(true);
    try {
      let activeCourseId = targetCourseId;

      if (targetMode === "new") {
        // Create brand new course for this subject
        const newCourse = await coursesAPI.create({
          code: courseCode.trim() || curriculum.course_code,
          title: courseTitle.trim() || curriculum.course_name,
          semester: semester.trim() || "Fall 2026",
          total_classes: totalClasses,
          period_duration: periodDuration,
          academic_year: "2026-2027",
          section_name: "Section A",
        });
        activeCourseId = newCourse.id;
        // Refresh course list
        const updatedCourses = await coursesAPI.list();
        setCourses(updatedCourses);
      }

      if (activeCourseId) {
        await coursesAPI.confirmCurriculum(activeCourseId, {
          course_name: courseTitle.trim() || curriculum.course_name,
          course_code: courseCode.trim() || curriculum.course_code,
          units: curriculum.units,
          outcomes: curriculum.outcomes,
        });

        setConfirmedCourse({
          id: activeCourseId,
          title: courseTitle.trim() || curriculum.course_name,
          code: courseCode.trim() || curriculum.course_code,
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Confirmation failed");
    }
    setConfirming(false);
  };

  const toggleUnit = (idx: number) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateOutcome = (idx: number, desc: string) => {
    if (!curriculum) return;
    const nextOutcomes = [...curriculum.outcomes];
    nextOutcomes[idx] = { ...nextOutcomes[idx], description: desc };
    setCurriculum({ ...curriculum, outcomes: nextOutcomes });
  };

  const bloomColors: Record<string, string> = {
    Remember: "var(--pencil)",
    Understand: "var(--ink)",
    Apply: "var(--tick)",
    Analyze: "var(--caution)",
    Evaluate: "#f97316",
    Create: "var(--redpen)",
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Syllabus Upload & Intelligent Extraction
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.93rem", marginTop: 4 }}>
          Upload syllabus files or paste raw text to extract multi-level curriculum trees, outcomes, and prerequisite DAGs
        </p>
      </div>

      {errorMessage && (
        <div
          className="card animate-fade-in"
          style={{
            padding: "16px 20px",
            marginBottom: 24,
            background: "var(--redpen-wash)",
            border: "1px solid var(--redpen)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <AlertCircle size={22} style={{ color: "var(--accent-rose)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--accent-rose)" }}>
              Extraction Failed (No Fallback Injected)
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginTop: 4, lineHeight: 1.5 }}>
              {errorMessage}
            </p>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 8 }}>
              💡 <strong>Required Syllabus Structure:</strong> Please ensure the document includes clear unit or module headers (e.g. <code>UNIT 1: Database Architecture</code> or <code>MODULE 1: Introduction</code>) followed by topics and sub-topics.
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!curriculum ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* File Upload Dropzone */}
          <div
            className={`drop-zone ${dragOver ? "drag-over" : ""}`}
            style={{ background: "var(--bg-card)" }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Upload size={40} style={{ color: "var(--brand-start)", margin: "0 auto 16px" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 6 }}>Drop Syllabus File</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              PDF, TXT, or DOCX documents
            </p>
          </div>

          {/* Text Input */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontSize: "0.93rem", fontWeight: 600, marginBottom: 12 }}>Or Paste Syllabus Text</h3>
            <textarea
              className="input"
              style={{
                flex: 1,
                minHeight: 180,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "0.9rem",
              }}
              placeholder={`Example:\nSubject Name: Artificial Intelligence and Machine Learning\nCourse Code: CS402\n\nUNIT 1: Introduction to AI & State Space Search\nFoundations of AI, Agents and Environments, BFS, DFS, Heuristic Search, A* Algorithm\n\nUNIT 2: Machine Learning Foundations\nRegression, Classification, Decision Trees, SVM, Neural Networks`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={() => handleUpload()}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? (
                  <>
                    <div className="spinner" /> Extracting Structure...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Extract Curriculum
                  </>
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setRawText("");
                  handleUpload();
                }}
                disabled={loading}
              >
                Use Sample
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-fade-in-up">
          {/* Post-Confirmation Banner */}
          {confirmedCourse && (
            <div
              className="card animate-fade-in"
              style={{
                padding: "20px 24px",
                marginBottom: 24,
                background: "var(--tick-wash)",
                border: "1px solid var(--tick)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-emerald)", fontWeight: 700, fontSize: "1.0625rem" }}>
                  <Check size={20} /> Course Curriculum Successfully Persisted!
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.93rem", marginTop: 4 }}>
                  <strong>{confirmedCourse.code}</strong> — {confirmedCourse.title} is now fully active with optimization and analytics.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Link href={`/courses/${confirmedCourse.id}`} className="btn btn-primary">
                  View Course Dashboard <ArrowRight size={14} />
                </Link>
                <button
                  onClick={() => {
                    setCurriculum(null);
                    setConfirmedCourse(null);
                    setRawText("");
                  }}
                  className="btn btn-secondary"
                >
                  <PlusCircle size={14} /> Upload Another Subject
                </button>
              </div>
            </div>
          )}

          {/* Course Subject Configuration Card */}
          <div className="glass-card" style={{ padding: 22, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: 6 }}>Extracted Subject Metadata</span>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Course & Subject Configuration</h3>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCurriculum(null);
                    setConfirmedCourse(null);
                  }}
                >
                  <X size={15} /> Cancel / Reset
                </button>
                {!confirmedCourse ? (
                  <button className="btn btn-primary" onClick={handleConfirm} disabled={confirming}>
                    {confirming ? (
                      <>
                        <div className="spinner" /> Persisting...
                      </>
                    ) : (
                      <>
                        <Check size={16} /> Confirm & Persist Course
                      </>
                    )}
                  </button>
                ) : (
                  <span className="badge badge-success" style={{ padding: "8px 14px" }}>
                    <Check size={14} /> Persisted & Optimized
                  </span>
                )}
              </div>
            </div>

            {/* Target Course Destination Selector */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                padding: "16px 20px",
                background: "var(--bg-input)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                marginBottom: 20,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === "new"}
                  onChange={() => setTargetMode("new")}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.93rem", color: "var(--text-primary)" }}>
                    ✨ Create as a New Course Subject
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Adds a new distinct subject to your teacher dashboard (e.g. AIML, OS, Networks)
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: courses.length > 0 ? "pointer" : "not-allowed",
                  opacity: courses.length > 0 ? 1 : 0.4,
                }}
              >
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === "existing"}
                  onChange={() => setTargetMode("existing")}
                  disabled={courses.length === 0}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.93rem", color: "var(--text-primary)" }}>
                    🔄 Update / Overwrite Existing Course
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Replaces units and outcomes for an existing course
                  </div>
                  {targetMode === "existing" && (
                    <select
                      className="input-select"
                      value={targetCourseId}
                      onChange={(e) => setTargetCourseId(e.target.value)}
                      style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        fontSize: "0.9rem",
                        width: "100%",
                      }}
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.title} ({c.semester})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>

            {/* Editable Subject Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Course Title / Subject Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  style={{ marginTop: 4, width: "100%", fontWeight: 600 }}
                  placeholder="e.g. Artificial Intelligence & Machine Learning"
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Course Code
                </label>
                <input
                  type="text"
                  className="input"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                  style={{ marginTop: 4, width: "100%", fontWeight: 600 }}
                  placeholder="e.g. CS402"
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Semester
                </label>
                <input
                  type="text"
                  className="input"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  style={{ marginTop: 4, width: "100%" }}
                  placeholder="e.g. Fall 2026"
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Total Classes (Periods)
                </label>
                <input
                  type="number"
                  className="input"
                  value={totalClasses}
                  onChange={(e) => setTotalClasses(Number(e.target.value))}
                  style={{ marginTop: 4, width: "100%" }}
                />
              </div>
            </div>

            {/* Quick stats badges */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <span className="badge badge-neutral">{curriculum.units.length} units</span>
              <span className="badge badge-neutral">
                {curriculum.units.reduce((s, u) => s + u.topics.length, 0)} topics
              </span>
              <span className="badge badge-neutral">
                {curriculum.units.reduce((s, u) => s + u.topics.reduce((s2, t) => s2 + t.concepts.length, 0), 0)} concepts
              </span>
              <span className="badge badge-success">
                Extraction Confidence: {(curriculum.confidence_score * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Extraction Notes */}
          {curriculum.extraction_notes.length > 0 && (
            <div
              className="card"
              style={{
                padding: 14,
                marginBottom: 20,
                background: "var(--ink-wash)",
                borderColor: "var(--ink-wash)",
              }}
            >
              {curriculum.extraction_notes.map((note, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-blue)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Sparkles size={12} /> {note}
                </div>
              ))}
            </div>
          )}

          {/* Course Outcomes Section */}
          {curriculum.outcomes.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <h3
                style={{
                  fontSize: "0.93rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 14,
                }}
              >
                <Target size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                Course Outcomes (Bloom-Aligned)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {curriculum.outcomes.map((o: OutcomeDraft, i: number) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 12px",
                      background: "var(--bg-input)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span className="badge badge-info" style={{ minWidth: 46, justifyContent: "center" }}>
                      {o.code}
                    </span>
                    <input
                      type="text"
                      className="input"
                      value={o.description}
                      onChange={(e) => updateOutcome(i, e.target.value)}
                      style={{ flex: 1, fontSize: "0.9rem", padding: "4px 8px" }}
                    />
                    <span
                      className="badge"
                      style={{
                        background: `${bloomColors[o.bloom_level] || "var(--pencil)"}20`,
                        color: bloomColors[o.bloom_level] || "var(--pencil)",
                        border: `1px solid ${bloomColors[o.bloom_level] || "var(--pencil)"}40`,
                        minWidth: 80,
                        justifyContent: "center",
                      }}
                    >
                      {o.bloom_level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Units / Topics / Concepts Tree */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3
              style={{
                fontSize: "0.93rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              Extracted Curriculum Modules
            </h3>
            {curriculum.units.map((unit: UnitDraft, uIdx: number) => (
              <div key={uIdx} className="card" style={{ overflow: "hidden" }}>
                <div
                  onClick={() => toggleUnit(uIdx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 20px",
                    cursor: "pointer",
                    borderBottom: expandedUnits.has(uIdx) ? "1px solid var(--border-default)" : "none",
                  }}
                >
                  {expandedUnits.has(uIdx) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Layers size={16} style={{ color: "var(--accent-purple)" }} />
                  <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Unit {unit.unit_number}: {unit.title}
                  </span>
                  <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>
                    {unit.topics.length} topics
                  </span>
                </div>
                {expandedUnits.has(uIdx) && (
                  <div style={{ padding: "0 20px 16px" }}>
                    {unit.topics.map((topic: TopicDraft, tIdx: number) => (
                      <div key={tIdx} style={{ marginTop: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <FileText size={14} style={{ color: "var(--accent-blue)" }} />
                          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{topic.title}</span>
                          <span className="badge badge-neutral" style={{ fontSize: "0.8rem" }}>
                            {topic.estimated_minutes}m
                          </span>
                        </div>
                        <div style={{ paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
                          {topic.concepts.map((concept: ConceptDraft, cIdx: number) => (
                            <div
                              key={cIdx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--bg-secondary)",
                              }}
                            >
                              <Lightbulb size={12} style={{ color: "var(--accent-amber)", flexShrink: 0 }} />
                              <span style={{ fontSize: "0.85rem", flex: 1 }}>{concept.name}</span>
                              <span className="badge badge-neutral" style={{ fontSize: "0.8rem" }}>
                                Diff: {concept.difficulty}/5
                              </span>
                              <span className="badge badge-neutral" style={{ fontSize: "0.8rem" }}>
                                {concept.concept_type}
                              </span>
                              {concept.prerequisites.length > 0 && (
                                <span className="badge badge-purple" style={{ fontSize: "0.8rem" }}>
                                  ↑ {concept.prerequisites.join(", ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
