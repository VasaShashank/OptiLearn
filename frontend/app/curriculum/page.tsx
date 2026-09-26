"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { APIError, coursesAPI, curriculumAPI } from "@/lib/api";
import type { BuilderConcept, BuilderUnit, ConceptType, Course } from "@/lib/types";

const CONCEPT_TYPES: { id: ConceptType; label: string }[] = [
  { id: "conceptual", label: "Idea to understand" },
  { id: "procedural", label: "Procedure to follow" },
  { id: "problem_solving", label: "Problems to solve" },
  { id: "analytical", label: "Analysis" },
  { id: "practical", label: "Hands-on practice" },
  { id: "revision", label: "Revision" },
];

type Layout = { unitId: string; topicIds: string[] }[];

export default function CurriculumPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [units, setUnits] = useState<BuilderUnit[] | null>(null);
  const [layout, setLayout] = useState<Layout>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragTopic, setDragTopic] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      if (c.length) setCourseId(c[0].id);
    }).catch(() => setCourses([]));
  }, []);

  const load = useCallback(async () => {
    if (!courseId) return;
    const s = await curriculumAPI.get(courseId);
    setUnits(s.units);
    setLayout(s.units.map((u) => ({ unitId: u.id, topicIds: u.topics.map((t) => t.id) })));
  }, [courseId]);

  useEffect(() => { setSelectedId(null); load().catch(() => setUnits([])); }, [load]);

  const topicsById = useMemo(() => new Map((units || []).flatMap((u) => u.topics.map((t) => [t.id, t] as const))), [units]);
  const concepts = useMemo(() => (units || []).flatMap((u) => u.topics.flatMap((t) => t.concepts.map((c) => ({ ...c, topic: t.title, unit: u.unit_number })))), [units]);
  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const selected = selectedId ? conceptById.get(selectedId) || null : null;

  const savedLayout = useMemo(() => JSON.stringify((units || []).map((u) => u.topics.map((t) => t.id))), [units]);
  const dirty = JSON.stringify(layout.map((u) => u.topicIds)) !== savedLayout;

  // ------------------------------------------------------------ reordering
  const moveTopic = (topicId: string, toUnit: string, toIndex: number) => {
    setLayout((prev) => {
      const next = prev.map((u) => ({ ...u, topicIds: u.topicIds.filter((id) => id !== topicId) }));
      const target = next.find((u) => u.unitId === toUnit)!;
      target.topicIds.splice(Math.min(toIndex, target.topicIds.length), 0, topicId);
      return next;
    });
  };

  const nudge = (topicId: string, direction: -1 | 1) => {
    const ui = layout.findIndex((u) => u.topicIds.includes(topicId));
    const ti = layout[ui].topicIds.indexOf(topicId);
    const within = ti + direction;
    if (within >= 0 && within < layout[ui].topicIds.length) {
      moveTopic(topicId, layout[ui].unitId, within);
    } else if (layout[ui + direction]) {
      // Past the edge of a unit: continue into the neighbouring one
      const neighbour = layout[ui + direction];
      moveTopic(topicId, neighbour.unitId, direction === 1 ? 0 : neighbour.topicIds.length);
    }
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      const s = await curriculumAPI.saveLayout(courseId, layout.map((u) => ({ unit_id: u.unitId, topic_ids: u.topicIds })));
      setUnits(s.units);
      setStatus({ tone: "ok", text: "Teaching order saved." });
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof Error ? err.message : "Could not save the order" });
    }
    setSaving(false);
  };

  if (!courses.length && units === null) return <div className="skeleton" style={{ height: 360 }} />;

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>Curriculum</h1>
          <p>Drag topics to change the order you teach them. Select a concept to change how hard or important it is, or what it builds on.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {courses.length > 1 && (
            <select className="select" aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
            </select>
          )}
          {dirty && <button type="button" className="btn btn-ghost" onClick={load}>Discard changes</button>}
          <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={saveLayout}>
            {saving ? "Saving…" : "Save order"}
          </button>
        </div>
      </header>

      {status && (
        <p role={status.tone === "error" ? "alert" : "status"} style={{ marginBottom: 16, fontWeight: 600, color: status.tone === "error" ? "var(--redpen)" : "var(--tick)" }}>
          {status.text}
        </p>
      )}

      {!units ? <div className="skeleton" style={{ height: 360 }} /> : units.length === 0 ? (
        <p style={{ color: "var(--pencil)" }}>This course has no curriculum yet. Import a syllabus first.</p>
      ) : (
        <div className="builder-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {layout.map((entry, ui) => {
              const unit = units.find((u) => u.id === entry.unitId)!;
              return (
                <section key={unit.id} aria-label={`Unit ${unit.unit_number}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragTopic) moveTopic(dragTopic, unit.id, entry.topicIds.length); setDragTopic(null); }}>
                  <h2 className="section-title" style={{ marginBottom: 8 }}>Unit {unit.unit_number}: {unit.title}</h2>
                  {entry.topicIds.length === 0 && (
                    <div className="builder-empty">Drop a topic here</div>
                  )}
                  <ol className="builder-topics">
                    {entry.topicIds.map((tid, ti) => {
                      const topic = topicsById.get(tid)!;
                      const first = ui === 0 && ti === 0;
                      const last = ui === layout.length - 1 && ti === entry.topicIds.length - 1;
                      return (
                        <li key={tid} draggable
                          className={`builder-topic${dragTopic === tid ? " is-dragging" : ""}`}
                          onDragStart={() => setDragTopic(tid)}
                          onDragEnd={() => setDragTopic(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); if (dragTopic && dragTopic !== tid) moveTopic(dragTopic, unit.id, ti); setDragTopic(null); }}>
                          <div className="builder-topic__head">
                            <GripVertical size={16} aria-hidden="true" style={{ color: "var(--pencil-light)", cursor: "grab", flexShrink: 0 }} />
                            <strong style={{ flex: 1 }}>{topic.title}</strong>
                            <span style={{ color: "var(--pencil)", fontSize: "0.85rem" }}>{topic.allocated_minutes} min</span>
                            {topic.status === "completed" && <span className="badge badge-success">Taught</span>}
                            <button type="button" className="btn btn-ghost" style={{ padding: 4 }} disabled={first}
                              onClick={() => nudge(tid, -1)} title="Move earlier">
                              <ArrowUp size={16} /><span className="visually-hidden">Move {topic.title} earlier</span>
                            </button>
                            <button type="button" className="btn btn-ghost" style={{ padding: 4 }} disabled={last}
                              onClick={() => nudge(tid, 1)} title="Move later">
                              <ArrowDown size={16} /><span className="visually-hidden">Move {topic.title} later</span>
                            </button>
                          </div>
                          <div className="builder-concepts">
                            {topic.concepts.map((c) => (
                              <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
                                className={`builder-concept${selectedId === c.id ? " is-selected" : ""}`}
                                aria-pressed={selectedId === c.id}>
                                {c.name}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>

          <aside className="card builder-panel" aria-label="Concept details">
            {!selected ? (
              <p style={{ color: "var(--pencil)" }}>Select a concept to edit it.</p>
            ) : (
              <ConceptPanel
                key={selected.id}
                courseId={courseId}
                concept={selected}
                allConcepts={concepts}
                onChanged={async (message) => { await load(); setStatus({ tone: "ok", text: message }); }}
                onError={(text) => setStatus({ tone: "error", text })}
                onClose={() => setSelectedId(null)}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

type RichConcept = BuilderConcept & { topic: string; unit: number };

function ConceptPanel({ courseId, concept, allConcepts, onChanged, onError, onClose }: {
  courseId: string;
  concept: RichConcept;
  allConcepts: RichConcept[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ difficulty: concept.difficulty, importance: concept.importance, concept_type: concept.concept_type });
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = new Map(allConcepts.map((c) => [c.id, c]));

  // Everything this concept already depends on, directly or indirectly
  const upstream = (id: string, seen = new Set<string>()): Set<string> => {
    for (const p of byId.get(id)?.prerequisite_ids || []) {
      if (!seen.has(p)) { seen.add(p); upstream(p, seen); }
    }
    return seen;
  };
  const dependents = allConcepts.filter((c) => c.prerequisite_ids.includes(concept.id));

  // Adding X as a prerequisite loops back if X already (indirectly) depends on this concept
  const candidates = allConcepts
    .filter((c) => c.id !== concept.id && !concept.prerequisite_ids.includes(c.id))
    .map((c) => ({ ...c, loops: upstream(c.id).has(concept.id) }));

  const changed = form.difficulty !== concept.difficulty || form.importance !== concept.importance || form.concept_type !== concept.concept_type;

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      await onChanged(await action());
    } catch (err) {
      onError(err instanceof APIError || err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: "1.2rem" }}>{concept.name}</h2>
          <p style={{ color: "var(--pencil)", fontSize: "0.9rem" }}>Unit {concept.unit}, {concept.topic}</p>
        </div>
        <button type="button" className="btn btn-ghost" style={{ padding: 6, alignSelf: "flex-start" }} onClick={onClose}>
          <X size={18} /><span className="visually-hidden">Close</span>
        </button>
      </div>

      <Scale label="How hard is it?" low="Easy" high="Hard" value={form.difficulty} onChange={(v) => setForm({ ...form, difficulty: v })} />
      <Scale label="How important is it?" low="Nice to know" high="Essential" value={form.importance} onChange={(v) => setForm({ ...form, importance: v })} />
      <label className="field">
        What kind of learning is it?
        <select className="select" value={form.concept_type} onChange={(e) => setForm({ ...form, concept_type: e.target.value as ConceptType })}>
          {CONCEPT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-primary" disabled={!changed || busy} style={{ marginTop: 12 }}
        onClick={() => run(async () => {
          const r = await curriculumAPI.updateConcept(courseId, concept.id, form);
          return r.allocated_minutes_after === r.allocated_minutes_before
            ? `Saved. The time for "${concept.topic}" stays at ${r.allocated_minutes_after} minutes.`
            : `Saved. The time plan now gives "${concept.topic}" ${r.allocated_minutes_after} minutes (was ${r.allocated_minutes_before}).`;
        })}>
        Save changes
      </button>

      <h3 className="builder-subhead">Builds on</h3>
      {concept.prerequisite_ids.length === 0 ? <p style={{ color: "var(--pencil)" }}>Nothing. It can be taught first.</p> : (
        <ul className="builder-links">
          {concept.prerequisite_ids.map((pid) => (
            <li key={pid}>
              <span>{byId.get(pid)?.name}</span>
              <button type="button" className="btn btn-ghost" style={{ padding: 4 }} disabled={busy}
                onClick={() => run(async () => { await curriculumAPI.removePrerequisite(courseId, concept.id, pid); return `Removed "${byId.get(pid)?.name}" from what "${concept.name}" builds on.`; })}>
                <X size={16} /><span className="visually-hidden">Remove {byId.get(pid)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <select className="select" style={{ flex: 1, minWidth: 0 }} aria-label="Add something it builds on" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add something it builds on…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id} disabled={c.loops}>
              {c.name}{c.loops ? " (already builds on this)" : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary" disabled={!adding || busy}
          onClick={() => run(async () => { await curriculumAPI.addPrerequisite(courseId, concept.id, adding); const name = byId.get(adding)?.name; setAdding(""); return `"${concept.name}" now builds on "${name}".`; })}>
          <Plus size={16} /> Add
        </button>
      </div>

      <h3 className="builder-subhead">Needed by</h3>
      {dependents.length === 0 ? <p style={{ color: "var(--pencil)" }}>No other concept builds on this one.</p> : (
        <ul className="builder-links">{dependents.map((d) => <li key={d.id}><span>{d.name}</span></li>)}</ul>
      )}
    </div>
  );
}

function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="field" style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
      <legend style={{ marginBottom: 6 }}>{label}</legend>
      <div className="scale" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? "is-on" : ""} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--pencil)", marginTop: 4 }}>
        <span>{low}</span><span>{high}</span>
      </div>
    </fieldset>
  );
}
