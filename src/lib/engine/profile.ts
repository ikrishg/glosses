import type {
  QlooGraphSnapshot,
  TasteSignal,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { entityInGraph } from "@/lib/graph/lookup";

export interface DomainWeights {
  music: number;
  film: number;
  books: number;
  places: number;
  food: number;
  tv: number;
}

export function addTaste(
  profile: UserTasteProfile,
  entityId: string,
): UserTasteProfile {
  const exists = profile.tastes.find((t) => t.entityId === entityId);
  const now = Date.now();
  if (exists) {
    return {
      ...profile,
      tastes: profile.tastes.map((t) =>
        t.entityId === entityId
          ? { ...t, weight: Math.min(1, t.weight + 0.15), loggedAt: now }
          : t,
      ),
    };
  }
  return {
    ...profile,
    tastes: [
      ...profile.tastes,
      { entityId, weight: 1, loggedAt: now },
    ],
  };
}

export function domainWeights(
  profile: UserTasteProfile,
  graph: QlooGraphSnapshot,
): DomainWeights {
  const weights: DomainWeights = {
    music: 0,
    film: 0,
    books: 0,
    places: 0,
    food: 0,
    tv: 0,
  };
  for (const taste of profile.tastes) {
    const entity = entityInGraph(graph, taste.entityId);
    if (!entity) continue;
    weights[entity.domain] += taste.weight;
  }
  const max = Math.max(...Object.values(weights), 1);
  return {
    music: weights.music / max,
    film: weights.film / max,
    books: weights.books / max,
    places: weights.places / max,
    food: weights.food / max,
    tv: weights.tv / max,
  };
}

export function tasteEntitySet(profile: UserTasteProfile): Set<string> {
  return new Set(profile.tastes.map((t) => t.entityId));
}

export function mergeTasteSignals(
  profiles: UserTasteProfile[],
): TasteSignal[] {
  const byId = new Map<
    string,
    { sum: number; count: number; loggedAt: number }
  >();
  for (const profile of profiles) {
    for (const taste of profile.tastes) {
      const prev = byId.get(taste.entityId);
      if (!prev) {
        byId.set(taste.entityId, {
          sum: taste.weight,
          count: 1,
          loggedAt: taste.loggedAt,
        });
      } else {
        prev.sum += taste.weight;
        prev.count += 1;
        prev.loggedAt = Math.max(prev.loggedAt, taste.loggedAt);
      }
    }
  }
  return [...byId.entries()].map(([entityId, meta]) => ({
    entityId,
    weight: meta.sum / meta.count,
    loggedAt: meta.loggedAt,
  }));
}
