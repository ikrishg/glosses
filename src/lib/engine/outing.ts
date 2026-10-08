import type {
  QlooEntity,
  QlooGraphSnapshot,
  SharedOutingSuggestion,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { entityInGraph, hasGraphEdge, neighbors } from "@/lib/graph/lookup";
import { recommendNextThing } from "@/lib/engine/recommend";
import { blendProfiles, blendedAsProfile } from "@/lib/engine/blend";

function bestLinkedFood(
  place: QlooEntity,
  graph: QlooGraphSnapshot,
): QlooEntity | null {
  const foodNeighbor = neighbors(graph, place.id).find(
    (n) => n.entity.domain === "food",
  );
  return foodNeighbor?.entity ?? null;
}

function bestLinkedActivity(
  anchor: QlooEntity,
  graph: QlooGraphSnapshot,
  exclude: Set<string>,
): QlooEntity | undefined {
  const activity = neighbors(graph, anchor.id).find(
    (n) =>
      (n.entity.domain === "film" || n.entity.domain === "music") &&
      !exclude.has(n.entity.id),
  );
  return activity?.entity;
}

/**
 * Suggests a place + food pairing on a single graph route (place ↔ food edge).
 */
export function suggestSharedOuting(
  a: UserTasteProfile,
  b: UserTasteProfile,
  graph: QlooGraphSnapshot,
): SharedOutingSuggestion | null {
  const blended = blendedAsProfile(blendProfiles([a, b]), "You two");
  const picks = recommendNextThing(blended, graph, 24);
  const logged = new Set(blended.tastes.map((t) => t.entityId));

  let placePick = picks.find((p) => p.entity.domain === "places");
  if (!placePick) {
    const fallback = graph.entities.find(
      (e) => e.domain === "places" && !logged.has(e.id),
    );
    if (!fallback) return null;
    placePick = {
      entity: fallback,
      score: 0.5,
      sourceDomains: [],
      rationale: "Fallback place from graph catalog.",
    };
  }

  const food = bestLinkedFood(placePick.entity, graph);
  if (!food) {
    return null;
  }

  const exclude = new Set([placePick.entity.id, food.id, ...logged]);
  const activity =
    bestLinkedActivity(placePick.entity, graph, exclude) ??
    bestLinkedActivity(food, graph, exclude);

  const edgeBoost = hasGraphEdge(graph, placePick.entity.id, food.id)
    ? 0.2
    : 0;

  return {
    place: placePick.entity,
    food,
    activity,
    score: placePick.score + edgeBoost,
    rationale: `Route on the taste graph: ${placePick.entity.name} → ${food.name}${
      activity ? ` → ${activity.name}` : ""
    }.`,
  };
}

/** @internal Test helper: ensures place and food are graph neighbors. */
export function outingUsesCoherentRoute(
  outing: SharedOutingSuggestion,
  graph: QlooGraphSnapshot,
): boolean {
  return hasGraphEdge(graph, outing.place.id, outing.food.id);
}
