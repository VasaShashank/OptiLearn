"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, X } from "lucide-react";
import { coursesAPI, teachingMethodsAPI } from "@/lib/api";
import type { SessionLogResult, TeachingMethodItem } from "@/lib/types";

/** Post-class record (Teach -> Record). The API stores it in one transaction. */
export default function SessionLogModal({ courseId, sessionNumber, topicTitle, periodMinutes, defaultMinutes, defaultNotes, onClose, onLogged }: {
  courseId: string;
  sessionNumber: number;
  topicTitle: string | null;
  periodMinutes: number;
  defaultMinutes?: number;
  defaultNotes?: string;
  onClose: () => void;
  onLogged: (result: SessionLogResult) => void;
}) {
  const [methods, setMethods] = useState<TeachingMethodItem[]>([]);
  const [form, setForm] = useState({
    method_id: "", actual_minutes: defaultMinutes || periodMinutes, student_engagement_rating: 4,
    completion_rate: 100, teacher_notes: defaultNotes || "", topic_completed: false, carry_over: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teachingMethodsAPI.list().then(setMethods).catch(() => setMethods([]));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await coursesAPI.logSession(courseId, sessionNumber, {
        method_id: form.method_id || null,
        actual_minutes: form.actual_minutes,
        student_engagement_rating: form.student_engagement_rating,
        completion_rate: form.completion_rate / 100,
        teacher_notes: form.teacher_notes || undefined,
        topic_completed: form.topic_completed,
        carry_over: !form.topic_completed && form.carry_over,
      });
      onLogged(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the class");
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="log-title"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 id="log-title" style={{ fontSize: "1.0625rem", fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
              <ClipboardCheck size={18} style={{ color: "var(--accent-emerald)" }} /> Record period {sessionNumber}
            </h2>
            {topicTitle && <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: 4 }}>{topicTitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Teaching method used">
            <select className="select" value={form.method_id} onChange={(e) => setForm({ ...form, method_id: e.target.value })}>
              <option value="">Not specified</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Minutes taught">
              <input className="input" type="number" min={1} max={300} required value={form.actual_minutes}
                onChange={(e) => setForm({ ...form, actual_minutes: Number(e.target.value) })} />
            </Field>
            <Field label={`Planned content covered: ${form.completion_rate}%`}>
              <input type="range" min={0} max={100} step={5} value={form.completion_rate}
                onChange={(e) => setForm({ ...form, completion_rate: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Class engagement">
            <div style={{ display: "flex", gap: 6 }} role="radiogroup" aria-label="Class engagement">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={form.student_engagement_rating === n}
                  className={`btn ${form.student_engagement_rating === n ? "btn-primary" : "btn-ghost"}`}
                  style={{ flex: 1, justifyContent: "center", padding: "6px 0" }}
                  onClick={() => setForm({ ...form, student_engagement_rating: n })}>{n}</button>
              ))}
            </div>
          </Field>
          <Field label="Notes (what worked, what to revisit)">
            <textarea className="input" rows={3} maxLength={2000} value={form.teacher_notes}
              onChange={(e) => setForm({ ...form, teacher_notes: e.target.value })} style={{ resize: "vertical" }} />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={form.topic_completed} onChange={(e) => setForm({ ...form, topic_completed: e.target.checked })} />
            This finishes the topic
          </label>
          {!form.topic_completed && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={form.carry_over} onChange={(e) => setForm({ ...form, carry_over: e.target.checked })} style={{ marginTop: 4 }} />
              <span>Continue this topic next period<br />
                <span style={{ color: "var(--pencil)", fontSize: "0.85rem" }}>Later periods move back by one. Their lesson plans are cleared and made again when you open them.</span>
              </span>
            </label>
          )}
          {error && <div role="alert" style={{ color: "var(--redpen)", fontSize: "0.9rem" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Record class"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
      {label}
      {children}
    </label>
  );
}
