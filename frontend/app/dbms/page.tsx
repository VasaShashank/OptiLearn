"use client";

import { useEffect, useState } from "react";
import {
  Database, Table2, Play, Clock, Key, Link2, CheckCircle2,
  ChevronRight, ChevronDown, Server, Layers, Code, Zap,
} from "lucide-react";
import { dbmsAPI, coursesAPI } from "@/lib/api";
import type { TableSchemaInfo, QueryDemoResult, TableColumn } from "@/lib/types";

type QueryMeta = { id: string; title: string; category: string; purpose: string };

export default function DBMSInsightsPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<TableSchemaInfo[]>([]);
  const [queries, setQueries] = useState<QueryMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryDemoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [courseId, setCourseId] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [s, sc, q, courses] = await Promise.all([
          dbmsAPI.getStatus(),
          dbmsAPI.getSchema().catch(() => []),
          dbmsAPI.listQueries().catch(() => []),
          coursesAPI.list().catch(() => []),
        ]);
        setStatus(s);
        setSchema(sc);
        setQueries(q);
        if (courses.length > 0) setCourseId(courses[0].id);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const executeQuery = async (queryId: string) => {
    setSelectedQuery(queryId);
    setExecuting(true);
    try {
      const result = await dbmsAPI.executeQuery(queryId, courseId || undefined);
      setQueryResult(result);
    } catch { /* ignore */ }
    setExecuting(false);
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 300, height: 32, marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: "var(--radius-lg)" }} />)}
        </div>
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius-lg)" }} />
      </div>
    );
  }

  const tableInfo = schema.find((t) => t.table_name === selectedTable);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          <Database size={24} style={{ display: "inline", verticalAlign: "middle", marginRight: 8, color: "var(--accent-cyan)" }} />
          DBMS Academic Showcase
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
          Relational schema inspector, normalization analysis, and live demonstration queries
        </p>
      </div>

      {/* Status Cards */}
      {status && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }} className="animate-fade-in-up">
          <StatusCard label="Relational DB" value={String(status.relational_dialect || "unknown").toUpperCase()} connected={!!status.relational_connected} icon={<Server size={18} />} />
          <StatusCard label="NoSQL Engine" value={String(status.nosql_mode || "unknown")} connected={!!status.nosql_connected} icon={<Layers size={18} />} />
          <StatusCard label="Tables" value={schema.length.toString()} connected={true} icon={<Table2 size={18} />} />
          <StatusCard label="Demo Queries" value={String(status.total_demonstration_queries || queries.length)} connected={true} icon={<Code size={18} />} />
        </div>
      )}

      {/* Two Column: Schema + Queries */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Schema Explorer */}
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Table2 size={18} style={{ color: "var(--accent-purple)" }} />
            Relational Schema ({schema.length} tables)
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {schema.map((table) => (
              <div key={table.table_name} className="card" style={{ overflow: "hidden" }}>
                <div
                  onClick={() => setSelectedTable(selectedTable === table.table_name ? null : table.table_name)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}
                >
                  {selectedTable === table.table_name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Table2 size={14} style={{ color: "var(--accent-cyan)" }} />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{table.table_name}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: "auto", fontSize: "0.5625rem" }}>{table.columns.length} cols</span>
                </div>
                {selectedTable === table.table_name && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 8 }}>{table.description}</div>
                    <div style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", background: "rgba(99,102,241,0.06)", fontSize: "0.6875rem", color: "var(--accent-blue)", marginBottom: 10, display: "inline-block" }}>
                      {table.normal_form}
                    </div>
                    <table className="data-table" style={{ fontSize: "0.75rem" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "8px 10px", fontSize: "0.625rem" }}>Column</th>
                          <th style={{ padding: "8px 10px", fontSize: "0.625rem" }}>Type</th>
                          <th style={{ padding: "8px 10px", fontSize: "0.625rem" }}>PK</th>
                          <th style={{ padding: "8px 10px", fontSize: "0.625rem" }}>FK</th>
                          <th style={{ padding: "8px 10px", fontSize: "0.625rem" }}>Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((col: TableColumn) => (
                          <tr key={col.name}>
                            <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontWeight: col.primary_key ? 700 : 400, color: col.primary_key ? "var(--accent-amber)" : col.foreign_key ? "var(--accent-cyan)" : "var(--text-secondary)" }}>
                              {col.primary_key && <Key size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />}
                              {col.foreign_key && <Link2 size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />}
                              {col.name}
                            </td>
                            <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--text-muted)" }}>{col.type}</td>
                            <td style={{ padding: "6px 10px" }}>{col.primary_key ? <CheckCircle2 size={12} style={{ color: "var(--accent-amber)" }} /> : "–"}</td>
                            <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--accent-cyan)" }}>{col.foreign_key || "–"}</td>
                            <td style={{ padding: "6px 10px", fontSize: "0.6875rem" }}>{col.nullable ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Queries */}
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Code size={18} style={{ color: "var(--accent-emerald)" }} />
            Demonstration Queries ({queries.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {queries.map((q) => (
              <div
                key={q.id}
                className="card"
                style={{
                  padding: 14, cursor: "pointer",
                  borderColor: selectedQuery === q.id ? "var(--brand-start)" : "var(--border-default)",
                  background: selectedQuery === q.id ? "rgba(99,102,241,0.06)" : "var(--bg-card)",
                }}
                onClick={() => executeQuery(q.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{q.title}</span>
                  <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "0.6875rem" }}>
                    <Play size={12} /> Run
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="badge badge-neutral" style={{ fontSize: "0.5625rem" }}>{q.category}</span>
                </div>
                <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 4 }}>{q.purpose}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Query Result */}
      {queryResult && (
        <div className="animate-fade-in-up" style={{ marginTop: 24 }}>
          <div className="glass-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>{queryResult.title}</h3>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <span className="badge badge-neutral">{queryResult.category}</span>
                  <span className="badge badge-success">{queryResult.row_count} rows</span>
                  <span className="badge badge-info">
                    <Clock size={10} /> {queryResult.execution_time_ms}ms
                  </span>
                </div>
              </div>
            </div>

            {/* SQL */}
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>SQL Query</div>
              <pre className="code-block" style={{ margin: 0, maxHeight: 200, overflow: "auto" }}>
                {highlightSQL(queryResult.sql)}
              </pre>
            </div>

            {/* Results Table */}
            {queryResult.rows.length > 0 ? (
              <div style={{ overflow: "auto", maxHeight: 400 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {queryResult.columns.map((col) => (
                        <th key={col} style={{ fontFamily: "var(--font-mono)" }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, i) => (
                      <tr key={i}>
                        {queryResult.columns.map((col) => (
                          <td key={col} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                            {row[col] != null ? String(row[col]) : <span style={{ color: "var(--text-muted)" }}>NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                No rows returned
              </div>
            )}
          </div>
        </div>
      )}

      {executing && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
          <div className="spinner" />
          <span style={{ color: "var(--text-secondary)" }}>Executing query...</span>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, connected, icon }: { label: string; value: string; connected: boolean; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ color: connected ? "var(--accent-emerald)" : "var(--text-muted)" }}>{icon}</div>
        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#34d399" : "#fb7185", marginLeft: "auto" }} />
      </div>
      <div style={{ fontSize: "1rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function highlightSQL(sql: string): React.ReactNode {
  // Simple keyword highlighting
  const keywords = /\b(SELECT|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ON|WHERE|AND|OR|GROUP|BY|HAVING|ORDER|ASC|DESC|AS|COUNT|SUM|AVG|MAX|MIN|ROUND|COALESCE|CASE|WHEN|THEN|END|DISTINCT|IN|NOT|NULL|LIKE|BETWEEN|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|CONSTRAINT|PRIMARY|FOREIGN|KEY|REFERENCES|CASCADE|SET|INTO|VALUES)\b/gi;
  const parts = sql.split(keywords);
  return parts.map((part, i) => {
    if (keywords.test(part)) {
      return <span key={i} style={{ color: "#ff7b72", fontWeight: 600 }}>{part}</span>;
    }
    // Check for strings
    if (part.includes("'")) {
      return <span key={i} style={{ color: "#a5d6ff" }}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
