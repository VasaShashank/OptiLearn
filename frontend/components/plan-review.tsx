"use client";

import { useEffect, useState } from "react";
import { Check, GitCompare, History, Pencil, RotateCcw, Save, X } from "lucide-react";
import { APIError, coursesAPI } from "@/lib/api";
import type { LessonPlan, LessonPlanDiff, LessonPlanVersion, PeriodPhase } from "@/lib/types";

/**
 * Human-in-the-loop review of a recommended lesson plan: approve, reject or edit.
 * Every save sends the version it was based on; if someone saved in between, the API
 * answers 409 and the teacher is offered the latest version instead of overwriting it.
 */
export default function PlanReview({ courseId, plan, onUpdated }: {
  courseId: string;
  plan: LessonPlan;
  onUpdated: (plan: LessonPlan) => void;
}) {
  const periodMinutes = plan.phases.reduce((n, p) => n + p.duration_minutes, 0);
  const [editing, setEditing] = useState(false);
  const [phases, setPhases] = useState<PeriodPhase[]>(plan.phases);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [history, setHistory] = useState<LessonPlanVersion[] | null>(null);
  const [diff, setDiff] = useState<LessonPlanDiff | null>(null);

  // A different plan: start clean
  useEffect(() => {
    setMessage(null);
    setConflict(false);
    setHistory(null);
    setDiff(null);
  }, [plan.id]);

  // A new version of the same plan (our save, or "Load latest"): resync the editor but
  // keep the confirmation message; refresh an open history list
  useEffect(() => {
    setPhases(plan.phases);
    setEditing(false);
    setConflict(false);
    setDiff(null);
    setHistory((open) => {
      if (open) coursesAPI.lessonPlanHistory(courseId, plan.session_number).then(setHistory).catch(() => {});
      return open;
    });
  }, [plan.version, plan.phases, courseId, plan.session_number]);

  const total = phases.reduce((n, p) => n + (Number(p.duration_minutes) || 0), 0);

  const save = async (body: Parameters<typeof coursesAPI.reviewLessonPlan>[2]) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await coursesAPI.reviewLessonPlan(courseId, plan.session_number, body);
      onUpdated(updated);
      setNote("");
      setMessage({ tone: "info", text: `Saved as version ${updated.version}.` });
    } catch (err) {
      if (err instanceof APIError && err.status === 409) {
        setConflict(true);
        setMessage({ tone: "error", text: `${err.message} (latest is version ${String(err.body.current_version ?? "?")}).` });
      } else {
        setMessage({ tone: "error", text: err instanceof Error ? err.message : "Save failed" });
      }
    }
    setBusy(false);
  };

  const reload = async () => {
    const [latest] = await coursesAPI.listLessonPlans(courseId, plan.session_number);
    if (latest) onUpdated(latest);
  };

  const showHistory = async () => {
    if (history) { setHistory(null); setDiff(null); return; }
    setHistory(await coursesAPI.lessonPlanHistory(courseId, plan.session_number));
  };

  const compare = async (from: number, to: number) => {
    setDiff(await coursesAPI.lessonPlanDiff(courseId, plan.session_number, from, to));
  };

  const updatePhase = (i: number, field: "duration_minutes" | "activity_description", value: string) =>
    setPhases(phases.map((p, n) => n === i ? { ...p, [field]: field === "duration_minutes" ? Number(value) : value } : p));

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: "var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginRight: 4 }}>
          Recommended plan · version {plan.version}
        </span>
        <button type="button" className="btn btn-secondary" disabled={busy || plan.status === "approved" || editing}
          onClick={() => save({ expected_version: plan.version, status: "approved" })} style={{ fontSize: "0.9rem" }}>
          <Check size={14} /> Approve
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || plan.status === "rejected" || editing}
          onClick={() => save({ expected_version: plan.version, status: "rejected", change_note: note || undefined })} style={{ fontSize: "0.9rem" }}>
          <X size={14} /> Reject
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(!editing)} style={{ fontSize: "0.9rem" }}>
          <Pencil size={14} /> {editing ? "Cancel edit" : "Edit phases"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={showHistory} style={{ fontSize: "0.9rem", marginLeft: "auto" }}>
          <History size={14} /> {history ? "Hide history" : "History"}
        </button>
      </div>

      {editing && (
        <div style={{ marginTop: 14 }}>
          {phases.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 80px 1fr", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{p.phase_name}</span>
              <input className="input" type="number" min={1} aria-label={`${p.phase_name} minutes`}
                value={p.duration_minutes} onChange={(e) => updatePhase(i, "duration_minutes", e.target.value)} />
              <input className="input" aria-label={`${p.phase_name} activity`}
                value={p.activity_description} onChange={(e) => updatePhase(i, "activity_description", e.target.value)} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span className={`badge ${total === periodMinutes ? "badge-success" : "badge-danger"}`}>
              {total} / {periodMinutes} min
            </span>
            <input className="input" placeholder="What changed and why (optional)" value={note}
              onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label="Change note" />
            <button type="button" className="btn btn-primary" disabled={busy || total !== periodMinutes}
              onClick={() => save({ expected_version: plan.version, phases, change_note: note || undefined })}>
              <Save size={14} /> Save as new version
            </button>
          </div>
        </div>
      )}

      {message && (
        <div role={message.tone === "error" ? "alert" : "status"}
          style={{ marginTop: 12, fontSize: "0.9rem", color: message.tone === "error" ? "var(--redpen)" : "var(--tick)", display: "flex", gap: 10, alignItems: "center" }}>
          {message.text}
          {conflict && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: "0.85rem", padding: "4px 10px" }} onClick={reload}>
              <RotateCcw size={12} /> Load latest
            </button>
          )}
        </div>
      )}

      {history && (
        <div style={{ marginTop: 14 }}>
          <table className="data-table" style={{ fontSize: "0.85rem" }}>
            <thead><tr><th>Version</th><th>By</th><th>When</th><th>Note</th><th /></tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.version}>
                  <td style={{ fontFamily: "var(--font-mono)" }}>v{h.version}{h.is_current && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: "0.8rem" }}>current</span>}</td>
                  <td>{h.edited_by}</td>
                  <td style={{ color: "var(--text-muted)" }}>{new Date(h.edited_at).toLocaleString()}</td>
                  <td>{h.change_note}</td>
                  <td>
                    {i < history.length - 1 && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "2px 8px" }}
                        onClick={() => compare(history[i + 1].version, h.version)}>
                        <GitCompare size={12} /> vs v{history[i + 1].version}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {diff && (
            <div style={{ marginTop: 10, fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 4 }}>
              <strong>v{diff.from_version} → v{diff.to_version}</strong>
              {diff.phases.length === 0 && Object.keys(diff.content).length === 0 && <span style={{ color: "var(--text-muted)" }}>No content changes (status only).</span>}
              {diff.phases.map((c) => (
                <div key={c.index}>
                  Phase {c.index} ({c.phase}) {c.change}
                  {c.fields && Object.entries(c.fields).map(([f, d]) => (
                    <div key={f} style={{ marginLeft: 12, fontFamily: "var(--font-mono)" }}>
                      {f}: <span style={{ color: "var(--redpen)" }}>{String(d.from)}</span> → <span style={{ color: "var(--tick)" }}>{String(d.to)}</span>
                    </div>
                  ))}
                </div>
              ))}
              {Object.entries(diff.content).map(([field, d]) => (
                <div key={field}>{field.replaceAll("_", " ")}: +{d.added.length} / −{d.removed.length}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
