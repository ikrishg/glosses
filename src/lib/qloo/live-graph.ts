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
import { QlooHttpError, qlooFetch, type QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 60 * 1000;
const BUILD_BUDGET_MS = 15_000;
const POOL_CONCURRENCY = 6;
const MIN_RESOLVED_ENTITIES = Math.max(
  3,
  Math.ceil(FIXTURE_GRAPH.entities.length * 0.2),
);

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

type InsightTask = {
  seed: QlooEntity;
  targetDomain: QlooDomain;
};

let cache: { graph: QlooGraphSnapshot; expiresAt: number } | null = null;
let inflight: Promise<QlooGraphSnapshot> | null = null;
let negativeCacheUntil = 0;

export function clearLiveGraphCache(): void {
  cache = null;
  inflight = null;
  negativeCacheUntil = 0;
}

function liveGraphVersion(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `qloo-live-${day}`;
}

function budgetExpired(deadline: number): boolean {
  return Date.now() >= deadline;
}

/** Run async work over items with a concurrency cap and time budget. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  deadline: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (!budgetExpired(deadline)) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
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
  const deadline = Date.now() + BUILD_BUDGET_MS;
  const fixtureIdMap: Record<string, string> = {};
  const entities: QlooEntity[] = [];
  const liveIdToEntity = new Map<string, QlooEntity>();
  const rejectedInsightSeeds = new Set<string>();

  const liveIds = await mapWithConcurrency(
    FIXTURE_GRAPH.entities,
    POOL_CONCURRENCY,
    deadline,
    (fixture) => searchEntityId(fixture, fetchOpts),
  );

  for (let i = 0; i < FIXTURE_GRAPH.entities.length; i++) {
    const fixture = FIXTURE_GRAPH.entities[i];
    const liveId = liveIds[i];
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

  if (entities.length < MIN_RESOLVED_ENTITIES) {
    throw new Error(
      `Live graph build failed: only ${entities.length}/${FIXTURE_GRAPH.entities.length} entities resolved`,
    );
  }

  const edges: QlooAffinityEdge[] = [];
  const edgeKeys = new Set<string>();
  const insightTasks: InsightTask[] = [];

  for (const seed of entities) {
    for (const targetDomain of ALL_DOMAINS) {
      if (targetDomain === seed.domain) continue;
      insightTasks.push({ seed, targetDomain });
    }
  }

  await mapWithConcurrency(
    insightTasks,
    POOL_CONCURRENCY,
    deadline,
    async ({ seed, targetDomain }) => {
      if (rejectedInsightSeeds.has(seed.id)) {
        return;
      }
      let hits: InsightsHit[] = [];
      try {
        hits = await fetchInsights(seed.id, targetDomain, fetchOpts);
      } catch (err) {
        if (err instanceof QlooHttpError && err.status === 400) {
          rejectedInsightSeeds.add(seed.id);
          console.warn(
            `[qloo] skipping insights for rejected seed ${seed.name} (${seed.id})`,
          );
          return;
        }
        if (err instanceof QlooHttpError) {
          console.warn(
            `[qloo] insights ${err.status} for seed ${seed.id} → ${targetDomain}`,
          );
          return;
        }
        throw err;
      }
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
    },
  );

  return {
    version: liveGraphVersion(),
    entities,
    edges,
    fixtureIdMap,
    dataSource: "live",
  };
}

function startLiveGraphBuild(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  if (Date.now() < negativeCacheUntil) {
    return Promise.reject(new Error("Live graph build in cooldown"));
  }
  if (!inflight) {
    inflight = buildLiveGraphSnapshot(fetchOpts)
      .then((graph) => {
        cache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
        inflight = null;
        negativeCacheUntil = 0;
        return graph;
      })
      .catch((err) => {
        inflight = null;
        negativeCacheUntil = Date.now() + NEGATIVE_CACHE_MS;
        throw err;
      });
  }
  return inflight;
}

/** Fire-and-forget warm so the first user request is less likely to wait on a cold graph. */
export function warmLiveGraphCache(fetchOpts: QlooFetchOptions): void {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return;
  }
  if (inflight || now < negativeCacheUntil) {
    return;
  }
  void startLiveGraphBuild(fetchOpts).catch(() => undefined);
}

export async function getCachedLiveGraph(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.graph;
  }
  return startLiveGraphBuild(fetchOpts);
}
