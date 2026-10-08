import type {
  QlooEntity,
  QlooGraphSnapshot,
  SharedOutingSuggestion,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { hasGraphEdge, neighbors } from "@/lib/graph/lookup";
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

function bestLinkedActivityFromFood(
  food: QlooEntity,
  graph: QlooGraphSnapshot,
  exclude: Set<string>,
): QlooEntity | undefined {
  const candidate = neighbors(graph, food.id).find(
    (n) =>
      (n.entity.domain === "film" || n.entity.domain === "music") &&
      !exclude.has(n.entity.id),
  );
  if (!candidate) {
    return undefined;
  }
  return hasGraphEdge(graph, food.id, candidate.entity.id)
    ? candidate.entity
    : undefined;
}

function orderedPlaceCandidates(
  picks: ReturnType<typeof recommendNextThing>,
  graph: QlooGraphSnapshot,
  logged: Set<string>,
): QlooEntity[] {
  const places: QlooEntity[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (pick.entity.domain !== "places" || seen.has(pick.entity.id)) continue;
    seen.add(pick.entity.id);
    places.push(pick.entity);
  }
  for (const entity of graph.entities) {
    if (entity.domain !== "places" || logged.has(entity.id) || seen.has(entity.id)) {
      continue;
    }
    seen.add(entity.id);
    places.push(entity);
  }
  return places;
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

  for (const place of orderedPlaceCandidates(picks, graph, logged)) {
    const food = bestLinkedFood(place, graph);
    if (!food) {
      continue;
    }

    const exclude = new Set([place.id, food.id, ...logged]);
    const activity = bestLinkedActivityFromFood(food, graph, exclude);

    const edgeBoost = hasGraphEdge(graph, place.id, food.id) ? 0.2 : 0;
    const pickScore =
      picks.find((p) => p.entity.id === place.id)?.score ?? 0.5;

    return {
      place,
      food,
      activity,
      score: pickScore + edgeBoost,
      rationale: activity
        ? `Route on the taste graph: ${place.name} → ${food.name} → ${activity.name}.`
        : `Route on the taste graph: ${place.name} → ${food.name}.`,
    };
  }

  return null;
}

/** Ensures place↔food and optional food→activity edges exist on the graph. */
export function outingRouteIsValid(
  outing: SharedOutingSuggestion,
  graph: QlooGraphSnapshot,
): boolean {
  if (!hasGraphEdge(graph, outing.place.id, outing.food.id)) {
    return false;
  }
  if (outing.activity) {
    return hasGraphEdge(graph, outing.food.id, outing.activity.id);
  }
  return true;
}

/** @deprecated Use outingRouteIsValid */
export function outingUsesCoherentRoute(
  outing: SharedOutingSuggestion,
  graph: QlooGraphSnapshot,
): boolean {
  return outingRouteIsValid(outing, graph);
}
