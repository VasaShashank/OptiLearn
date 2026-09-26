"use client";

import { useEffect, useState } from "react";
import { Boxes, ShieldCheck } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import type { DatabaseObjects } from "@/lib/types";
import { ErrorNote, Loading, SectionTitle, SQLBlock, errorMessage } from "./shared";

type Section = "views" | "routines" | "triggers" | "policies" | "indexes" | "roles";

const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  { id: "views", label: "Views", blurb: "Stored queries. The three plain views run with security_invoker, so row-level security applies through them; the materialized view stores its result and is refreshed CONCURRENTLY." },
  { id: "routines", label: "Functions & procedures", blurb: "Server-side logic: trigger functions, set-returning functions and a stored procedure. Every routine pins its search_path; SECURITY DEFINER marks those that run with the owner's rights." },
  { id: "triggers", label: "Triggers", blurb: "Row-level triggers that keep derived data right and record an audit trail no matter which client writes." },
  { id: "policies", label: "Row-level security", blurb: "Policies applied to the read-only console role. Child tables defer to their parent's visibility through sub-selects." },
  { id: "indexes", label: "Indexes", blurb: "Primary/unique indexes back constraints; the rest serve foreign-key joins. Partial indexes cover only the rows a query needs. Scans come from pg_stat_user_indexes." },
  { id: "roles", label: "Roles & privileges", blurb: "Least privilege: the API's login can only read and write data; the console role can only read, and never sees password hashes." },
];

export default function ObjectsTab() {
  const [objects, setObjects] = useState<DatabaseObjects | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("triggers");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    dbmsAPI.getObjects().then(setObjects).catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!objects) return <Loading label="Reading the system catalogs…" />;

  const current = SECTIONS.find((s) => s.id === section)!;
  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  return (
    <div>
      <SectionTitle
        icon={<Boxes size={18} style={{ color: "var(--accent-amber)" }} />}
        title="Server-side database objects"
        subtitle="Read live from pg_catalog / information_schema, including definitions."
      />
      <div className="tab-list" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`tab ${section === s.id ? "active" : ""}`} onClick={() => setSection(s.id)}>
            {s.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{objects[s.id].length}</span>
          </button>
        ))}
      </div>
      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 16 }}>{current.blurb}</p>

      {section === "roles" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {objects.roles.map((r) => (
            <div key={r.name} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <ShieldCheck size={16} style={{ color: "var(--accent-emerald)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{r.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <span className={`badge ${r.can_login ? "badge-info" : "badge-neutral"}`}>{r.can_login ? "LOGIN" : "NOLOGIN"}</span>
                <span className={`badge ${r.bypass_rls ? "badge-warning" : "badge-success"}`}>{r.bypass_rls ? "BYPASSRLS" : "subject to RLS"}</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {r.table_privileges} on {r.tables_granted} tables/views
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "indexes" && (
        <div className="card" style={{ overflow: "auto", maxHeight: "65vh" }}>
          <table className="data-table">
            <thead><tr><th>Index</th><th>Table</th><th>Kind</th><th>Scans</th><th>Definition</th></tr></thead>
            <tbody>
              {objects.indexes.map((ix) => (
                <tr key={ix.name}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{ix.name}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{ix.table_name}</td>
                  <td>
                    {ix.is_primary ? <span className="badge badge-warning">primary</span>
                      : ix.is_unique ? <span className="badge badge-info">unique</span>
                      : <span className="badge badge-neutral">btree</span>}
                    {ix.is_partial && <span className="badge badge-purple" style={{ marginLeft: 4 }}>partial</span>}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{ix.scans}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{ix.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(section === "views" || section === "routines" || section === "triggers" || section === "policies") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {section === "views" && objects.views.map((v) => (
            <ObjectCard key={v.name} title={v.name} badges={[v.kind]} open={expanded === v.name} onToggle={() => toggle(v.name)} sql={v.definition} />
          ))}
          {section === "routines" && objects.routines.map((r) => (
            <ObjectCard
              key={`${r.name}(${r.arguments})`}
              title={`${r.name}(${r.arguments})`}
              subtitle={`returns ${r.returns}`}
              badges={[r.kind, r.language, ...(r.security_definer ? ["SECURITY DEFINER"] : [])]}
              open={expanded === r.name} onToggle={() => toggle(r.name)} sql={r.definition}
            />
          ))}
          {section === "triggers" && objects.triggers.map((t) => (
            <ObjectCard key={`${t.table_name}.${t.name}`} title={t.name} subtitle={`on ${t.table_name} → ${t.function_name}()`} badges={[]}
              open={expanded === t.name} onToggle={() => toggle(t.name)} sql={t.definition} />
          ))}
          {section === "policies" && objects.policies.map((p) => (
            <ObjectCard key={`${p.table_name}.${p.name}`} title={`${p.table_name}.${p.name}`} subtitle={`FOR ${p.command} TO ${p.roles}`} badges={[]}
              open={expanded === p.table_name} onToggle={() => toggle(p.table_name)} sql={`USING (${p.using_expression})`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectCard({ title, subtitle, badges, open, onToggle, sql }: {
  title: string; subtitle?: string; badges: string[]; open: boolean; onToggle: () => void; sql: string;
}) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", fontWeight: 600 }}>{title}</span>
        {subtitle && <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{subtitle}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {badges.map((b) => <span key={b} className={`badge ${b === "SECURITY DEFINER" ? "badge-warning" : "badge-neutral"}`} style={{ fontSize: "0.8rem" }}>{b}</span>)}
        </span>
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}><SQLBlock sql={sql} maxHeight={420} /></div>}
    </div>
  );
}
