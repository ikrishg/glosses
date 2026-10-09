import type { QlooGraphSnapshot, UserTasteProfile } from "@/lib/qloo/types";

/** Map fixture catalog ids to live Qloo ids when serving a live graph. */
export function resolveEntityIdForLiveGraph(
  graph: QlooGraphSnapshot,
  entityId: string,
): string {
  if (graph.dataSource !== "live") {
    return entityId;
  }
  const mapped = graph.fixtureIdMap?.[entityId];
  if (mapped) {
    return mapped;
  }
  return entityId;
}

export function normalizeProfileForLiveGraph(
  profile: UserTasteProfile,
  graph: QlooGraphSnapshot,
): UserTasteProfile {
  if (graph.dataSource !== "live") {
    return profile;
  }
  return {
    ...profile,
    tastes: profile.tastes.map((t) => ({
      ...t,
      entityId: resolveEntityIdForLiveGraph(graph, t.entityId),
    })),
  };
}
