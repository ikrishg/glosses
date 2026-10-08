import type { QlooEntity, QlooGraphSnapshot } from "@/lib/qloo/types";

export function buildEntityIndex(
  graph: QlooGraphSnapshot,
): Map<string, QlooEntity> {
  return new Map(graph.entities.map((e) => [e.id, e]));
}

export function entityInGraph(
  graph: QlooGraphSnapshot,
  id: string,
  index?: Map<string, QlooEntity>,
): QlooEntity | undefined {
  const map = index ?? buildEntityIndex(graph);
  return map.get(id);
}

export function neighbors(
  graph: QlooGraphSnapshot,
  entityId: string,
): { entity: QlooEntity; weight: number }[] {
  const index = buildEntityIndex(graph);
  const results: { entity: QlooEntity; weight: number }[] = [];
  for (const edge of graph.edges) {
    if (edge.fromId === entityId) {
      const entity = index.get(edge.toId);
      if (entity) results.push({ entity, weight: edge.weight });
    } else if (edge.toId === entityId) {
      const entity = index.get(edge.fromId);
      if (entity) results.push({ entity, weight: edge.weight });
    }
  }
  return results.sort((a, b) => b.weight - a.weight);
}

export function hasGraphEdge(
  graph: QlooGraphSnapshot,
  aId: string,
  bId: string,
): boolean {
  return graph.edges.some(
    (e) =>
      (e.fromId === aId && e.toId === bId) ||
      (e.fromId === bId && e.toId === aId),
  );
}
