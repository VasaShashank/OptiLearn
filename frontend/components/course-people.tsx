"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { membersAPI } from "@/lib/api";
import type { CourseMembers, MemberRole } from "@/lib/types";

const ROLE_LABEL: Record<MemberRole, string> = { co_teacher: "Co-teacher", viewer: "Viewer" };
const ROLE_HELP: Record<MemberRole, string> = {
  co_teacher: "Can change the curriculum, plans and results",
  viewer: "Can see everything but change nothing",
};

/** Who has access to a course. Only the owner (or an admin) can change it. */
export default function CoursePeople({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [people, setPeople] = useState<CourseMembers | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("co_teacher");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => membersAPI.list(courseId).then(setPeople).catch(() => setPeople(null)), [courseId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await load();
      setMessage({ tone: "ok", text: ok });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    }
    setBusy(false);
  };

  if (!people) return <div className="skeleton" style={{ height: 160 }} />;

  return (
    <div style={{ maxWidth: 760 }}>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Access</th>{canManage && <th />}</tr></thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600 }}>{people.owner.name}</td>
            <td>{people.owner.email}</td>
            <td><span className="badge badge-info">Owner</span></td>
            {canManage && <td />}
          </tr>
          {people.members.map((m) => (
            <tr key={m.teacher_id}>
              <td style={{ fontWeight: 600 }}>{m.name}</td>
              <td>{m.email}</td>
              <td>
                {canManage ? (
                  <select className="select" aria-label={`Access for ${m.name}`} value={m.role} disabled={busy}
                    onChange={(e) => act(() => membersAPI.put(courseId, m.email, e.target.value as MemberRole), `${m.name} is now a ${ROLE_LABEL[e.target.value as MemberRole].toLowerCase()}.`)}>
                    <option value="co_teacher">Co-teacher</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : <span className="badge badge-neutral">{ROLE_LABEL[m.role]}</span>}
              </td>
              {canManage && (
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: 6 }} disabled={busy}
                    onClick={() => act(() => membersAPI.remove(courseId, m.teacher_id), `${m.name} no longer has access.`)}>
                    <Trash2 size={16} /><span className="visually-hidden">Remove {m.name}</span>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {people.members.length === 0 && <p style={{ color: "var(--pencil)", marginTop: 10 }}>Only the owner has access to this course.</p>}

      {canManage ? (
        <form className="card" style={{ padding: 16, marginTop: 20 }}
          onSubmit={(e) => { e.preventDefault(); act(() => membersAPI.put(courseId, email, role), `Shared with ${email}.`).then(() => setEmail("")); }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 10 }}>Share this course</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: 8, alignItems: "end" }}>
            <label className="field" style={{ marginTop: 0 }}>
              Teacher&apos;s email
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              Access
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                <option value="co_teacher">Co-teacher</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy}><UserPlus size={16} /> Share</button>
          </div>
          <p style={{ color: "var(--pencil)", fontSize: "0.85rem", marginTop: 8 }}>{ROLE_HELP[role]}. They need an OptiTeach account.</p>
        </form>
      ) : (
        <p style={{ color: "var(--pencil)", marginTop: 16 }}>Only the course owner can change who has access.</p>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} style={{ marginTop: 10, fontWeight: 600, color: message.tone === "error" ? "var(--redpen)" : "var(--tick)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
