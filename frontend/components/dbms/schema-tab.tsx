"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Key, Link2, Table2 } from "lucide-react";
import type { TableSchemaInfo } from "@/lib/types";
import { SectionTitle } from "./shared";

export default function SchemaTab({ schema }: { schema: TableSchemaInfo[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const totalRows = schema.reduce((n, t) => n + (t.row_count || 0), 0);

  return (
    <div>
      <SectionTitle
        icon={<Table2 size={18} style={{ color: "var(--accent-purple)" }} />}
        title={`Relational schema: ${schema.length} tables, ${totalRows.toLocaleString()} rows`}
        subtitle="Read from the live database catalog. Keys, foreign keys and the normal-form justification for each table."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 8 }}>
        {schema.map((table) => (
          <div key={table.table_name} className="card" style={{ overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setOpen(open === table.table_name ? null : table.table_name)}
              aria-expanded={open === table.table_name}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", width: "100%", background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left" }}
            >
              {open === table.table_name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={{ fontSize: "0.9rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{table.table_name}</span>
              <span className="badge badge-neutral" style={{ marginLeft: "auto", fontSize: "0.8rem" }}>{table.columns.length} cols</span>
              <span className="badge badge-info" style={{ fontSize: "0.8rem" }}>{table.row_count} rows</span>
            </button>
            {open === table.table_name && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>{table.description}</div>
                <div style={{ padding: "6px 10px", borderRadius: "var(--radius-sm)", background: "var(--ink-wash)", fontSize: "0.8rem", color: "var(--accent-blue)", marginBottom: 10 }}>
                  {table.normal_form}
                </div>
                <table className="data-table" style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr><th>Column</th><th>Type</th><th>References</th><th>Null</th></tr>
                  </thead>
                  <tbody>
                    {table.columns.map((col) => (
                      <tr key={col.name}>
                        <td style={{ fontFamily: "var(--font-mono)", fontWeight: col.primary_key ? 700 : 400, color: col.primary_key ? "var(--accent-amber)" : col.foreign_key ? "var(--accent-cyan)" : "var(--text-secondary)" }}>
                          {col.primary_key && <Key size={10} style={{ display: "inline", marginRight: 4 }} aria-label="primary key" />}
                          {col.foreign_key && <Link2 size={10} style={{ display: "inline", marginRight: 4 }} aria-label="foreign key" />}
                          {col.name}
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>{col.type}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--accent-cyan)" }}>{col.foreign_key || "–"}</td>
                        <td style={{ fontSize: "0.8rem" }}>{col.nullable ? "yes" : "no"}</td>
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
  );
}
