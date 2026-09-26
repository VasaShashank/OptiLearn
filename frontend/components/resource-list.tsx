import { ExternalLink } from "lucide-react";
import type { LessonResource } from "@/lib/types";

/** Links open in a new tab; code and formulas expand in place. */
export default function ResourceList({ resources }: { resources: LessonResource[] }) {
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
        </li>
      ))}
    </ul>
  );
}
