"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Play, XCircle } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import type { LabResult, LabScenario, LabStep } from "@/lib/types";
import { ErrorNote, Loading, SectionTitle, errorMessage } from "./shared";

export default function TransactionsTab() {
  const [scenarios, setScenarios] = useState<LabScenario[]>([]);
  const [result, setResult] = useState<LabResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbmsAPI.listLabScenarios().then(setScenarios).catch((err) => setError(errorMessage(err)));
  }, []);

  const run = async (id: string) => {
    setRunning(id);
    setError(null);
    try {
      setResult(await dbmsAPI.runLabScenario(id));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    }
    setRunning(null);
  };

  return (
    <div>
      <SectionTitle
        icon={<FlaskConical size={18} style={{ color: "var(--accent-rose)" }} />}
        title="Transaction Lab"
        subtitle="Each scenario opens real, separate PostgreSQL connections (T1, T2) and interleaves their statements on a scratch accounts table (A = 500, B = 300), so you can watch atomicity, isolation levels and concurrency control happen."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 20 }}>
        {scenarios.map((s) => (
          <button key={s.id} type="button" className="card" onClick={() => run(s.id)} disabled={running !== null}
            style={{ padding: 14, textAlign: "left", color: "inherit", cursor: "pointer", borderColor: result?.scenario === s.id ? "var(--brand-start)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{s.title}</span>
              <Play size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            </div>
          </button>
        ))}
      </div>

      {running && <Loading label="Running interleaved transactions…" />}
      {error && <ErrorNote message={error} />}
      {result && !running && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {result.timeline && <Timeline steps={result.timeline} />}
          {result.runs?.map((r, i) => (
            <div key={i} className="glass-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: "0.93rem" }}>{r.isolation_level || r.strategy}</span>
                {r.repeatable !== undefined && (
                  <span className={`badge ${r.repeatable ? "badge-success" : "badge-warning"}`}>
                    reads: {r.first_read} → {r.second_read} ({r.repeatable ? "repeatable" : "changed"})
                  </span>
                )}
                {r.expected !== undefined && (
                  <span className={`badge ${r.actual === r.expected ? "badge-success" : "badge-danger"}`}>
                    final A = {r.actual} (expected {r.expected}){r.actual !== r.expected ? ": update lost" : ""}
                  </span>
                )}
              </div>
              <Timeline steps={r.timeline} />
            </div>
          ))}
          <div className="card" style={{ padding: 16, borderColor: "var(--ink)" }}>
            <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{result.conclusion}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {Object.entries(result.final_balances).map(([id, bal]) => (
                <span key={id} className="badge badge-neutral" style={{ fontFamily: "var(--font-mono)" }}>{id} = {bal}</span>
              ))}
              {result.outcome && Object.entries(result.outcome).map(([t, o]) => (
                <span key={t} className={`badge ${o === "committed" ? "badge-success" : "badge-danger"}`}>{t} {o}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Timeline({ steps }: { steps: LabStep[] }) {
  const lanes = Array.from(new Set(steps.map((s) => s.txn)));
  return (
    <div className="card" style={{ overflow: "auto" }}>
      <table className="data-table" style={{ fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            {lanes.map((l) => <th key={l}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i}>
              <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
              {lanes.map((l) => (
                <td key={l} style={{ verticalAlign: "top" }}>
                  {s.txn === l && (
                    <div>
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontFamily: "var(--font-mono)" }}>
                        {s.ok ? <CheckCircle2 size={12} style={{ color: "var(--tick)", flexShrink: 0, marginTop: 2 }} />
                          : <XCircle size={12} style={{ color: "var(--redpen)", flexShrink: 0, marginTop: 2 }} />}
                        <span>{s.sql}</span>
                      </div>
                      {s.result !== null && s.result !== undefined && (
                        <div style={{ marginLeft: 18, marginTop: 2, color: s.ok ? "var(--text-secondary)" : "var(--redpen)" }}>→ {String(s.result)}</div>
                      )}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
