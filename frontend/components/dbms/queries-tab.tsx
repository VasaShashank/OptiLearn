"use client";

import { useMemo, useState } from "react";
import { Clock, Code, Gauge, Play } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import type { QueryDemoResult, QueryMeta } from "@/lib/types";
import { ErrorNote, Label, Loading, ResultTable, SectionTitle, SQLBlock, errorMessage } from "./shared";

export default function QueriesTab({ queries, courseId, dialect }: { queries: QueryMeta[]; courseId: string; dialect: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<QueryDemoResult | null>(null);
  const [plan, setPlan] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"run" | "explain" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feature, setFeature] = useState<string>("all");

  const features = useMemo(() => Array.from(new Set(queries.flatMap((q) => q.sql_features))).sort(), [queries]);
  const visible = feature === "all" ? queries : queries.filter((q) => q.sql_features.includes(feature));

  const run = async (id: string) => {
    setSelected(id);
    setBusy("run");
    setError(null);
    setPlan(null);
    try {
      setResult(await dbmsAPI.executeQuery(id, courseId));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    }
    setBusy(null);
  };

  const explain = async () => {
    if (!selected) return;
    setBusy("explain");
    setError(null);
    try {
      setPlan((await dbmsAPI.explainQuery(selected, courseId)).plan);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(null);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 400px) 1fr", gap: 24, alignItems: "start" }}>
      <div>
        <SectionTitle icon={<Code size={18} style={{ color: "var(--accent-emerald)" }} />} title={`Demonstration queries (${queries.length})`} />
        <select className="select" value={feature} onChange={(e) => setFeature(e.target.value)} style={{ width: "100%", marginBottom: 12 }} aria-label="Filter by SQL feature">
          <option value="all">All SQL features</option>
          {features.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "70vh", overflow: "auto", paddingRight: 4 }}>
          {visible.map((q) => {
            const unavailable = q.requires && q.requires !== dialect;
            return (
              <button
                key={q.id}
                type="button"
                className="card"
                onClick={() => run(q.id)}
                style={{
                  padding: 14, textAlign: "left", cursor: "pointer", color: "inherit", width: "100%",
                  borderColor: selected === q.id ? "var(--brand-start)" : undefined,
                  background: selected === q.id ? "var(--ink-wash)" : undefined,
                  opacity: unavailable ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{q.title}</span>
                  <Play size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {q.sql_features.map((f) => <span key={f} className="badge badge-purple" style={{ fontSize: "0.8rem" }}>{f}</span>)}
                  {q.requires && <span className="badge badge-warning" style={{ fontSize: "0.8rem" }}>{q.requires} only</span>}
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 6 }}>{q.purpose}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {!selected && (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: "0.93rem" }}>
            Pick a query to run it against the selected course. Every query is parameterized: the course ID is bound, never concatenated.
          </div>
        )}
        {busy === "run" && <Loading label="Executing query…" />}
        {error && <ErrorNote message={error} />}
        {result && busy !== "run" && (
          <div className="glass-card animate-fade-in" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>{result.title}</h3>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <span className="badge badge-success">{result.row_count} {result.row_count === 1 ? "row" : "rows"}</span>
                  <span className="badge badge-info"><Clock size={10} /> {result.execution_time_ms} ms</span>
                </div>
              </div>
              {dialect === "postgresql" && (
                <button type="button" className="btn btn-secondary" onClick={explain} disabled={busy !== null} style={{ fontSize: "0.9rem" }}>
                  <Gauge size={14} /> {busy === "explain" ? "Analyzing…" : "EXPLAIN ANALYZE"}
                </button>
              )}
            </div>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)" }}>
              <Label>SQL</Label>
              <SQLBlock sql={result.sql} />
            </div>
            {plan && (
              <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)" }}>
                <Label>Executed plan (actual times, buffers, index use)</Label>
                <pre className="code-block" style={{ margin: 0, maxHeight: 320, overflow: "auto" }}>
                  {plan.map((line, i) => (
                    <div key={i} style={{ color: /Index|Bitmap/.test(line) ? "var(--tick)" : /Seq Scan/.test(line) ? "var(--caution)" : undefined }}>{line}</div>
                  ))}
                </pre>
              </div>
            )}
            <ResultTable columns={result.columns} rows={result.rows} />
          </div>
        )}
      </div>
    </div>
  );
}
