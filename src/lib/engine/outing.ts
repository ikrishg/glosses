import type {
  QlooEntity,
  QlooGraphSnapshot,
  SharedOutingSuggestion,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { entityById, FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { recommendNextThing } from "@/lib/engine/recommend";
import { blendProfiles, blendedAsProfile } from "@/lib/engine/blend";

function bestFoodForPlace(
  place: QlooEntity,
  graph: QlooGraphSnapshot,
  exclude: Set<string>,
): QlooEntity | null {
  const linked = graph.edges
    .filter(
      (e) =>
        (e.fromId === place.id || e.toId === place.id) &&
        !exclude.has(e.fromId) &&
        !exclude.has(e.toId),
    )
    .map((e) => (e.fromId === place.id ? e.toId : e.fromId))
    .map((id) => entityById(id))
    .filter((e): e is QlooEntity => e !== undefined && e.domain === "food");
  return linked[0] ?? FIXTURE_GRAPH.entities.find((e) => e.domain === "food") ?? null;
}

/**
 * Suggests a place + food pairing reachable from the blended taste graph.
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

  const foodFromPicks = picks.find(
    (p) => p.entity.domain === "food" && p.entity.id !== placePick!.entity.id,
  );
  const food =
    foodFromPicks?.entity ??
    bestFoodForPlace(placePick.entity, graph, logged);

  if (!food) {
    return null;
  }

  const activity = picks.find(
    (p) =>
      (p.entity.domain === "film" || p.entity.domain === "music") &&
      p.entity.id !== placePick!.entity.id,
  );

  const edgeBoost = graph.edges.some(
    (e) =>
      (e.fromId === placePick!.entity.id && e.toId === food.id) ||
      (e.fromId === food.id && e.toId === placePick!.entity.id),
  )
    ? 0.2
    : 0;

  return {
    place: placePick.entity,
    food,
    activity: activity?.entity,
    score: placePick.score + (foodFromPicks?.score ?? 0.4) + edgeBoost,
    rationale: `Shared outing from blended Qloo paths: ${placePick.entity.name} → ${food.name}${
      activity ? `, then ${activity.entity.name}` : ""
    }.`,
  };
}
