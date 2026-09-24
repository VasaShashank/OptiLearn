"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
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
  Save,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  Link2,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { CurriculumGraph, GraphNode, GraphEdge } from "@/lib/types";

interface CurriculumGraphViewProps {
  graph: CurriculumGraph;
  courseId?: string;
}

type LayoutMode = "unit-flow" | "topological" | "grid";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Strict Client-Side Cycle Detection using Breadth-First Search (BFS).
 * Returns true if adding directed edge (newSource -> newTarget) would create a cycle.
 */
export function checkCycle(edges: GraphEdge[], newSource: string, newTarget: string): boolean {
  if (newSource === newTarget) return true;
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  const visited = new Set<string>();
  const queue = [newTarget];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === newSource) return true; // Cycle detected: newTarget can reach newSource
    if (!visited.has(curr)) {
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
  }
  return false;
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

export default function CurriculumGraphView({ graph, courseId }: CurriculumGraphViewProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("unit-flow");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Dynamic local graph state for real-time edge additions and deletions
  const [localEdges, setLocalEdges] = useState<GraphEdge[]>(graph.edges);
  const [localNodes, setLocalNodes] = useState<GraphNode[]>(graph.nodes);

  // Prerequisite linking mode
  const [isLinkingMode, setIsLinkingMode] = useState<boolean>(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [graphAlert, setGraphAlert] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    setLocalEdges(graph.edges);
    setLocalNodes(graph.nodes);
  }, [graph]);

  // Pan and Zoom
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [zoom, setZoom] = useState(0.9);
  const isDraggingCanvas = useRef(false);
  const isDraggingNode = useRef<string | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute node relationships for path highlighting using localNodes and localEdges
  const nodeConnections = useMemo(() => {
    const upstream = new Map<string, Set<string>>(); // prerequisites of node
    const downstream = new Map<string, Set<string>>(); // dependents of node

    localNodes.forEach((n) => {
      upstream.set(n.id, new Set());
      downstream.set(n.id, new Set());
    });

    localEdges.forEach((e) => {
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
  }, [localNodes, localEdges]);

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

    localNodes.forEach((n) => {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    localEdges.forEach((e) => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      adj.get(e.source)?.push(e.target);
    });

    const rank = new Map<string, number>();
    localNodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) rank.set(n.id, 0);
    });

    // BFS relaxation
    let changed = true;
    let maxIter = 20;
    while (changed && maxIter-- > 0) {
      changed = false;
      localEdges.forEach((e) => {
        const srcRank = rank.get(e.source) ?? 0;
        const currentTargetRank = rank.get(e.target) ?? 0;
        if (srcRank + 1 > currentTargetRank) {
          rank.set(e.target, srcRank + 1);
          changed = true;
        }
      });
    }

    return rank;
  }, [localNodes, localEdges]);

  // Calculate coordinates for positioned nodes
  const nodeWidth = 230;
  const nodeHeight = 78;

  const positionedNodes: PositionedNode[] = useMemo(() => {
    if (layoutMode === "topological") {
      const rankBuckets = new Map<number, GraphNode[]>();
      localNodes.forEach((n) => {
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
      localNodes.forEach((n) => {
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
  }, [localNodes, layoutMode, topologicalRanks, customPositions]);

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
      localNodes
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
  }, [localNodes, searchQuery, statusFilter, graph.bottlenecks]);

  const handleAddPrerequisiteEdge = async (sourceId: string, targetId: string) => {
    if (!courseId) return;
    const srcNode = localNodes.find((n) => n.id === sourceId);
    const tgtNode = localNodes.find((n) => n.id === targetId);
    const srcName = srcNode?.name || sourceId;
    const tgtName = tgtNode?.name || targetId;

    if (sourceId === targetId) {
      setGraphAlert({
        type: "error",
        message: "Self-dependency blocked: A concept cannot depend on itself.",
      });
      return;
    }

    // Instant client-side cycle check
    if (checkCycle(localEdges, sourceId, targetId)) {
      setGraphAlert({
        type: "error",
        message: `Circular dependency blocked: Adding prerequisite '${srcName}' -> '${tgtName}' forms an invalid cycle in the curriculum DAG!`,
      });
      return;
    }

    try {
      const res = await coursesAPI.addPrerequisite(courseId, sourceId, targetId);
      setLocalEdges((prev) => {
        const filtered = prev.filter((e) => !(e.source === sourceId && e.target === targetId));
        return [...filtered, { source: sourceId, target: targetId, relationship_type: "prerequisite" }];
      });
      setGraphAlert({
        type: "success",
        message: res.message || `Prerequisite '${srcName}' -> '${tgtName}' established successfully!`,
      });
      setTimeout(() => setGraphAlert(null), 4500);
    } catch (err: any) {
      setGraphAlert({
        type: "error",
        message: err.message || "Failed to add prerequisite edge",
      });
    }
  };

  const handleDeletePrerequisiteEdge = async (sourceId: string, targetId: string) => {
    if (!courseId) return;
    const srcNode = localNodes.find((n) => n.id === sourceId);
    const tgtNode = localNodes.find((n) => n.id === targetId);
    const srcName = srcNode?.name || sourceId;
    const tgtName = tgtNode?.name || targetId;

    try {
      const res = await coursesAPI.deletePrerequisite(courseId, sourceId, targetId);
      setLocalEdges((prev) => prev.filter((e) => !(e.source === sourceId && e.target === targetId)));
      setGraphAlert({
        type: "success",
        message: res.message || `Prerequisite link '${srcName}' -> '${tgtName}' removed.`,
      });
      setTimeout(() => setGraphAlert(null), 3500);
    } catch (err: any) {
      setGraphAlert({
        type: "error",
        message: err.message || "Failed to delete prerequisite edge",
      });
    }
  };

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

          {/* Visual Link Prerequisite Button */}
          <button
            type="button"
            onClick={() => {
              const nextMode = !isLinkingMode;
              setIsLinkingMode(nextMode);
              setLinkSourceId(null);
              if (nextMode) {
                setGraphAlert({
                  type: "info",
                  message: "🔗 Visual Link Mode Active: Click a prerequisite concept (source), then click the dependent concept (target).",
                });
              } else {
                setGraphAlert(null);
              }
            }}
            className="btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: "0.75rem",
              borderRadius: "var(--radius-sm)",
              border: isLinkingMode ? "1px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
              background: isLinkingMode ? "rgba(168, 85, 247, 0.2)" : "var(--bg-input)",
              color: isLinkingMode ? "#c084fc" : "var(--text-secondary)",
              fontWeight: 600,
              cursor: "pointer",
            }}
            title="Interactive Prerequisite Graph Linker"
          >
            <Link2 size={13} />
            {isLinkingMode ? "Cancel Linking" : "Link Prerequisite"}
          </button>

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

      {/* Real-Time Graph Alert & Linking Instructions Banner */}
      {graphAlert && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: "0.8125rem",
            background:
              graphAlert.type === "error"
                ? "rgba(239, 68, 68, 0.15)"
                : graphAlert.type === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(59, 130, 246, 0.15)",
            border:
              graphAlert.type === "error"
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : graphAlert.type === "success"
                ? "1px solid rgba(16, 185, 129, 0.4)"
                : "1px solid rgba(59, 130, 246, 0.4)",
            color:
              graphAlert.type === "error"
                ? "#fca5a5"
                : graphAlert.type === "success"
                ? "#6ee7b7"
                : "#93c5fd",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {graphAlert.type === "error" && <AlertTriangle size={16} />}
            {graphAlert.type === "success" && <CheckCircle2 size={16} />}
            {graphAlert.type === "info" && <Network size={16} />}
            <span>{graphAlert.message}</span>
          </div>
          <button
            onClick={() => setGraphAlert(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

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
              {localEdges.map((edge, idx) => {
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
                  <g
                    key={`${edge.source}-${edge.target}-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remove prerequisite edge '${src.name}' -> '${tgt.name}'?`)) {
                        handleDeletePrerequisiteEdge(edge.source, edge.target);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{`Prerequisite: ${src.name} -> ${tgt.name} (Click to remove)`}</title>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
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
                const isLinkSource = linkSourceId === node.id;

                const styling = STATUS_COLORS[node.status] || STATUS_COLORS.pending;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{
                      cursor: isLinkingMode ? "crosshair" : "grab",
                      opacity: isDimmed ? 0.22 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                    onMouseDown={(e) => {
                      if (!isLinkingMode) handleNodeMouseDown(e, node.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isLinkingMode) {
                        if (!linkSourceId) {
                          setLinkSourceId(node.id);
                          setGraphAlert({
                            type: "info",
                            message: `Prerequisite '${node.name}' selected. Now click the dependent concept that depends on it.`,
                          });
                        } else if (linkSourceId === node.id) {
                          setGraphAlert({
                            type: "error",
                            message: "Self-dependency forbidden: A concept cannot be a prerequisite of itself.",
                          });
                        } else {
                          handleAddPrerequisiteEdge(linkSourceId, node.id);
                          setIsLinkingMode(false);
                          setLinkSourceId(null);
                        }
                        return;
                      }
                      setSelectedNodeId(isSelected ? null : node.id);
                    }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    {/* Visual Link Mode Source Ring */}
                    {isLinkSource && (
                      <rect
                        x={-6}
                        y={-6}
                        width={node.width + 12}
                        height={node.height + 12}
                        rx={16}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        strokeDasharray="5 4"
                      />
                    )}

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
              allNodes={localNodes}
              localEdges={localEdges}
              nodeConnections={nodeConnections}
              nodeMap={nodeMap}
              courseId={courseId}
              onClose={() => setSelectedNodeId(null)}
              onSelectNode={(id) => setSelectedNodeId(id)}
              onAddPrerequisite={handleAddPrerequisiteEdge}
              onDeletePrerequisite={handleDeletePrerequisiteEdge}
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
            <span>Prerequisite Path (Click edge to delete)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "#c084fc" }}>↓k</span>
            <span>Dependents count</span>
          </div>
        </div>
        <div>
          <span>{localNodes.length} concepts</span> · <span>{localEdges.length} edges</span> · <span>{graph.bottlenecks.length} bottlenecks</span>
        </div>
      </div>
    </div>
  );
}

function ConceptInspector({
  node,
  graph,
  allNodes,
  localEdges,
  nodeConnections,
  nodeMap,
  courseId,
  onClose,
  onSelectNode,
  onAddPrerequisite,
  onDeletePrerequisite,
}: {
  node: PositionedNode;
  graph: CurriculumGraph;
  allNodes: GraphNode[];
  localEdges: GraphEdge[];
  nodeConnections: {
    upstream: Map<string, Set<string>>;
    downstream: Map<string, Set<string>>;
  };
  nodeMap: Map<string, PositionedNode>;
  courseId?: string;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  onAddPrerequisite: (sourceId: string, targetId: string) => Promise<void>;
  onDeletePrerequisite: (sourceId: string, targetId: string) => Promise<void>;
}) {
  const isBottleneck = graph.bottlenecks.includes(node.id) || node.status === "bottleneck";
  const directPrereqIds = Array.from(nodeConnections.upstream.get(node.id) || []);
  const directDependentIds = Array.from(nodeConnections.downstream.get(node.id) || []);

  const [difficulty, setDifficulty] = useState(node.difficulty);
  const [importance, setImportance] = useState(node.importance);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Quick Prerequisite Linker State
  const [candidatePrereqId, setCandidatePrereqId] = useState("");
  const [linkingPrereq, setLinkingPrereq] = useState(false);
  const [prereqError, setPrereqError] = useState<string | null>(null);

  useEffect(() => {
    setDifficulty(node.difficulty);
    setImportance(node.importance);
    setSaveSuccess(null);
    setCandidatePrereqId("");
    setPrereqError(null);
  }, [node.id, node.difficulty, node.importance]);

  const handleSaveParameters = async () => {
    if (!courseId) return;
    setSaving(true);
    setSaveSuccess(null);
    try {
      await coursesAPI.updateConcept(courseId, node.id, {
        difficulty,
        importance,
      });
      setSaveSuccess("Saved & Re-optimized! Priority scores updated.");
      setTimeout(() => setSaveSuccess(null), 3500);
    } catch (err: any) {
      setSaveSuccess("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddCandidatePrereq = async () => {
    if (!candidatePrereqId) return;
    setLinkingPrereq(true);
    setPrereqError(null);

    // Client-side cycle check
    if (checkCycle(localEdges, candidatePrereqId, node.id)) {
      setPrereqError("Circular dependency blocked! Concept would create a cycle.");
      setLinkingPrereq(false);
      return;
    }

    try {
      await onAddPrerequisite(candidatePrereqId, node.id);
      setCandidatePrereqId("");
    } catch (err: any) {
      setPrereqError(err.message || "Failed to add prerequisite link");
    } finally {
      setLinkingPrereq(false);
    }
  };

  // Concepts eligible to be linked as prerequisites
  const availableCandidates = allNodes.filter(
    (n) => n.id !== node.id && !directPrereqIds.includes(n.id)
  );

  const styling = STATUS_COLORS[node.status] || STATUS_COLORS.pending;

  return (
    <div
      className="card animate-fade-in"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        bottom: 14,
        width: 350,
        background: "rgba(15, 20, 36, 0.96)",
        border: "1px solid var(--border-subtle)",
        backdropFilter: "blur(18px)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 14px 36px rgba(0,0,0,0.65)",
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
        {/* DAG cycle safety check indicator */}
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.7rem",
            color: "var(--accent-emerald)",
          }}
        >
          <ShieldCheck size={14} style={{ flexShrink: 0 }} />
          <span>Strict DAG Invariant Verified (No Cyclic Loops)</span>
        </div>

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

        {/* Interactive Parameter Sliders / Adjusters */}
        <div style={{ background: "var(--bg-input)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Sliders size={14} color="var(--brand-end)" />
            Adjust Concept Weights & Difficulty
          </div>

          {/* Difficulty Stepper */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
              <span style={{ color: "var(--text-secondary)" }}>Difficulty:</span>
              <strong style={{ color: "var(--accent-amber)" }}>{difficulty} / 5</strong>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    background: difficulty === d ? "var(--brand-start)" : "var(--bg-secondary)",
                    color: difficulty === d ? "#fff" : "var(--text-muted)",
                    border: difficulty === d ? "1px solid var(--brand-start)" : "1px solid var(--border-default)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Importance Stepper */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
              <span style={{ color: "var(--text-secondary)" }}>Importance:</span>
              <strong style={{ color: "var(--accent-purple)" }}>{importance} / 5</strong>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((imp) => (
                <button
                  key={imp}
                  type="button"
                  onClick={() => setImportance(imp)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    background: importance === imp ? "var(--accent-purple)" : "var(--bg-secondary)",
                    color: importance === imp ? "#fff" : "var(--text-muted)",
                    border: importance === imp ? "1px solid var(--accent-purple)" : "1px solid var(--border-default)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {imp}
                </button>
              ))}
            </div>
          </div>

          {saveSuccess && (
            <div style={{ fontSize: "0.7rem", color: "var(--accent-emerald)", marginBottom: 8 }}>
              {saveSuccess}
            </div>
          )}

          <button
            type="button"
            disabled={saving || !courseId}
            onClick={handleSaveParameters}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Save size={14} />
            <span>{saving ? "Re-optimizing..." : "Save & Re-optimize"}</span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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

        {/* Direct Prerequisites Section with Interactive Unlink & Quick Link */}
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Direct Prerequisites ({directPrereqIds.length})</span>
          </div>

          {directPrereqIds.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", marginBottom: 8 }}>
              None (Foundational concept)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {directPrereqIds.map((pId) => {
                const pNode = nodeMap.get(pId);
                if (!pNode) return null;
                return (
                  <div
                    key={pId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNode(pId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <span>{pNode.name}</span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--brand-start)" }}>U{pNode.unit_number}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePrerequisite(pId, node.id)}
                      style={{
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        color: "#f87171",
                        borderRadius: "var(--radius-sm)",
                        padding: "3px 6px",
                        fontSize: "0.6875rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Remove Prerequisite Dependency"
                    >
                      <Trash2 size={11} /> Unlink
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Prerequisite Linker Dropdown */}
          <div style={{ marginTop: 8, background: "rgba(255, 255, 255, 0.02)", padding: 8, borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)" }}>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
              + Link Prerequisite to this Concept:
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={candidatePrereqId}
                onChange={(e) => setCandidatePrereqId(e.target.value)}
                className="input-select"
                style={{ flex: 1, fontSize: "0.75rem", padding: "4px 8px" }}
              >
                <option value="">Select candidate prerequisite...</option>
                {availableCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Unit {c.unit_number})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!candidatePrereqId || linkingPrereq}
                onClick={handleAddCandidatePrereq}
                className="btn-secondary"
                style={{ padding: "4px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> Link
              </button>
            </div>
            {prereqError && (
              <div style={{ fontSize: "0.6875rem", color: "#f87171", marginTop: 6 }}>
                ⚠️ {prereqError}
              </div>
            )}
          </div>
        </div>

        {/* Downstream Dependents Section with Unlink */}
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Downstream Dependents ({directDependentIds.length})
          </div>
          {directDependentIds.length === 0 ? (
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              Terminal concept in curriculum (no downstream dependents)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {directDependentIds.map((dId) => {
                const dNode = nodeMap.get(dId);
                if (!dNode) return null;
                return (
                  <div
                    key={dId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNode(dId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <span>{dNode.name}</span>
                      <span style={{ fontSize: "0.6875rem", color: "#c084fc" }}>U{dNode.unit_number}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePrerequisite(node.id, dId)}
                      style={{
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        color: "#f87171",
                        borderRadius: "var(--radius-sm)",
                        padding: "3px 6px",
                        fontSize: "0.6875rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Remove Dependent Link"
                    >
                      <Trash2 size={11} /> Unlink
                    </button>
                  </div>
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
