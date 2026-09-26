"""
Graph Utilities for Curriculum Prerequisite DAGs
"""
from typing import Dict, List, Optional
from collections import defaultdict, deque

def detect_cycles(adjacency_list: Dict[str, List[str]]) -> List[List[str]]:
    """
    Detect all cycles in a directed graph using Tarjan's / DFS approach.
    Returns a list of cycles (each cycle is a list of node IDs forming the loop).
    """
    visited = set()
    recursion_stack = set()
    current_path = []
    cycles = []

    def dfs(node: str):
        visited.add(node)
        recursion_stack.add(node)
        current_path.append(node)

        for neighbor in adjacency_list.get(node, []):
            if neighbor not in visited:
                dfs(neighbor)
            elif neighbor in recursion_stack:
                # Cycle found! Extract subpath
                cycle_start_idx = current_path.index(neighbor)
                cycles.append(current_path[cycle_start_idx:] + [neighbor])

        current_path.pop()
        recursion_stack.remove(node)

    all_nodes = set(adjacency_list.keys())
    for neighbors in adjacency_list.values():
        all_nodes.update(neighbors)

    for node in all_nodes:
        if node not in visited:
            dfs(node)

    return cycles

def topological_sort(adjacency_list: Dict[str, List[str]]) -> Optional[List[str]]:
    """
    Perform topological sort using Kahn's algorithm (indegree reduction).
    Returns ordered node IDs, or None if graph has a cycle.
    Edge u -> v means u is prerequisite of v (u must come before v).
    """
    in_degree = defaultdict(int)
    all_nodes = set(adjacency_list.keys())
    for neighbors in adjacency_list.values():
        all_nodes.update(neighbors)

    for u in all_nodes:
        if u not in in_degree:
            in_degree[u] = 0

    for neighbors in adjacency_list.values():
        for v in neighbors:
            in_degree[v] += 1

    queue = deque([node for node in all_nodes if in_degree[node] == 0])
    result = []

    while queue:
        u = queue.popleft()
        result.append(u)
        for v in adjacency_list.get(u, []):
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)

    if len(result) != len(all_nodes):
        return None  # Cycle present
    return result

def find_bottleneck_nodes(adjacency_list: Dict[str, List[str]], threshold_descendants: int = 3) -> List[Dict[str, int]]:
    """
    Find critical bottleneck nodes in the prerequisite graph.
    A bottleneck node is a node on which multiple downstream concepts depend.
    """
    reverse_adj = defaultdict(list)
    all_nodes = set(adjacency_list.keys())
    for u, neighbors in adjacency_list.items():
        for v in neighbors:
            all_nodes.add(v)
            reverse_adj[u].append(v)

    def count_reachable(start_node: str) -> int:
        visited = set()
        queue = deque([start_node])
        while queue:
            curr = queue.popleft()
            for nbr in reverse_adj.get(curr, []):
                if nbr not in visited:
                    visited.add(nbr)
                    queue.append(nbr)
        return len(visited)

    bottlenecks = []
    for node in all_nodes:
        descendants = count_reachable(node)
        if descendants >= threshold_descendants:
            bottlenecks.append({
                "node_id": node,
                "dependent_count": descendants
            })

    bottlenecks.sort(key=lambda x: x["dependent_count"], reverse=True)
    return bottlenecks
