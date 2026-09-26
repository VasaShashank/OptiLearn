"use client";

import { useState } from "react";
import { Play, ShieldAlert, Terminal } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import type { ConsoleResult } from "@/lib/types";
import { ErrorNote, ResultTable, SectionTitle, errorMessage } from "./shared";

const PRESETS: { label: string; sql: string; attack?: boolean }[] = [
  { label: "My courses", sql: "SELECT code, title, semester, total_available_minutes FROM courses" },
  { label: "Weakest concepts (view)", sql: "SELECT concept_name, avg_score, downstream_count, mastery_status\nFROM v_concept_mastery\nWHERE mastery_status IN ('weak', 'bottleneck')\nORDER BY avg_score" },
  { label: "Prerequisite chain (function)", sql: "SELECT * FROM fn_prerequisite_chain(\n  (SELECT id FROM concepts WHERE name LIKE 'Boyce-Codd%' LIMIT 1)\n)" },
  { label: "Plan for upcoming sessions", sql: "EXPLAIN SELECT * FROM class_sessions WHERE status = 'scheduled' ORDER BY session_number" },
  { label: "Read password hashes", sql: "SELECT email, hashed_password FROM users", attack: true },
  { label: "Pretend to be admin", sql: "SELECT set_config('app.is_admin', 'true', true), code FROM courses", attack: true },
  { label: "Delete inside a CTE", sql: "WITH gone AS (DELETE FROM courses RETURNING id)\nSELECT * FROM gone", attack: true },
  { label: "Two statements", sql: "SELECT 1; DROP TABLE courses", attack: true },
];

export default function ConsoleTab() {
  const [sql, setSql] = useState(PRESETS[0].sql);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await dbmsAPI.runConsole(sql));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <div>
      <SectionTitle
        icon={<Terminal size={18} style={{ color: "var(--accent-cyan)" }} />}
        title="Read-only SQL console"
        subtitle="Each statement runs in a READ ONLY transaction after SET LOCAL ROLE optiteach_readonly. Row-level security limits every table to your own courses, column privileges hide password hashes, and a 3-second statement timeout applies. The transaction is always rolled back."
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={`btn ${p.attack ? "btn-danger" : "btn-ghost"}`}
            style={{ fontSize: "0.85rem", padding: "4px 10px" }} onClick={() => { setSql(p.sql); setResult(null); setError(null); }}>
            {p.attack && <ShieldAlert size={12} />} {p.label}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }}
        spellCheck={false}
        aria-label="SQL statement"
        style={{ width: "100%", minHeight: 140, fontFamily: "var(--font-mono)", fontSize: "0.9rem", resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 16px" }}>
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !sql.trim()}>
          <Play size={14} /> {busy ? "Running…" : "Run"}
        </button>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Ctrl + Enter</span>
      </div>

      {error && (
        <div>
          <ErrorNote message={error} />
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 8 }}>
            Refused. Errors starting with <code>ERROR:</code> come from PostgreSQL itself (privileges, read-only transaction, timeout); the others come from the API&apos;s single-statement allow-list.
          </p>
        </div>
      )}
      {result && (
        <div className="glass-card animate-fade-in" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="badge badge-success">{result.row_count} rows{result.truncated ? " (truncated)" : ""}</span>
            <span className="badge badge-info">{result.execution_time_ms} ms</span>
            <span className="badge badge-purple">as {result.executed_as}</span>
            <span className="badge badge-neutral">{result.scope}</span>
          </div>
          <ResultTable columns={result.columns} rows={result.rows} />
        </div>
      )}
    </div>
  );
}
