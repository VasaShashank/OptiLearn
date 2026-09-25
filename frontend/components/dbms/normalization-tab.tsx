"use client";

import { ArrowRight, Layers } from "lucide-react";
import { Label, SectionTitle, SQLBlock } from "./shared";

const FIXES = [
  {
    title: "1NF: a list stored in one column",
    problem:
      "teacher_constraints.preferred_methods_json held a JSON array of method names. The value is not atomic, so the database could not enforce that each name is a real method, index it, or join on it — and renaming a method left stale names behind.",
    before: `teacher_constraints(id, course_id, ..., preferred_methods_json)
-- '["Worked Examples & Decomposition", "Recap & Prerequisite Revision"]'`,
    after: `teacher_preferred_methods(
    constraint_id  REFERENCES teacher_constraints(id) ON DELETE CASCADE,
    method_id      REFERENCES teaching_methods(id)    ON DELETE CASCADE,
    rank           INTEGER CHECK (rank >= 1),
    PRIMARY KEY (constraint_id, method_id),
    UNIQUE (constraint_id, rank)
)`,
    migration: `INSERT INTO teacher_preferred_methods (constraint_id, method_id, rank)
SELECT tc.id, tm.id, e.ord::int
FROM teacher_constraints tc
CROSS JOIN LATERAL jsonb_array_elements_text(tc.preferred_methods_json::jsonb)
     WITH ORDINALITY AS e(method_name, ord)
JOIN teaching_methods tm ON tm.name = e.method_name;`,
  },
  {
    title: "Derived attribute: total_available_minutes",
    problem:
      "courses.total_available_minutes always equals total_classes × period_duration, i.e. the FD {total_classes, period_duration} → total_available_minutes holds with a non-key determinant. Storing it independently allowed an update anomaly: change the period length and the total silently disagrees.",
    before: `courses(..., total_classes, period_duration, total_available_minutes)  -- written by the app`,
    after: `total_available_minutes INTEGER
    GENERATED ALWAYS AS (total_classes * period_duration) STORED`,
    migration: `-- Writing it directly is now rejected by PostgreSQL:
UPDATE courses SET total_available_minutes = 1;
-- ERROR: column "total_available_minutes" can only be updated to DEFAULT`,
  },
];

const FDS: { table: string; keys: string[]; fds: string[]; form: string; note?: string }[] = [
  {
    table: "courses",
    keys: ["id", "(teacher_id, code, semester)"],
    fds: ["id → teacher_id, code, title, semester, total_classes, period_duration, …", "(teacher_id, code, semester) → id"],
    form: "BCNF",
    note: "Both determinants are candidate keys. total_available_minutes is generated, not stored independently.",
  },
  {
    table: "topics",
    keys: ["id", "(unit_id, order_index)"],
    fds: ["id → unit_id, title, order_index, estimated_minutes, allocated_minutes, status", "(unit_id, order_index) → id"],
    form: "BCNF",
  },
  {
    table: "class_sessions",
    keys: ["id", "(course_id, session_number)"],
    fds: ["id → course_id, session_number, scheduled_date, duration_minutes, current_topic_id, status", "(course_id, session_number) → id"],
    form: "BCNF",
  },
  {
    table: "performance",
    keys: ["id", "(concept_id, assessment_id)"],
    fds: ["(concept_id, assessment_id) → average_score, sample_size, common_errors, recorded_at", "average_score, course threshold → weakness_flag"],
    form: "3NF with one controlled derived column",
    note: "weakness_flag is derivable, but it is kept so a partial index (WHERE weakness_flag) can serve revision queries. Triggers keep it correct: it is recomputed on every write and when the course threshold changes, so it cannot drift.",
  },
  {
    table: "prerequisites / concept_outcomes / question_concepts",
    keys: ["composite primary key of both foreign keys"],
    fds: ["(question_id, concept_id) → weightage"],
    form: "BCNF",
    note: "Associative entities for M:N relationships; the only non-key attribute depends on the whole key.",
  },
  {
    table: "users / teachers",
    keys: ["users.id, users.email", "teachers.id, teachers.user_id, teachers.employee_id"],
    fds: ["users.id → email, hashed_password, full_name, role", "teachers.user_id → department, designation, employee_id"],
    form: "BCNF",
    note: "Login credentials and the faculty profile are split 1:1, so a credential change never touches academic data.",
  },
];

const DELIBERATE = [
  ["audit_log.old_data / new_data (JSONB)", "An append-only history of whole row images. Rows are never updated or joined on these fields, so normalizing them would add cost without preventing any anomaly."],
  ["Lesson plan content (MongoDB)", "Nested, versioned documents read and written as a unit. PostgreSQL keeps only the relational pointer (lesson_plans.mongo_doc_id), status and version."],
  ["mv_course_dashboard", "A materialized view: a precomputed, refreshable snapshot of aggregates. Redundant by definition, and refreshed after every write that changes it."],
];

export default function NormalizationTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <SectionTitle
        icon={<Layers size={18} style={{ color: "var(--accent-emerald)" }} />}
        title="Normalization"
        subtitle="The two real violations found in the original schema and how migration 0002 fixed them, then the functional dependencies that put the remaining tables in 3NF/BCNF, and the places where redundancy is intentional."
      />

      {FIXES.map((fix) => (
        <div key={fix.title} className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, marginBottom: 8 }}>{fix.title}</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>{fix.problem}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div><Label>Before</Label><SQLBlock sql={fix.before} /></div>
            <ArrowRight size={18} style={{ color: "var(--text-muted)" }} />
            <div><Label>After</Label><SQLBlock sql={fix.after} /></div>
          </div>
          <Label>{fix.migration.startsWith("--") ? "Enforcement" : "Data migration"}</Label>
          <SQLBlock sql={fix.migration} />
        </div>
      ))}

      <div>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, marginBottom: 12 }}>Functional dependencies and candidate keys</h3>
        <div className="card" style={{ overflow: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Table</th><th>Candidate keys</th><th>Dependencies</th><th>Form</th></tr></thead>
            <tbody>
              {FDS.map((row) => (
                <tr key={row.table}>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, verticalAlign: "top" }}>{row.table}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", verticalAlign: "top" }}>{row.keys.join("; ")}</td>
                  <td style={{ fontSize: "0.75rem", verticalAlign: "top" }}>
                    {row.fds.map((fd) => <div key={fd} style={{ fontFamily: "var(--font-mono)" }}>{fd}</div>)}
                    {row.note && <div style={{ color: "var(--text-muted)", marginTop: 6, fontFamily: "inherit" }}>{row.note}</div>}
                  </td>
                  <td style={{ verticalAlign: "top" }}><span className={`badge ${row.form === "BCNF" ? "badge-success" : "badge-warning"}`}>{row.form}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
          A table is in BCNF when every non-trivial dependency X → Y has X as a superkey. Each table above has only key determinants
          (except the documented derived column), which also rules out partial (2NF) and transitive (3NF) dependencies.
        </p>
      </div>

      <div>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, marginBottom: 12 }}>Intentional redundancy</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {DELIBERATE.map(([title, why]) => (
            <div key={title} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font-mono)", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{why}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
