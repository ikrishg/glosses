import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import type {
  QlooAffinityEdge,
  QlooDomain,
  QlooEntity,
  QlooGraphSnapshot,
} from "@/lib/qloo/types";
import {
  QLOO_SEARCH_TYPE_BY_DOMAIN,
  qlooInsightsFilterType,
} from "@/lib/qloo/domain-types";
import { qlooFetch, type QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ALL_DOMAINS: QlooDomain[] = [
  "music",
  "film",
  "books",
  "places",
  "food",
  "tv",
];

type SearchHit = {
  entity_id: string;
  name: string;
  types?: string[];
  tags?: unknown;
};

type InsightsHit = {
  entity_id: string;
  name?: string;
  query?: { affinity?: number };
};

let cache: { graph: QlooGraphSnapshot; expiresAt: number } | null = null;
let inflight: Promise<QlooGraphSnapshot> | null = null;

export function clearLiveGraphCache(): void {
  cache = null;
  inflight = null;
}

function liveGraphVersion(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `qloo-live-${day}`;
}

async function searchEntityId(
  fixture: QlooEntity,
  fetchOpts: QlooFetchOptions,
): Promise<string | null> {
  const types = QLOO_SEARCH_TYPE_BY_DOMAIN[fixture.domain];
  const data = (await qlooFetch(
    "/search",
    { query: fixture.name, types, take: 1 },
    fetchOpts,
  )) as { results?: SearchHit[] };
  const hit = data.results?.[0];
  return hit?.entity_id ?? null;
}

async function fetchInsights(
  fromEntityId: string,
  targetDomain: QlooDomain,
  fetchOpts: QlooFetchOptions,
): Promise<InsightsHit[]> {
  const filterType = qlooInsightsFilterType(targetDomain);
  const data = (await qlooFetch(
    "/v2/insights",
    {
      "filter.type": filterType,
      "signal.interests.entities": fromEntityId,
      take: 24,
    },
    fetchOpts,
  )) as { success?: boolean; results?: { entities?: InsightsHit[] } };
  return data.results?.entities ?? [];
}

export async function buildLiveGraphSnapshot(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  const fixtureIdMap: Record<string, string> = {};
  const entities: QlooEntity[] = [];
  const liveIdToEntity = new Map<string, QlooEntity>();

  for (const fixture of FIXTURE_GRAPH.entities) {
    const liveId = await searchEntityId(fixture, fetchOpts);
    if (!liveId) continue;
    fixtureIdMap[fixture.id] = liveId;
    const entity: QlooEntity = {
      id: liveId,
      name: fixture.name,
      domain: fixture.domain,
      tags: fixture.tags,
    };
    entities.push(entity);
    liveIdToEntity.set(liveId, entity);
  }

  const edges: QlooAffinityEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const seed of entities) {
    for (const targetDomain of ALL_DOMAINS) {
      if (targetDomain === seed.domain) continue;
      const hits = await fetchInsights(seed.id, targetDomain, fetchOpts);
      for (const hit of hits) {
        const target = liveIdToEntity.get(hit.entity_id);
        if (!target) continue;
        const weight = hit.query?.affinity ?? 0;
        if (weight <= 0) continue;
        const key = `${seed.id}->${target.id}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        edges.push({ fromId: seed.id, toId: target.id, weight });
      }
    }
  }

  if (entities.length === 0) {
    throw new Error("Live graph build failed: no entities resolved");
  }

  return {
    version: liveGraphVersion(),
    entities,
    edges,
    fixtureIdMap,
    dataSource: "live",
  };
}

export async function getCachedLiveGraph(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.graph;
  }
  if (!inflight) {
    inflight = buildLiveGraphSnapshot(fetchOpts).then((graph) => {
      cache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
      inflight = null;
      return graph;
    });
  }
  return inflight;
}
