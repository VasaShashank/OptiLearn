"use client";

import { AlertCircle } from "lucide-react";

const SQL_KEYWORDS = [
  "SELECT", "FROM", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "LATERAL", "ON", "WHERE", "AND", "OR", "GROUP", "BY",
  "HAVING", "ORDER", "ASC", "DESC", "AS", "COUNT", "SUM", "AVG", "MAX", "MIN", "ROUND", "COALESCE", "CASE", "WHEN",
  "THEN", "ELSE", "END", "DISTINCT", "IN", "NOT", "NULL", "EXISTS", "LIKE", "BETWEEN", "INSERT", "UPDATE", "DELETE",
  "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "VIEW", "MATERIALIZED", "FUNCTION", "PROCEDURE", "TRIGGER", "RETURNS",
  "LANGUAGE", "BEGIN", "COMMIT", "ROLLBACK", "WITH", "RECURSIVE", "UNION", "ALL", "EXCEPT", "INTERSECT", "OVER",
  "PARTITION", "ROWS", "PRECEDING", "CURRENT", "ROW", "UNBOUNDED", "RANK", "ROW_NUMBER", "LAG", "LIMIT", "CAST",
  "SET", "INTO", "VALUES", "RETURNING", "EXPLAIN", "ANALYZE", "FILTER", "IS", "DISTINCT", "SECURITY", "DEFINER",
  "POLICY", "USING", "FOR", "EACH", "EXECUTE", "IF", "RAISE", "EXCEPTION", "DECLARE", "PERFORM", "CALL",
];
// Built once; split() with a capturing group keeps the keywords as separate parts
const KEYWORD_SPLIT = new RegExp(`\\b(${SQL_KEYWORDS.join("|")})\\b`, "i");
const KEYWORD_SET = new Set(SQL_KEYWORDS);

export function SQLBlock({ sql, maxHeight = 260 }: { sql: string; maxHeight?: number }) {
  const parts = sql.split(new RegExp(KEYWORD_SPLIT.source, "gi"));
  return (
    <pre className="code-block" style={{ margin: 0, maxHeight, overflow: "auto", whiteSpace: "pre-wrap" }}>
      {parts.map((part, i) =>
        KEYWORD_SET.has(part.toUpperCase()) ? (
          <span key={i} className="keyword" style={{ fontWeight: 600 }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </pre>
  );
}

export function ResultTable({ columns, rows, maxHeight = 420 }: {
  columns: string[];
  rows: Record<string, unknown>[];
  maxHeight?: number;
}) {
  if (rows.length === 0) {
    return <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>No rows returned</div>;
  }
  return (
    <div style={{ overflow: "auto", maxHeight }}>
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c} style={{ fontFamily: "var(--font-mono)" }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", whiteSpace: "pre-wrap", maxWidth: 420 }}>
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span style={{ color: "var(--text-muted)" }}>NULL</span>;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SectionTitle({ icon, title, subtitle, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>{icon}{title}</h2>
        {subtitle && <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: 4, maxWidth: 820 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="card" style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start", borderColor: "var(--redpen)" }}>
      <AlertCircle size={16} style={{ color: "var(--redpen)", flexShrink: 0, marginTop: 2 }} />
      <span style={{ fontSize: "0.9rem", color: "var(--redpen)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>{message}</span>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
      <div className="spinner" />
      <span style={{ color: "var(--text-secondary)", fontSize: "0.93rem" }}>{label}</span>
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}
