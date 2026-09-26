"use client";

import { useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { AssessmentItem, GraphNode } from "@/lib/types";

type Row = { concept_id: string; average_score: string; sample_size: string; common_errors: string };
const emptyRow = (): Row => ({ concept_id: "", average_score: "", sample_size: "60", common_errors: "" });

/**
 * Assessments with results entry (Assess -> Record -> Re-optimize). Scores are recorded
 * per concept; the API writes them in one transaction, flags weak concepts against the
 * course threshold and re-scores topic priorities.
 */
export default function AssessmentResults({ courseId, assessments, concepts, onRecorded }: {
  courseId: string;
  assessments: AssessmentItem[];
  concepts: GraphNode[];
  onRecorded: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  if (assessments.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No assessments recorded yet.</div>;
  }

  const open = (a: AssessmentItem) => {
    setOpenId(openId === a.id ? null : a.id);
    setMessage(null);
    // Pre-fill with any results already recorded so they can be corrected
    setRows(a.performances?.length
      ? a.performances.map((p) => ({ concept_id: p.concept_id, average_score: String(p.average_score), sample_size: "60", common_errors: p.common_errors || "" }))
      : [emptyRow()]);
  };

  const update = (i: number, field: keyof Row, value: string) =>
    setRows(rows.map((r, n) => (n === i ? { ...r, [field]: value } : r)));

  const submit = async (assessmentId: string) => {
    const filled = rows.filter((r) => r.concept_id && r.average_score !== "");
    if (filled.length === 0) {
      setMessage({ tone: "error", text: "Add at least one concept score." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await coursesAPI.recordResults(courseId, assessmentId, {
        performances: filled.map((r) => ({
          concept_id: r.concept_id,
          average_score: Number(r.average_score),
          sample_size: Number(r.sample_size) || 60,
          common_errors: r.common_errors || null,
        })),
      });
      setMessage({
        tone: res.skipped.length ? "warn" : "ok",
        text: `${res.message}${res.skipped.length ? ` Skipped: ${res.skipped.map((s) => s.reason).join("; ")}` : ""}`,
      });
      onRecorded();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not record results" });
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {assessments.map((a) => (
        <div key={a.id} className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h4 style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{a.title}</h4>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <span className="badge badge-neutral">{a.assessment_type}</span>
                <span className={`badge ${a.status === "completed" ? "badge-success" : "badge-warning"}`}>{a.status}</span>
                <span className="badge badge-neutral">{a.max_marks} marks</span>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => open(a)} aria-expanded={openId === a.id}>
              <ClipboardList size={14} /> {a.performances?.length ? "Update results" : "Enter results"}
            </button>
          </div>

          {a.performances && a.performances.length > 0 && openId !== a.id && (
            <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12, marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {a.performances.map((p) => (
                <span key={p.concept_id} className={`badge ${p.weakness_flag ? "badge-danger" : "badge-success"}`}>
                  {p.concept_name}: {p.average_score}%
                </span>
              ))}
            </div>
          )}

          {openId === a.id && (
            <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 14, marginTop: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 110px 100px 2fr 36px", gap: 8, fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                <span>Concept</span><span>Class avg %</span><span>Students</span><span>Common errors</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 110px 100px 2fr 36px", gap: 8, marginBottom: 6 }}>
                  <select className="select" aria-label="Concept" value={r.concept_id} onChange={(e) => update(i, "concept_id", e.target.value)}>
                    <option value="">Choose a concept…</option>
                    {concepts.map((c) => <option key={c.id} value={c.id}>U{c.unit_number} · {c.name}</option>)}
                  </select>
                  <input className="input" type="number" min={0} max={100} step={0.5} aria-label="Class average percent"
                    value={r.average_score} onChange={(e) => update(i, "average_score", e.target.value)} />
                  <input className="input" type="number" min={1} aria-label="Number of students"
                    value={r.sample_size} onChange={(e) => update(i, "sample_size", e.target.value)} />
                  <input className="input" aria-label="Common errors" value={r.common_errors}
                    onChange={(e) => update(i, "common_errors", e.target.value)} />
                  <button type="button" className="btn btn-ghost" aria-label="Remove row" style={{ padding: 6 }}
                    onClick={() => setRows(rows.length > 1 ? rows.filter((_, n) => n !== i) : [emptyRow()])}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setRows([...rows, emptyRow()])}><Plus size={14} /> Add concept</button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(a.id)}>
                  {busy ? "Saving…" : "Save results & re-optimize"}
                </button>
              </div>
              {message && (
                <div role={message.tone === "error" ? "alert" : "status"} style={{ marginTop: 10, fontSize: "0.9rem",
                  color: message.tone === "ok" ? "var(--tick)" : message.tone === "warn" ? "var(--caution)" : "var(--redpen)" }}>
                  {message.text}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
