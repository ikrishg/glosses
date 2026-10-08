import type {
  CrossDomainRecommendation,
  QlooDomain,
  QlooGraphSnapshot,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { entityById } from "@/lib/graph/fixture-graph";

const DOMAIN_DIVERSITY_BONUS = 0.12;

/**
 * Cross-domain "next thing" from Qloo affinity graph traversal.
 * Deterministic given graph version + logged entity IDs — not reproducible from quiz text alone.
 */
export function recommendNextThing(
  profile: UserTasteProfile,
  graph: QlooGraphSnapshot,
  limit = 3,
): CrossDomainRecommendation[] {
  const loggedIds = new Set(profile.tastes.map((t) => t.entityId));
  const tasteWeight = new Map(
    profile.tastes.map((t) => [t.entityId, t.weight]),
  );

  const scores = new Map<
    string,
    { score: number; sourceDomains: Set<QlooDomain> }
  >();

  for (const taste of profile.tastes) {
    const source = entityById(taste.entityId);
    if (!source) continue;

    const outbound = graph.edges.filter((e) => e.fromId === taste.entityId);
    for (const edge of outbound) {
      if (loggedIds.has(edge.toId)) continue;
      const target = entityById(edge.toId);
      if (!target) continue;

      const pathScore = (tasteWeight.get(taste.entityId) ?? 1) * edge.weight;
      const diversity =
        source.domain !== target.domain ? DOMAIN_DIVERSITY_BONUS : 0;
      const bump = pathScore + diversity;

      const prev = scores.get(edge.toId);
      if (!prev) {
        scores.set(edge.toId, {
          score: bump,
          sourceDomains: new Set([source.domain]),
        });
      } else {
        prev.score += bump;
        prev.sourceDomains.add(source.domain);
      }
    }
  }

  // Graph-version tie-breaker (opaque to quiz-takers / LLMs without the fixture).
  const versionSalt = graph.version.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  const ranked = [...scores.entries()]
    .map(([id, meta]) => {
      const entity = entityById(id)!;
      const tieBreak =
        ((id.length * 17 + versionSalt) % 1000) / 100000;
      return {
        entity,
        score: meta.score + tieBreak,
        sourceDomains: [...meta.sourceDomains],
        rationale: `Cross-domain link from your ${[...meta.sourceDomains].join(" & ")} taste via Qloo graph ${graph.version}.`,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}
