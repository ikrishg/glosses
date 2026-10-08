import type { TasteMatchResult, UserTasteProfile } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { tasteEntitySet } from "@/lib/engine/profile";

export type SocialTier = TasteMatchResult["tier"];

export interface RankablePerson {
  personId: string;
  displayName: string;
  tier: SocialTier;
  profile: UserTasteProfile;
}

const TIER_ORDER: Record<SocialTier, number> = {
  friend: 0,
  second_network: 1,
  stranger: 2,
};

/**
 * Taste match: weighted Jaccard on entity IDs plus tag overlap from fixture graph.
 */
export function tasteMatchScore(
  a: UserTasteProfile,
  b: UserTasteProfile,
): { score: number; sharedEntityIds: string[] } {
  const setA = tasteEntitySet(a);
  const setB = tasteEntitySet(b);
  const shared: string[] = [];
  let intersectionWeight = 0;
  let unionWeight = 0;

  const allIds = new Set([...setA, ...setB]);
  for (const id of allIds) {
    const wa = a.tastes.find((t) => t.entityId === id)?.weight ?? 0;
    const wb = b.tastes.find((t) => t.entityId === id)?.weight ?? 0;
    unionWeight += Math.max(wa, wb);
    if (setA.has(id) && setB.has(id)) {
      intersectionWeight += Math.min(wa, wb);
      shared.push(id);
    }
  }

  let tagOverlap = 0;
  const tagsA = new Set<string>();
  const tagsB = new Set<string>();
  for (const id of setA) {
    const e = FIXTURE_GRAPH.entities.find((x) => x.id === id);
    e?.tags.forEach((t) => tagsA.add(t));
  }
  for (const id of setB) {
    const e = FIXTURE_GRAPH.entities.find((x) => x.id === id);
    e?.tags.forEach((t) => tagsB.add(t));
  }
  for (const t of tagsA) {
    if (tagsB.has(t)) tagOverlap += 1;
  }
  const tagBonus = Math.min(0.15, tagOverlap * 0.03);

  const jaccard = unionWeight > 0 ? intersectionWeight / unionWeight : 0;
  return {
    score: Math.min(1, jaccard + tagBonus),
    sharedEntityIds: shared,
  };
}

export function rankPeopleByTaste(
  viewer: UserTasteProfile,
  candidates: RankablePerson[],
): TasteMatchResult[] {
  return candidates
    .map((c) => {
      const { score, sharedEntityIds } = tasteMatchScore(viewer, c.profile);
      return {
        personId: c.personId,
        displayName: c.displayName,
        tier: c.tier,
        score,
        sharedEntityIds,
      };
    })
    .sort((a, b) => {
      const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
      if (tierDiff !== 0) return tierDiff;
      return b.score - a.score;
    });
}
