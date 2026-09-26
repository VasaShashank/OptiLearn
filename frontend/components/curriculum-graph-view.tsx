"use client";

import { useMemo, useState } from "react";
import type { CurriculumGraph, GraphNode } from "@/lib/types";

/**
 * Topic map: one column per unit, one card per concept, a line from each prerequisite
 * to the concept that needs it. Selecting a concept highlights everything it depends on
 * and everything that depends on it, and lists both below the map.
 */

const CARD_W = 230;
const CARD_H = 78;
const COL_GAP = 70;
const ROW_GAP = 14;
const HEAD_H = 34;

const STATUS: Record<GraphNode["status"], { label: string; color: string }> = {
  mastered: { label: "Secure", color: "var(--tick)" },
  moderate: { label: "Shaky", color: "var(--caution)" },
  weak: { label: "Weak", color: "var(--redpen)" },
  bottleneck: { label: "Weak, and later concepts need it", color: "var(--redpen)" },
  pending: { label: "Not tested yet", color: "var(--pencil-light)" },
};

const KIND: Record<string, string> = {
  conceptual: "Idea to understand",
  procedural: "Procedure",
  problem_solving: "Problem solving",
  analytical: "Analysis",
  practical: "Hands-on practice",
};

type Placed = GraphNode & { x: number; y: number };

export default function CurriculumGraphView({ graph }: { graph: CurriculumGraph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { placed, byId, units, width, height } = useMemo(() => {
    const unitNumbers = [...new Set(graph.nodes.map((n) => n.unit_number))].sort((a, b) => a - b);
    const rows = new Map<number, number>();
    const placed: Placed[] = graph.nodes.map((n) => {
      const col = unitNumbers.indexOf(n.unit_number);
      const row = rows.get(n.unit_number) ?? 0;
      rows.set(n.unit_number, row + 1);
      return { ...n, x: col * (CARD_W + COL_GAP), y: HEAD_H + row * (CARD_H + ROW_GAP) };
    });
    const tallest = Math.max(1, ...rows.values());
    return {
      placed,
      byId: new Map(placed.map((n) => [n.id, n])),
      units: unitNumbers,
      width: unitNumbers.length * (CARD_W + COL_GAP) - COL_GAP + 40,
      height: HEAD_H + tallest * (CARD_H + ROW_GAP),
    };
  }, [graph]);

  // Everything upstream (needs) and downstream (leads to) of the selected concept
  const chain = useMemo(() => {
    if (!selectedId) return null;
    const walk = (start: string, next: (id: string) => string[]) => {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
        for (const id of next(stack.pop()!)) {
          if (!seen.has(id)) {
            seen.add(id);
            stack.push(id);
          }
        }
      }
      return seen;
    };
    const parents = (id: string) => graph.edges.filter((e) => e.target === id).map((e) => e.source);
    const children = (id: string) => graph.edges.filter((e) => e.source === id).map((e) => e.target);
    return {
      direct: { needs: parents(selectedId), leadsTo: children(selectedId) },
      up: walk(selectedId, parents),
      down: walk(selectedId, children),
    };
  }, [selectedId, graph.edges]);

  const q = query.trim().toLowerCase();
  const matches = (n: GraphNode) =>
    (status === "all" || n.status === status || (status === "weak" && n.status === "bottleneck")) &&
    (!q || n.name.toLowerCase().includes(q) || n.topic_title.toLowerCase().includes(q));
  const inChain = (id: string) => !chain || id === selectedId || chain.up.has(id) || chain.down.has(id);

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter((n): n is Placed => !!n);

  return (
    <div className="topic-map">
      <div className="topic-map__tools">
        <input
          className="input"
          type="search"
          placeholder="Find a concept or topic"
          aria-label="Find a concept or topic"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="input-select" aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All concepts ({graph.nodes.length})</option>
          <option value="weak">Weak ({graph.nodes.filter((n) => n.status === "weak" || n.status === "bottleneck").length})</option>
          <option value="moderate">Shaky ({graph.nodes.filter((n) => n.status === "moderate").length})</option>
          <option value="mastered">Secure ({graph.nodes.filter((n) => n.status === "mastered").length})</option>
          <option value="pending">Not tested yet ({graph.nodes.filter((n) => n.status === "pending").length})</option>
        </select>
        <ul className="topic-map__legend" aria-label="Key">
          {(["mastered", "moderate", "weak", "pending"] as const).map((s) => (
            <li key={s}><span style={{ background: STATUS[s].color }} />{STATUS[s].label}</li>
          ))}
          <li><span className="topic-map__legend-line" />needed before</li>
        </ul>
      </div>

      <p style={{ color: "var(--pencil)", margin: "0 0 10px" }}>
        Each line runs from a concept to one that builds on it. Click a concept to follow its chain.
      </p>

      <div className="topic-map__scroll">
        <div className="topic-map__canvas" style={{ width, height }} onClick={() => setSelectedId(null)}>
          {units.map((u, i) => (
            <div key={u} className="topic-map__unit" style={{ left: i * (CARD_W + COL_GAP), width: CARD_W }}>Unit {u}</div>
          ))}

          <svg width={width} height={height} className="topic-map__lines" aria-hidden>
            <defs>
              <marker id="tm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
              </marker>
            </defs>
            {graph.edges.map((e) => {
              const a = byId.get(e.source);
              const b = byId.get(e.target);
              if (!a || !b) return null;
              const lit = !!chain && inChain(a.id) && inChain(b.id);
              return (
                <path
                  key={`${e.source}-${e.target}`}
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={lit ? "var(--ink)" : "var(--rule-strong)"}
                  strokeWidth={lit ? 2.2 : 1.2}
                  opacity={chain && !lit ? 0.35 : 1}
                  markerEnd="url(#tm-arrow)"
                />
              );
            })}
          </svg>

          {placed.map((n) => {
            const s = STATUS[n.status];
            const dim = !matches(n) || !inChain(n.id);
            return (
              <button
                key={n.id}
                type="button"
                className={`topic-map__card${n.id === selectedId ? " topic-map__card--selected" : ""}`}
                style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, opacity: dim ? 0.3 : 1, borderLeftColor: s.color }}
                aria-pressed={n.id === selectedId}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedId(n.id === selectedId ? null : n.id);
                }}
              >
                <span className="topic-map__name">{n.name}</span>
                <span className="topic-map__meta">
                  {n.avg_score != null ? `${n.avg_score}% average` : "Not tested yet"}
                  {n.status === "bottleneck" && <strong style={{ color: "var(--redpen)" }}>, blocks {n.downstream_count}</strong>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && chain && (
        <section className="card topic-map__detail" aria-live="polite">
          <div>
            <p style={{ color: "var(--pencil)" }}>Unit {selected.unit_number}, {selected.topic_title}</p>
            <h3 style={{ fontSize: "1.15rem", margin: "2px 0 6px" }}>{selected.name}</h3>
            <p>
              <span style={{ color: STATUS[selected.status].color, fontWeight: 700 }}>{STATUS[selected.status].label}</span>
              {selected.avg_score != null && <>, class average {selected.avg_score}%</>}.{" "}
              {KIND[selected.concept_type] || selected.concept_type}, difficulty {selected.difficulty} of 5.
            </p>
          </div>
          <ConceptList title="Needs first" empty="Nothing: students can start here." items={names(chain.direct.needs)} onPick={setSelectedId} />
          <ConceptList title="Leads to" empty="No later concept depends on this one." items={names(chain.direct.leadsTo)} onPick={setSelectedId} />
        </section>
      )}
    </div>
  );
}

function ConceptList({ title, empty, items, onPick }: { title: string; empty: string; items: Placed[]; onPick: (id: string) => void }) {
  return (
    <div>
      <h4 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{title}</h4>
      {items.length === 0 ? (
        <p style={{ color: "var(--pencil)" }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className="link-button" onClick={() => onPick(n.id)}>{n.name}</button>
              <span style={{ color: "var(--pencil)" }}> ({STATUS[n.status].label.toLowerCase()})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A curve from the right edge of `a` to the left edge of `b`; same-column links loop out to the right. */
function edgePath(a: Placed, b: Placed): string {
  const ay = a.y + CARD_H / 2;
  const by = b.y + CARD_H / 2;
  if (b.x > a.x) {
    const x1 = a.x + CARD_W;
    const x2 = b.x - 2;
    const bend = Math.max(30, (x2 - x1) / 2);
    return `M${x1},${ay} C${x1 + bend},${ay} ${x2 - bend},${by} ${x2},${by}`;
  }
  if (b.x === a.x) {
    const x = a.x + CARD_W;
    const out = 26 + Math.min(20, Math.abs(by - ay) / 12);
    return `M${x},${ay} C${x + out},${ay} ${x + out},${by} ${x + 2},${by}`;
  }
  // Backwards across units (rare): leave from the left edge, enter from the right
  const x1 = a.x;
  const x2 = b.x + CARD_W + 2;
  return `M${x1},${ay} C${x1 - 40},${ay} ${x2 + 40},${by} ${x2},${by}`;
}
