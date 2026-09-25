"use client";

import { useEffect, useState } from "react";
import { Code, Database, Layers, Server, Table2 } from "lucide-react";
import { coursesAPI, dbmsAPI } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { Course, QueryMeta, TableSchemaInfo } from "@/lib/types";
import SchemaTab from "@/components/dbms/schema-tab";
import ERDiagramTab from "@/components/dbms/er-diagram-tab";
import NormalizationTab from "@/components/dbms/normalization-tab";
import QueriesTab from "@/components/dbms/queries-tab";
import ObjectsTab from "@/components/dbms/objects-tab";
import ConsoleTab from "@/components/dbms/console-tab";
import TransactionsTab from "@/components/dbms/transactions-tab";
import NoSQLTab from "@/components/dbms/nosql-tab";
import AuditTab from "@/components/dbms/audit-tab";

const TABS = [
  { id: "schema", label: "Schema", pgOnly: false },
  { id: "er", label: "ER Diagram", pgOnly: false },
  { id: "normalization", label: "Normalization", pgOnly: false },
  { id: "queries", label: "SQL Queries", pgOnly: false },
  { id: "objects", label: "Database Objects", pgOnly: true },
  { id: "console", label: "SQL Console", pgOnly: true },
  { id: "transactions", label: "Transactions", pgOnly: true },
  { id: "nosql", label: "MongoDB", pgOnly: false },
  { id: "audit", label: "Audit & Consistency", pgOnly: false },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function DBMSInsightsPage() {
  const { user } = useSession();
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<TableSchemaInfo[]>([]);
  const [queries, setQueries] = useState<QueryMeta[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [tab, setTab] = useState<TabId>("schema");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dbmsAPI.getStatus().catch(() => null),
      dbmsAPI.getSchema().catch(() => []),
      dbmsAPI.listQueries().catch(() => []),
      coursesAPI.list().catch(() => []),
    ]).then(([s, sc, q, c]) => {
      setStatus(s);
      setSchema(sc);
      setQueries(q);
      setCourses(c);
      if (c.length > 0) setCourseId(c[0].id);
      setLoading(false);
    });
  }, []);

  const dialect = String(status?.relational_dialect || "unknown");
  const isPostgres = dialect === "postgresql";

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 300, height: 32, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius-lg)" }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={24} style={{ color: "var(--accent-cyan)" }} /> DBMS Showcase
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 4 }}>
            Schema, normalization, SQL, server-side objects, security, transactions and the document store, all live.
          </p>
        </div>
        {courses.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Course
            <select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          </label>
        )}
      </div>

      {status && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <StatusCard label="Relational DB" value={dialect.toUpperCase()} ok={!!status.relational_connected} icon={<Server size={16} />} />
          <StatusCard label="Document store" value={String(status.nosql_mode || "unknown")} ok={!!status.nosql_connected} icon={<Layers size={16} />} />
          <StatusCard label="Tables" value={String(schema.length)} ok icon={<Table2 size={16} />} />
          <StatusCard label="Demo queries" value={String(queries.length)} ok icon={<Code size={16} />} />
        </div>
      )}

      {!isPostgres && (
        <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: "0.8125rem", color: "#fbbf24" }}>
          The API is running on the {dialect} fallback. Views, triggers, roles, row-level security and the Transaction Lab need PostgreSQL.
        </div>
      )}

      <div className="tab-list" role="tablist" style={{ marginBottom: 24, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}
            disabled={t.pgOnly && !isPostgres} title={t.pgOnly && !isPostgres ? "Requires PostgreSQL" : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schema" && <SchemaTab schema={schema} />}
      {tab === "er" && <ERDiagramTab />}
      {tab === "normalization" && <NormalizationTab />}
      {tab === "queries" && <QueriesTab queries={queries} courseId={courseId} dialect={dialect} />}
      {tab === "objects" && <ObjectsTab />}
      {tab === "console" && <ConsoleTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "nosql" && <NoSQLTab courseId={courseId} />}
      {tab === "audit" && <AuditTab courseId={courseId} dialect={dialect} isAdmin={user?.role === "admin"} />}
    </div>
  );
}

function StatusCard({ label, value, ok, icon }: { label: string; value: string; ok: boolean; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: ok ? "var(--accent-emerald)" : "var(--text-muted)" }}>{icon}</span>
        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
        <span aria-label={ok ? "connected" : "disconnected"} style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? "#34d399" : "#fb7185", marginLeft: "auto" }} />
      </div>
      <div style={{ fontSize: "0.9375rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}
