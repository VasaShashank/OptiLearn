"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import type { ConsistencyReport, QueryDemoResult } from "@/lib/types";
import { ErrorNote, Loading, ResultTable, SectionTitle, errorMessage } from "./shared";

export default function AuditTab({ courseId, dialect, isAdmin }: { courseId: string; dialect: string; isAdmin: boolean }) {
  const [audit, setAudit] = useState<QueryDemoResult | null>(null);
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [scope, setScope] = useState<"course" | "all">("course");
  const [repairResult, setRepairResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(() => {
    if (dialect !== "postgresql" || !courseId) return;
    dbmsAPI.executeQuery("q19_audit_trail", courseId).then(setAudit).catch((err) => setError(errorMessage(err)));
  }, [courseId, dialect]);

  const check = useCallback(() => {
    setReport(null);
    dbmsAPI.consistency(scope === "course" ? courseId : undefined).then(setReport).catch((err) => setError(errorMessage(err)));
  }, [courseId, scope]);

  useEffect(loadAudit, [loadAudit]);
  useEffect(() => { if (courseId) check(); }, [check, courseId]);

  const repair = async () => {
    try {
      setRepairResult(await dbmsAPI.repairConsistency());
      check();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const issues = report ? [
    ...report.dangling_pointers.map((d) => ({ kind: "Dangling SQL pointer", detail: `lesson plan ${d.lesson_plan_id} → missing document ${d.missing_document_id}` })),
    ...report.orphan_documents.map((o) => ({ kind: "Orphan document", detail: `${o.document_id} (${o.reason})` })),
    ...report.orphan_graph_snapshots.map((o) => ({ kind: "Orphan graph snapshots", detail: `course ${o.course_id} no longer exists` })),
    ...report.stale_graph_snapshots.map((s) => ({ kind: "Stale graph snapshot", detail: `SQL has ${s.sql_concepts} concepts, latest snapshot ${s.snapshot_concepts ?? "none"}` })),
  ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {error && <ErrorNote message={error} />}

      <div>
        <SectionTitle
          icon={<History size={18} style={{ color: "var(--accent-amber)" }} />}
          title="Audit trail"
          subtitle="Written by the fn_audit_row_change() trigger on every INSERT/UPDATE/DELETE of core tables, with the acting user taken from the transaction's app.user_id setting. The API's database role cannot modify this table; only the SECURITY DEFINER trigger can append to it."
          action={dialect === "postgresql" && <button type="button" className="btn btn-ghost" onClick={loadAudit}><RefreshCw size={14} /> Refresh</button>}
        />
        {dialect !== "postgresql" ? (
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>The audit trail is maintained by PostgreSQL triggers; the API is currently on {dialect}.</p>
        ) : audit ? (
          <div className="card" style={{ overflow: "hidden" }}><ResultTable columns={audit.columns} rows={audit.rows} maxHeight={360} /></div>
        ) : <Loading label="Loading audit rows…" />}
      </div>

      <div>
        <SectionTitle
          icon={<ShieldCheck size={18} style={{ color: "var(--accent-emerald)" }} />}
          title="Cross-store consistency"
          subtitle="PostgreSQL and MongoDB share no transaction and no foreign keys, so drift is possible, e.g. a course delete cascades in SQL but leaves its documents behind. This compares both sides."
          action={
            <div style={{ display: "flex", gap: 8 }}>
              {isAdmin && (
                <select className="select" aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value as "course" | "all")}>
                  <option value="course">This course</option>
                  <option value="all">All courses</option>
                </select>
              )}
              <button type="button" className="btn btn-ghost" onClick={check}><RefreshCw size={14} /> Check</button>
              {isAdmin && <button type="button" className="btn btn-secondary" onClick={repair}><Wrench size={14} /> Repair</button>}
            </div>
          }
        />
        {!report ? <Loading label="Comparing stores…" /> : (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: issues.length ? 12 : 0, flexWrap: "wrap" }}>
              <span className={`badge ${report.consistent ? "badge-success" : "badge-danger"}`}>{report.consistent ? "Consistent" : `${issues.length} issue(s)`}</span>
              <span className="badge badge-neutral">{report.lesson_plans_checked} lesson plans checked</span>
              <span className="badge badge-neutral">scope: {scope === "course" ? "this course" : "all courses"}</span>
            </div>
            {issues.length > 0 && (
              <table className="data-table">
                <tbody>{issues.map((i, n) => <tr key={n}><td style={{ width: 200 }}>{i.kind}</td><td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{i.detail}</td></tr>)}</tbody>
              </table>
            )}
            {repairResult && (
              <div style={{ marginTop: 12, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Repair: {Object.entries(repairResult).map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
