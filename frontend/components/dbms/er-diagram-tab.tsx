"use client";

import { useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";
import { dbmsAPI } from "@/lib/api";
import { ErrorNote, Loading, SectionTitle, errorMessage } from "./shared";

export default function ERDiagramTab() {
  const container = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<{ tables: number; relationships: number; mermaid: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [fit, setFit] = useState(true);

  // Fit: scale the SVG to the card width; actual size: native width, scroll to explore
  useEffect(() => {
    const svg = container.current?.querySelector("svg");
    if (!svg) return;
    svg.style.maxWidth = fit ? "100%" : "none";
    svg.style.height = "auto";
    svg.style.width = fit ? "100%" : "";
  }, [fit, meta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const diagram = await dbmsAPI.getERDiagram();
        if (cancelled) return;
        setMeta(diagram);
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", er: { useMaxWidth: false }, securityLevel: "strict" });
        const { svg } = await mermaid.render(`er-${Date.now()}`, diagram.mermaid);
        if (!cancelled && container.current) {
          container.current.innerHTML = svg;
          setMeta({ ...diagram }); // re-run the sizing effect now that the SVG exists
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <SectionTitle
        icon={<Network size={18} style={{ color: "var(--accent-cyan)" }} />}
        title={meta ? `Entity-relationship diagram: ${meta.tables} entities, ${meta.relationships} relationships` : "Entity-relationship diagram"}
        subtitle="Generated from the database's own foreign keys every time this tab opens, so it always matches the deployed schema. ||--o{ is one-to-many; ||--o| is one-to-one (a UNIQUE foreign key)."
        action={meta && (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => setFit(!fit)}>
              {fit ? "Actual size" : "Fit to width"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => setShowSource(!showSource)}>
              {showSource ? "Hide" : "Show"} Mermaid source
            </button>
          </div>
        )}
      />
      {error && <ErrorNote message={error} />}
      {!meta && !error && <Loading label="Reading foreign keys…" />}
      {showSource && meta && <pre className="code-block" style={{ maxHeight: 300, overflow: "auto", marginBottom: 16 }}>{meta.mermaid}</pre>}
      <div className="card" style={{ padding: 16, overflow: "auto", maxHeight: "75vh" }}>
        <div ref={container} />
      </div>
    </div>
  );
}
