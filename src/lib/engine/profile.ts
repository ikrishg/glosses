import type { TasteSignal, UserTasteProfile } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";

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

export function domainWeights(profile: UserTasteProfile): DomainWeights {
  const weights: DomainWeights = {
    music: 0,
    film: 0,
    books: 0,
    places: 0,
    food: 0,
    tv: 0,
  };
  for (const taste of profile.tastes) {
    const entity = FIXTURE_GRAPH.entities.find((e) => e.id === taste.entityId);
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
  const byId = new Map<string, TasteSignal>();
  for (const profile of profiles) {
    for (const taste of profile.tastes) {
      const prev = byId.get(taste.entityId);
      if (!prev) {
        byId.set(taste.entityId, { ...taste });
      } else {
        byId.set(taste.entityId, {
          entityId: taste.entityId,
          weight: (prev.weight + taste.weight) / 2,
          loggedAt: Math.max(prev.loggedAt, taste.loggedAt),
        });
      }
    }
  }
  return [...byId.values()];
}
