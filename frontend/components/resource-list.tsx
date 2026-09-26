import { ExternalLink, Trash2 } from "lucide-react";
import type { LessonResource } from "@/lib/types";

/** Links open in a new tab; code and formulas expand in place. */
export default function ResourceList({ resources, onRemove, disabled }: {
  resources: LessonResource[];
  onRemove?: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="resource-list">
      {resources.map((r, i) => (
        <li key={i}>
          <span className="badge badge-neutral">{r.kind}</span>
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} <ExternalLink size={13} /></a>
          ) : (
            <details>
              <summary>{r.title}</summary>
              <pre className="code-block" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.content}</pre>
            </details>
          )}
          {onRemove && (
            <button type="button" className="btn btn-ghost" style={{ padding: 4, marginLeft: "auto" }} disabled={disabled} onClick={() => onRemove(i)}>
              <Trash2 size={15} /><span className="visually-hidden">Remove {r.title}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
