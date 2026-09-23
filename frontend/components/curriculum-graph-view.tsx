"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  Layers,
  AlertTriangle,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  LayoutGrid,
  Network,
} from "lucide-react";
import type { CurriculumGraph, GraphNode } from "@/lib/types";

interface CurriculumGraphViewProps {
  graph: CurriculumGraph;
}

type LayoutMode = "unit-flow" | "topological" | "grid";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; glow: string; text: string }> = {
  mastered: {
    bg: "rgba(16, 185, 129, 0.15)",
    border: "#10b981",
    glow: "rgba(16, 185, 129, 0.4)",
    text: "#34d399",
  },
  moderate: {
    bg: "rgba(245, 158, 11, 0.15)",
    border: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.4)",
    text: "#fbbf24",
  },
  weak: {
    bg: "rgba(244, 63, 94, 0.15)",
    border: "#f43f5e",
    glow: "rgba(244, 63, 94, 0.4)",
    text: "#fb7185",
  },
  bottleneck: {
    bg: "rgba(239, 68, 68, 0.22)",
    border: "#ef4444",
    glow: "rgba(239, 68, 68, 0.6)",
    text: "#f87171",
  },
  pending: {
    bg: "rgba(99, 102, 241, 0.12)",
    border: "#6366f1",
    glow: "rgba(99, 102, 241, 0.35)",
    text: "#a5b4fc",
  },
};

export default function CurriculumGraphView({ graph }: CurriculumGraphViewProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("unit-flow");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Pan and Zoom
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [zoom, setZoom] = useState(0.9);
  const isDraggingCanvas = useRef(false);
  const isDraggingNode = useRef<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute node relationships for path highlighting
  const nodeConnections = useMemo(() => {
    const upstream = new Map<string, Set<string>>(); // prerequisites of node
    const downstream = new Map<string, Set<string>>(); // dependents of node

    graph.nodes.forEach((n) => {
      upstream.set(n.id, new Set());
      downstream.set(n.id, new Set());
    });

    graph.edges.forEach((e) => {
      upstream.get(e.target)?.add(e.source);
      downstream.get(e.source)?.add(e.target);
    });

    // Helper for recursive ancestor traversal
    const getAncestors = (id: string, visited = new Set<string>()): Set<string> => {
      const preds = upstream.get(id);
      if (!preds) return visited;
      preds.forEach((p) => {
        if (!visited.has(p)) {
          visited.add(p);
          getAncestors(p, visited);
        }
      });
      return visited;
    };

    // Helper for recursive descendant traversal
    const getDescendants = (id: string, visited = new Set<string>()): Set<string> => {
      const succs = downstream.get(id);
      if (!succs) return visited;
      succs.forEach((s) => {
        if (!visited.has(s)) {
          visited.add(s);
          getDescendants(s, visited);
        }
      });
      return visited;
    };

    return { upstream, downstream, getAncestors, getDescendants };
  }, [graph]);

  // Active highlighted nodes based on hover or selection
  const highlightedIds = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId;
    if (!activeId) return null;

    const set = new Set<string>([activeId]);
    nodeConnections.getAncestors(activeId).forEach((id) => set.add(id));
    nodeConnections.getDescendants(activeId).forEach((id) => set.add(id));
    return set;
  }, [hoveredNodeId, selectedNodeId, nodeConnections]);

  // Compute topological rank / level for each node
  const topologicalRanks = useMemo(() => {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    graph.nodes.forEach((n) => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    graph.edges.forEach((e) => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      adj.get(e.source)?.push(e.target);
    });

    const rank = new Map<string, number>();
    graph.nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) rank.set(n.id, 0);
    });

    // BFS relaxation
    let changed = true;
    let maxIter = 20;
    while (changed && maxIter-- > 0) {
      changed = false;
      graph.edges.forEach((e) => {
        const srcRank = rank.get(e.source) ?? 0;
        const currentTargetRank = rank.get(e.target) ?? 0;
        if (srcRank + 1 > currentTargetRank) {
          rank.set(e.target, srcRank + 1);
          changed = true;
        }
      });
    }

    return rank;
  }, [graph]);

  // Calculate coordinates for positioned nodes
  const nodeWidth = 230;
  const nodeHeight = 78;

  const positionedNodes: PositionedNode[] = useMemo(() => {
    if (layoutMode === "topological") {
      const rankBuckets = new Map<number, GraphNode[]>();
      graph.nodes.forEach((n) => {
        const r = topologicalRanks.get(n.id) || 0;
        if (!rankBuckets.has(r)) rankBuckets.set(r, []);
        rankBuckets.get(r)!.push(n);
      });

      const result: PositionedNode[] = [];
      const colWidth = 300;
      const rowGap = 26;

      Array.from(rankBuckets.keys())
        .sort((a, b) => a - b)
        .forEach((r, colIdx) => {
          const nodesInCol = rankBuckets.get(r)!;
          nodesInCol.forEach((n, rowIdx) => {
            const defaultX = 50 + colIdx * colWidth;
            const defaultY = 60 + rowIdx * (nodeHeight + rowGap);
            const custom = customPositions[n.id];
            result.push({
              ...n,
              x: custom ? custom.x : defaultX,
              y: custom ? custom.y : defaultY,
              width: nodeWidth,
              height: nodeHeight,
            });
          });
        });
      return result;
    } else {
      const unitBuckets = new Map<number, GraphNode[]>();
      graph.nodes.forEach((n) => {
        const u = n.unit_number;
        if (!unitBuckets.has(u)) unitBuckets.set(u, []);
        unitBuckets.get(u)!.push(n);
      });

      const result: PositionedNode[] = [];
      const colWidth = 290;
      const rowGap = 24;

      Array.from(unitBuckets.keys())
        .sort((a, b) => a - b)
        .forEach((u, colIdx) => {
          const nodesInUnit = unitBuckets.get(u)!;
          nodesInUnit.forEach((n, rowIdx) => {
            const defaultX = 50 + colIdx * colWidth;
            const defaultY = 70 + rowIdx * (nodeHeight + rowGap);
            const custom = customPositions[n.id];
            result.push({
              ...n,
              x: custom ? custom.x : defaultX,
              y: custom ? custom.y : defaultY,
              width: nodeWidth,
              height: nodeHeight,
            });
          });
        });
      return result;
    }
  }, [graph, layoutMode, topologicalRanks, customPositions]);

  // Lookup node by id
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  // Filtered nodes
  const matchingNodeIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return new Set(
      graph.nodes
        .filter((n) => {
          const matchesQuery = !q || n.name.toLowerCase().includes(q) || n.topic_title.toLowerCase().includes(q);
          const matchesStatus =
            statusFilter === "all" ||
            (statusFilter === "bottlenecks" && (graph.bottlenecks.includes(n.id) || n.status === "bottleneck")) ||
            n.status === statusFilter;
          return matchesQuery && matchesStatus;
        })
        .map((n) => n.id)
    );
  }, [graph, searchQuery, statusFilter]);

  // Dragging event handlers
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && (e.target as HTMLElement).tagName !== "svg") {
      return;
    }
    isDraggingCanvas.current = true;
    dragStartPos.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas.current) {
      setPan({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      });
    } else if (isDraggingNode.current) {
      const nodeId = isDraggingNode.current;
      const currentCustom = customPositions[nodeId] || {
        x: nodeMap.get(nodeId)?.x || 0,
        y: nodeMap.get(nodeId)?.y || 0,
      };
      const dx = (e.clientX - dragStartPos.current.x) / zoom;
      const dy = (e.clientY - dragStartPos.current.y) / zoom;
      setCustomPositions((prev) => ({
        ...prev,
        [nodeId]: {
          x: currentCustom.x + dx,
          y: currentCustom.y + dy,
        },
      }));
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    isDraggingCanvas.current = false;
    isDraggingNode.current = null;
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    isDraggingNode.current = nodeId;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleResetView = () => {
    setPan({ x: 30, y: 30 });
    setZoom(0.9);
    setCustomPositions({});
    setSelectedNodeId(null);
  };

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls & Toolbar Bar */}
      <div
        className="card"
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Left: Search & Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Search Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "6px 12px",
              minWidth: 220,
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search concepts or topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: "0.8125rem",
                width: "100%",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-select"
            style={{
              padding: "6px 12px",
              fontSize: "0.8125rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
            }}
          >
            <option value="all">All Concepts ({graph.nodes.length})</option>
            <option value="bottlenecks">⚠️ Bottlenecks Only ({graph.bottlenecks.length})</option>
            <option value="weak">Weak Mastery</option>
            <option value="moderate">Moderate Mastery</option>
            <option value="mastered">Mastered</option>
            <option value="pending">Pending</option>
          </select>

          {/* Quick Bottleneck Tag */}
          {graph.bottlenecks.length > 0 && (
            <button
              onClick={() => setStatusFilter(statusFilter === "bottlenecks" ? "all" : "bottlenecks")}
              className={`badge ${statusFilter === "bottlenecks" ? "badge-danger" : "badge-neutral"}`}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: "0.75rem",
                border: "1px solid rgba(239,68,68,0.4)",
              }}
            >
              <AlertTriangle size={12} style={{ color: "var(--accent-rose)" }} />
              {graph.bottlenecks.length} Critical Bottlenecks
            </button>
          )}
        </div>

        {/* Right: Layout Toggle & Zoom Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Layout Mode Toggles */}
          <div
            style={{
              display: "flex",
              background: "var(--bg-input)",
              borderRadius: "var(--radius-md)",
              padding: 3,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              onClick={() => setLayoutMode("unit-flow")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                border: "none",
                cursor: "pointer",
                background: layoutMode === "unit-flow" ? "var(--bg-elevated)" : "transparent",
                color: layoutMode === "unit-flow" ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: layoutMode === "unit-flow" ? 600 : 400,
              }}
              title="Group by Unit Columns"
            >
              <Layers size={13} /> Unit Flow
            </button>
            <button
              onClick={() => setLayoutMode("topological")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                border: "none",
                cursor: "pointer",
                background: layoutMode === "topological" ? "var(--bg-elevated)" : "transparent",
                color: layoutMode === "topological" ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: layoutMode === "topological" ? 600 : 400,
              }}
              title="Organize by Prerequisite Depth"
            >
              <Network size={13} /> Prerequisite DAG
            </button>
            <button
              onClick={() => setLayoutMode("grid")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                border: "none",
                cursor: "pointer",
                background: layoutMode === "grid" ? "var(--bg-elevated)" : "transparent",
                color: layoutMode === "grid" ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: layoutMode === "grid" ? 600 : 400,
              }}
              title="Grid Card View"
            >
              <LayoutGrid size={13} /> Cards
            </button>
          </div>

          {/* Zoom Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              className="btn btn-secondary"
              style={{ padding: "6px 8px" }}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className="btn btn-secondary"
              style={{ padding: "6px 8px" }}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleResetView}
              className="btn btn-secondary"
              style={{ padding: "6px 8px" }}
              title="Reset View"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      {layoutMode === "grid" ? (
        <GridView graph={graph} matchingNodeIds={matchingNodeIds} onSelectNode={(id) => setSelectedNodeId(id)} />
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDownCanvas}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            position: "relative",
            width: "100%",
            height: "640px",
            background: "radial-gradient(ellipse at 50% 50%, #0d1326 0%, #080c18 100%)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            overflow: "hidden",
            cursor: isDraggingCanvas.current ? "grabbing" : "grab",
            userSelect: "none",
          }}
        >
          {/* Subtle Grid Pattern */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              pointerEvents: "none",
            }}
          />

          {/* Unit Column Headers Overlay */}
          {layoutMode === "unit-flow" && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translate(${pan.x}px, 12px) scale(${zoom})`,
                transformOrigin: "0 0",
                display: "flex",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              {[1, 2, 3, 4, 5].map((unitNum) => (
                <div
                  key={unitNum}
                  style={{
                    width: 290,
                    padding: "6px 14px",
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Layers size={13} style={{ color: "var(--brand-start)" }} /> Unit {unitNum}
                </div>
              ))}
            </div>
          )}

          {/* SVG Canvas for Edges & Nodes */}
          <svg
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0, overflow: "visible" }}
          >
            <defs>
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(148, 163, 184, 0.45)" />
              </marker>

              <marker
                id="arrow-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#818cf8" />
              </marker>

              <marker
                id="arrow-bottleneck"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#f43f5e" />
              </marker>

              <filter id="glow-edge" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {graph.edges.map((edge, idx) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;

                const isEdgeHighlighted =
                  highlightedIds &&
                  highlightedIds.has(edge.source) &&
                  highlightedIds.has(edge.target);

                const isDimmed = highlightedIds && !isEdgeHighlighted;
                const isBottleneckEdge =
                  graph.bottlenecks.includes(edge.source) ||
                  graph.bottlenecks.includes(edge.target);

                const x1 = src.x + src.width;
                const y1 = src.y + src.height / 2;
                const x2 = tgt.x;
                const y2 = tgt.y + tgt.height / 2;

                const dx = Math.abs(x2 - x1);
                const curvature = Math.max(40, dx * 0.45);
                const pathD = `M ${x1} ${y1} C ${x1 + curvature} ${y1}, ${x2 - curvature} ${y2}, ${x2} ${y2}`;

                let strokeColor = "rgba(148, 163, 184, 0.28)";
                let markerId = "arrow-default";
                let strokeWidth = 1.6;

                if (isEdgeHighlighted) {
                  strokeColor = "#818cf8";
                  markerId = "arrow-active";
                  strokeWidth = 2.8;
                } else if (isBottleneckEdge && !isDimmed) {
                  strokeColor = "rgba(244, 63, 94, 0.65)";
                  markerId = "arrow-bottleneck";
                  strokeWidth = 2;
                }

                return (
                  <g key={`${edge.source}-${edge.target}-${idx}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredNodeId(edge.source)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isBottleneckEdge ? "6 3" : undefined}
                      markerEnd={`url(#${markerId})`}
                      filter={isEdgeHighlighted ? "url(#glow-edge)" : undefined}
                      style={{
                        opacity: isDimmed ? 0.15 : 1,
                        transition: "all 0.2s ease",
                      }}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {positionedNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isBottleneck = graph.bottlenecks.includes(node.id) || node.status === "bottleneck";
                const isMatchingSearch = matchingNodeIds.has(node.id);
                const isDimmed = highlightedIds ? !highlightedIds.has(node.id) : !isMatchingSearch;

                const styling = STATUS_COLORS[node.status] || STATUS_COLORS.pending;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{
                      cursor: "grab",
                      opacity: isDimmed ? 0.22 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(isSelected ? null : node.id);
                    }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    {/* Bottleneck Warning Ring */}
                    {isBottleneck && (
                      <rect
                        x={-4}
                        y={-4}
                        width={node.width + 8}
                        height={node.height + 8}
                        rx={14}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={2}
                        opacity={0.8}
                        style={{
                          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                        }}
                      />
                    )}

                    {/* Card Body */}
                    <rect
                      x={0}
                      y={0}
                      width={node.width}
                      height={node.height}
                      rx={10}
                      fill={styling.bg}
                      stroke={
                        isSelected
                          ? "#a855f7"
                          : isHovered
                          ? styling.border
                          : isBottleneck
                          ? "#ef4444"
                          : "rgba(255, 255, 255, 0.1)"
                      }
                      strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.2}
                      style={{
                        filter:
                          isSelected || isHovered
                            ? `drop-shadow(0 0 12px ${styling.glow})`
                            : "drop-shadow(0 4px 10px rgba(0,0,0,0.4))",
                        backdropFilter: "blur(12px)",
                        transition: "all 0.15s ease",
                      }}
                    />

                    {/* Color Bar */}
                    <rect
                      x={0}
                      y={0}
                      width={4}
                      height={node.height}
                      rx={2}
                      fill={styling.border}
                    />

                    {/* Concept Name */}
                    <text
                      x={14}
                      y={22}
                      fill="var(--text-primary)"
                      fontSize="11.5"
                      fontWeight="600"
                      style={{ pointerEvents: "none", letterSpacing: "-0.01em" }}
                    >
                      {node.name.length > 27 ? node.name.slice(0, 26) + "…" : node.name}
                    </text>

                    {/* Topic Title */}
                    <text
                      x={14}
                      y={38}
                      fill="var(--text-muted)"
                      fontSize="9.5"
                      style={{ pointerEvents: "none" }}
                    >
                      {node.topic_title.length > 32
                        ? node.topic_title.slice(0, 30) + "…"
                        : node.topic_title}
                    </text>

                    {/* Metrics Row */}
                    <g transform="translate(14, 48)">
                      <circle cx={4} cy={10} r={3.5} fill={styling.border} />

                      {/* Difficulty */}
                      <rect
                        x={14}
                        y={2}
                        width={46}
                        height={16}
                        rx={4}
                        fill="rgba(255, 255, 255, 0.06)"
                      />
                      <text
                        x={20}
                        y={14}
                        fill="var(--text-secondary)"
                        fontSize="8.5"
                        fontWeight="500"
                      >
                        Diff: {node.difficulty}/5
                      </text>

                      {/* Avg Score */}
                      {node.avg_score != null && (
                        <g transform="translate(66, 0)">
                          <rect
                            x={0}
                            y={2}
                            width={38}
                            height={16}
                            rx={4}
                            fill={
                              node.avg_score >= 70
                                ? "rgba(16, 185, 129, 0.2)"
                                : node.avg_score >= 60
                                ? "rgba(245, 158, 11, 0.2)"
                                : "rgba(244, 63, 94, 0.2)"
                            }
                          />
                          <text
                            x={6}
                            y={14}
                            fill={
                              node.avg_score >= 70
                                ? "#34d399"
                                : node.avg_score >= 60
                                ? "#fbbf24"
                                : "#fb7185"
                            }
                            fontSize="8.5"
                            fontWeight="600"
                          >
                            {node.avg_score}%
                          </text>
                        </g>
                      )}

                      {/* Downstream Count */}
                      {node.downstream_count > 0 && (
                        <g transform={`translate(${node.avg_score != null ? 110 : 66}, 0)`}>
                          <rect
                            x={0}
                            y={2}
                            width={32}
                            height={16}
                            rx={4}
                            fill="rgba(168, 85, 247, 0.2)"
                          />
                          <text
                            x={6}
                            y={14}
                            fill="#c084fc"
                            fontSize="8.5"
                            fontWeight="600"
                          >
                            ↓{node.downstream_count}
                          </text>
                        </g>
                      )}

                      {/* Bottleneck Warning Icon */}
                      {isBottleneck && (
                        <g transform={`translate(${node.width - 44}, 2)`}>
                          <rect
                            x={0}
                            y={0}
                            width={18}
                            height={16}
                            rx={4}
                            fill="rgba(239, 68, 68, 0.3)"
                          />
                          <text
                            x={4}
                            y={12}
                            fill="#ef4444"
                            fontSize="9"
                            fontWeight="bold"
                          >
                            ⚠️
                          </text>
                        </g>
                      )}
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Instructions */}
          <div
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              background: "rgba(15, 20, 36, 0.85)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-full)",
              padding: "4px 14px",
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              pointerEvents: "none",
            }}
          >
            <span>💡 <strong>Click</strong> to inspect</span>
            <span>·</span>
            <span><strong>Drag node</strong> to rearrange</span>
            <span>·</span>
            <span><strong>Drag background</strong> to pan & zoom</span>
          </div>

          {/* Concept Inspector */}
          {selectedNode && (
            <ConceptInspector
              node={selectedNode}
              graph={graph}
              nodeConnections={nodeConnections}
              nodeMap={nodeMap}
              onClose={() => setSelectedNodeId(null)}
              onSelectNode={(id) => setSelectedNodeId(id)}
            />
          )}
        </div>
      )}

      {/* Legend Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "8px 12px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Legend:</span>
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: colors.border,
                  boxShadow: `0 0 6px ${colors.glow}`,
                }}
              />
              <span style={{ textTransform: "capitalize" }}>{status}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "#818cf8" }}>⟶</span>
            <span>Prerequisite Path</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "#c084fc" }}>↓k</span>
            <span>Dependents count</span>
          </div>
        </div>
        <div>
          <span>{graph.nodes.length} concepts</span> · <span>{graph.edges.length} edges</span> · <span>{graph.bottlenecks.length} bottlenecks</span>
        </div>
      </div>
    </div>
  );
}

function ConceptInspector({
  node,
  graph,
  nodeConnections,
  nodeMap,
  onClose,
  onSelectNode,
}: {
  node: PositionedNode;
  graph: CurriculumGraph;
  nodeConnections: {
    upstream: Map<string, Set<string>>;
    downstream: Map<string, Set<string>>;
  };
  nodeMap: Map<string, PositionedNode>;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}) {
  const isBottleneck = graph.bottlenecks.includes(node.id) || node.status === "bottleneck";
  const directPrereqIds = Array.from(nodeConnections.upstream.get(node.id) || []);
  const directDependentIds = Array.from(nodeConnections.downstream.get(node.id) || []);

  const styling = STATUS_COLORS[node.status] || STATUS_COLORS.pending;

  return (
    <div
      className="card animate-fade-in"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        bottom: 14,
        width: 320,
        background: "rgba(15, 20, 36, 0.94)",
        border: "1px solid var(--border-subtle)",
        backdropFilter: "blur(16px)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          background: styling.bg,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span
              className="badge"
              style={{
                background: styling.border,
                color: "#fff",
                fontSize: "0.625rem",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Unit {node.unit_number}
            </span>
            <span
              className="badge"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: styling.text,
                fontSize: "0.625rem",
              }}
            >
              {node.status}
            </span>
          </div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {node.name}
          </h4>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
            {node.topic_title}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {isBottleneck && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: "0.75rem",
              color: "#fca5a5",
            }}
          >
            <AlertTriangle size={15} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Prerequisite Bottleneck</strong>: {directDependentIds.length} downstream concepts depend on mastering this concept!
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div
            style={{
              background: "var(--bg-input)",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Difficulty</div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, marginTop: 2 }}>{node.difficulty} / 5</div>
          </div>
          <div
            style={{
              background: "var(--bg-input)",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Importance</div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, marginTop: 2 }}>{node.importance} / 5</div>
          </div>
          <div
            style={{
              background: "var(--bg-input)",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Avg Mastery</div>
            <div
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                marginTop: 2,
                color: node.avg_score && node.avg_score >= 70 ? "#34d399" : node.avg_score && node.avg_score >= 60 ? "#fbbf24" : "#fb7185",
              }}
            >
              {node.avg_score != null ? `${node.avg_score}%` : "Not assessed"}
            </div>
          </div>
          <div
            style={{
              background: "var(--bg-input)",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Type</div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, marginTop: 4, textTransform: "capitalize" }}>
              {node.concept_type}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Direct Prerequisites ({directPrereqIds.length})
          </div>
          {directPrereqIds.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              None (Foundational concept)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {directPrereqIds.map((pId) => {
                const pNode = nodeMap.get(pId);
                if (!pNode) return null;
                return (
                  <button
                    key={pId}
                    onClick={() => onSelectNode(pId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--text-primary)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <span>{pNode.name}</span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--brand-start)" }}>Unit {pNode.unit_number}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Downstream Dependents ({directDependentIds.length})
          </div>
          {directDependentIds.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              Terminal concept in curriculum
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {directDependentIds.map((dId) => {
                const dNode = nodeMap.get(dId);
                if (!dNode) return null;
                return (
                  <button
                    key={dId}
                    onClick={() => onSelectNode(dId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--text-primary)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <span>{dNode.name}</span>
                    <span style={{ fontSize: "0.6875rem", color: "#c084fc" }}>Unit {dNode.unit_number}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GridView({
  graph,
  matchingNodeIds,
  onSelectNode,
}: {
  graph: CurriculumGraph;
  matchingNodeIds: Set<string>;
  onSelectNode: (id: string) => void;
}) {
  const nodesByUnit: Record<number, GraphNode[]> = {};
  graph.nodes.forEach((n) => {
    if (!nodesByUnit[n.unit_number]) nodesByUnit[n.unit_number] = [];
    nodesByUnit[n.unit_number].push(n);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {Object.entries(nodesByUnit)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([unit, nodes]) => (
          <div key={unit}>
            <h4
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Layers size={14} style={{ color: "var(--brand-start)" }} /> Unit {unit}
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {nodes.map((n) => {
                const isMatching = matchingNodeIds.has(n.id);
                const isBottleneck = graph.bottlenecks.includes(n.id) || n.status === "bottleneck";
                const styling = STATUS_COLORS[n.status] || STATUS_COLORS.pending;

                return (
                  <div
                    key={n.id}
                    className="card"
                    onClick={() => onSelectNode(n.id)}
                    style={{
                      padding: 14,
                      cursor: "pointer",
                      opacity: isMatching ? 1 : 0.25,
                      borderLeft: `3px solid ${styling.border}`,
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{n.name}</div>
                      {isBottleneck && (
                        <span className="badge badge-danger" style={{ fontSize: "0.625rem" }}>
                          ⚠️ Bottleneck
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: 8 }}>
                      {n.topic_title}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className="badge badge-neutral" style={{ fontSize: "0.625rem" }}>
                        Diff: {n.difficulty}/5
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: "0.625rem" }}>
                        {n.concept_type}
                      </span>
                      {n.avg_score != null && (
                        <span
                          className={`badge ${
                            n.avg_score >= 70
                              ? "badge-success"
                              : n.avg_score >= 60
                              ? "badge-warning"
                              : "badge-danger"
                          }`}
                          style={{ fontSize: "0.625rem" }}
                        >
                          {n.avg_score}%
                        </span>
                      )}
                      {n.downstream_count > 0 && (
                        <span className="badge badge-purple" style={{ fontSize: "0.625rem" }}>
                          ↓{n.downstream_count} dependents
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
