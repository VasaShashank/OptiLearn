"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { LessonResource, ResourceKind } from "@/lib/types";
import ResourceList from "@/components/resource-list";

const KINDS: { id: ResourceKind; label: string; needsLink: boolean; placeholder: string }[] = [
  { id: "slides", label: "Slides", needsLink: true, placeholder: "https://…/slides.pdf" },
  { id: "video", label: "Video", needsLink: true, placeholder: "https://youtube.com/…" },
  { id: "link", label: "Web page", needsLink: true, placeholder: "https://…" },
  { id: "dataset", label: "Dataset", needsLink: true, placeholder: "https://…/data.csv" },
  { id: "code", label: "Code snippet", needsLink: false, placeholder: "SELECT name FROM concepts WHERE …" },
  { id: "formula", label: "Formula (LaTeX)", needsLink: false, placeholder: "X \\to Y" },
];

/**
 * Teaching material attached to a lesson plan. Saving writes a new plan version, so
 * material changes appear in the plan's history like any other edit.
 */
export default function MaterialEditor({ resources, busy, onSave }: {
  resources: LessonResource[];
  busy: boolean;
  onSave: (next: LessonResource[], note: string) => void;
}) {
  const [draft, setDraft] = useState<{ kind: ResourceKind; title: string; value: string }>({ kind: "slides", title: "", value: "" });
  const kind = KINDS.find((k) => k.id === draft.kind)!;
  const valid = draft.title.trim() && (kind.needsLink ? /^https?:\/\//i.test(draft.value.trim()) : draft.value.trim());

  const add = () => {
    const item: LessonResource = kind.needsLink
      ? { kind: draft.kind, title: draft.title.trim(), url: draft.value.trim() }
      : { kind: draft.kind, title: draft.title.trim(), content: draft.value, language: draft.kind === "code" ? "sql" : null };
    onSave([...resources, item], `Added ${kind.label.toLowerCase()}: ${item.title}`);
    setDraft({ ...draft, title: "", value: "" });
  };

  return (
    <div>
      {resources.length === 0 ? (
        <p style={{ color: "var(--pencil)" }}>No material yet. Add slides, a video, a dataset, a code snippet or a formula you want at hand in class.</p>
      ) : (
        <ResourceList resources={resources} disabled={busy}
          onRemove={(i) => onSave(resources.filter((_, n) => n !== i), `Removed ${resources[i].title}`)} />
      )}

      <div className="material-form">
        <label className="field" style={{ marginTop: 0 }}>
          Type
          <select className="select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ResourceKind, value: "" })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginTop: 0 }}>
          Title
          <input className="input" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label className="field" style={{ marginTop: 0, gridColumn: "1 / -1" }}>
          {kind.needsLink ? "Link" : kind.id === "formula" ? "Formula" : "Code"}
          {kind.needsLink ? (
            <input className="input" type="url" placeholder={kind.placeholder} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
          ) : (
            <textarea className="input" rows={4} placeholder={kind.placeholder} value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })} style={{ fontFamily: "var(--font-mono)", fontWeight: 400 }} />
          )}
        </label>
        <div style={{ gridColumn: "1 / -1" }}>
          <button type="button" className="btn btn-secondary" disabled={!valid || busy} onClick={add}>
            <Plus size={16} /> Add material
          </button>
        </div>
      </div>
    </div>
  );
}
