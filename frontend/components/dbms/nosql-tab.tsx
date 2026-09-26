"use client";

import { useEffect, useState } from "react";
import { GitCompare, Leaf, Play } from "lucide-react";
import { coursesAPI, dbmsAPI } from "@/lib/api";
import type { AggregationMeta, AggregationResult, GraphDiff, GraphVersion } from "@/lib/types";
import { ErrorNote, Label, Loading, ResultTable, SectionTitle, errorMessage } from "./shared";

const COLLECTIONS = [
  {
    name: "lesson_plan_documents",
    why: "Nested phases and lists, read and written as a unit, with every save kept as an immutable version. PostgreSQL keeps the pointer, status and version number (optimistic lock).",
    guards: "$jsonSchema validator · unique partial index (lesson_plan_id, version)",
  },
  {
    name: "curriculum_graphs",
    why: "A whole-graph snapshot per curriculum confirmation, so any two versions can be compared. The live, queryable graph stays relational (concepts + prerequisites).",
    guards: "$jsonSchema validator · unique partial index (course_id, version)",
  },
  {
    name: "nlp_extractions",
    why: "Raw extractor output whose shape changes with the extractor. Drafts that are never confirmed expire on their own.",
    guards: "$jsonSchema validator · TTL index (90 days) on extracted_at",
  },
];

export default function NoSQLTab({ courseId }: { courseId: string }) {
  const [aggs, setAggs] = useState<AggregationMeta[]>([]);
  const [result, setResult] = useState<AggregationResult | null>(null);
  const [versions, setVersions] = useState<GraphVersion[]>([]);
  const [diff, setDiff] = useState<GraphDiff | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbmsAPI.listAggregations().then(setAggs).catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setResult(null);
    setDiff(null);
    coursesAPI.listGraphVersions(courseId).then((v) => {
      setVersions(v);
      if (v.length >= 2) setRange({ from: v[1].version, to: v[0].version });
      else setRange(null);
    }).catch((err) => setError(errorMessage(err)));
  }, [courseId]);

  const runAgg = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await dbmsAPI.runAggregation(id, courseId));
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  const compare = async () => {
    if (!range) return;
    try {
      setDiff(await coursesAPI.diffGraphVersions(courseId, range.from, range.to));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <SectionTitle
          icon={<Leaf size={18} style={{ color: "var(--accent-emerald)" }} />}
          title="MongoDB: what lives here and why"
          subtitle="PostgreSQL is the source of truth for academic state. MongoDB holds artifacts that are nested, versioned or shape-changing and are read whole. The document store still enforces a contract."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {COLLECTIONS.map((c) => (
            <div key={c.name} className="card" style={{ padding: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>{c.name}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>{c.why}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--accent-cyan)" }}>{c.guards}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle icon={<Play size={16} style={{ color: "var(--accent-purple)" }} />} title="Aggregation pipelines" subtitle="MongoDB's counterpart to the SQL demos, run against the selected course." />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {aggs.map((a) => (
              <button key={a.id} type="button" className="card" onClick={() => runAgg(a.id)}
                style={{ padding: 12, textAlign: "left", color: "inherit", cursor: "pointer", borderColor: result?.id === a.id ? "var(--brand-start)" : undefined }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 6px" }}>{a.purpose}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {a.stages.map((s, i) => <span key={i} className="badge badge-neutral" style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>{s}</span>)}
                </div>
              </button>
            ))}
          </div>
          <div style={{ minWidth: 0 }}>
            {busy && <Loading label="Running pipeline…" />}
            {error && <ErrorNote message={error} />}
            {result && !busy && (
              <div className="glass-card animate-fade-in" style={{ overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)" }}>db.{result.collection}.aggregate()</span>
                    <span className="badge badge-success">{result.row_count} documents</span>
                  </div>
                  <Label>Pipeline</Label>
                  <pre className="code-block" style={{ margin: 0, maxHeight: 260, overflow: "auto" }}>{JSON.stringify(result.pipeline, null, 2)}</pre>
                </div>
                <ResultTable columns={Array.from(new Set(result.rows.flatMap((r) => Object.keys(r))))} rows={result.rows} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <SectionTitle icon={<GitCompare size={16} style={{ color: "var(--accent-amber)" }} />} title={`Curriculum graph versions (${versions.length})`}
          subtitle="Every curriculum confirmation appends an immutable snapshot. Concept IDs are regenerated on confirmation, so versions are compared by concept name." />
        <div className="card" style={{ overflow: "auto", marginBottom: 12 }}>
          <table className="data-table">
            <thead><tr><th>Version</th><th>Reason</th><th>Concepts</th><th>Prerequisites</th><th>Created</th></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td style={{ fontFamily: "var(--font-mono)" }}>v{v.version}</td>
                  <td>{v.reason}</td>
                  <td>{v.stats.concepts}</td>
                  <td>{v.stats.edges}</td>
                  <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{new Date(v.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {range && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <select className="select" aria-label="From version" value={range.from} onChange={(e) => setRange({ ...range, from: Number(e.target.value) })}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </select>
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <select className="select" aria-label="To version" value={range.to} onChange={(e) => setRange({ ...range, to: Number(e.target.value) })}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </select>
            <button type="button" className="btn btn-secondary" onClick={compare}><GitCompare size={14} /> Compare</button>
          </div>
        )}
        {versions.length < 2 && <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Confirm the curriculum again to create a second version to compare.</p>}
        {diff && (
          <div className="card animate-fade-in" style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: "0.85rem" }}>
            <DiffList title="Concepts added" items={diff.concepts_added} tone="success" />
            <DiffList title="Concepts removed" items={diff.concepts_removed} tone="danger" />
            <DiffList title="Concepts changed" items={diff.concepts_changed.map((c) => `${c.concept}: ${Object.entries(c.changes).map(([f, d]) => `${f} ${String(d.from)}→${String(d.to)}`).join(", ")}`)} tone="warning" />
            <DiffList title="Prerequisites added" items={diff.prerequisites_added.map((e) => `${e.prerequisite} → ${e.concept}`)} tone="success" />
            <DiffList title="Prerequisites removed" items={diff.prerequisites_removed.map((e) => `${e.prerequisite} → ${e.concept}`)} tone="danger" />
          </div>
        )}
      </div>
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" | "warning" }) {
  return (
    <div>
      <Label>{title} ({items.length})</Label>
      {items.length === 0 ? <span style={{ color: "var(--text-muted)" }}>none</span> : items.map((i) => (
        <div key={i} className={`badge badge-${tone}`} style={{ display: "block", marginBottom: 4, whiteSpace: "normal" }}>{i}</div>
      ))}
    </div>
  );
}
