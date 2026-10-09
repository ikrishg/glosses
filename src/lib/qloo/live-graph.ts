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
const RETRY_COOLDOWN_MS = 60 * 1000;
const BUILD_BUDGET_MS = 60_000;
export const POOL_CONCURRENCY = 3;
const MIN_RESOLVED_ENTITIES = Math.max(
  3,
  Math.ceil(FIXTURE_GRAPH.entities.length * 0.2),
);
const MIN_LIVE_EDGES = FIXTURE_GRAPH.edges.length;

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

export type LiveGraphBuildProgress = {
  fixtureIdMap: Record<string, string>;
  entities: QlooEntity[];
  edges: QlooAffinityEdge[];
  searchedFixtures: Set<string>;
  insightsDomainsDone: Set<QlooDomain>;
};

export type LiveGraphStatus = "idle" | "warming" | "ready" | "degraded";

type LiveCache = {
  graph: QlooGraphSnapshot;
  expiresAt: number;
};

let readyCache: LiveCache | null = null;
let inflight: Promise<void> | null = null;
let retryAfter = 0;
let partial: LiveGraphBuildProgress | null = null;
let lastStatus: LiveGraphStatus = "idle";

function emptyProgress(): LiveGraphBuildProgress {
  return {
    fixtureIdMap: {},
    entities: [],
    edges: [],
    searchedFixtures: new Set(),
    insightsDomainsDone: new Set(),
  };
}

function cloneProgress(src: LiveGraphBuildProgress): LiveGraphBuildProgress {
  return {
    fixtureIdMap: { ...src.fixtureIdMap },
    entities: [...src.entities],
    edges: [...src.edges],
    searchedFixtures: new Set(src.searchedFixtures),
    insightsDomainsDone: new Set(src.insightsDomainsDone),
  };
}

export function clearLiveGraphCache(): void {
  readyCache = null;
  inflight = null;
  retryAfter = 0;
  partial = null;
  lastStatus = "idle";
}

/** Test helper: mark a graph as the ready cached snapshot. */
export function __testSetLiveGraphReady(graph: QlooGraphSnapshot): void {
  readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
  lastStatus = "ready";
}

export function __testSetLiveGraphStatus(status: LiveGraphStatus): void {
  lastStatus = status;
}

function liveGraphVersion(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `qloo-live-${day}`;
}

function budgetExpired(deadline: number): boolean {
  return Date.now() >= deadline;
}

function fixtureGraph(): QlooGraphSnapshot {
  return { ...FIXTURE_GRAPH, dataSource: "fixture" };
}

export function getLiveGraphStatus(): LiveGraphStatus {
  return lastStatus;
}

export function isLiveGraphReady(): boolean {
  return lastStatus === "ready" && readyCache !== null;
}

/** Graph served on the request path — never blocks on a background build. */
export function getServingLiveGraph(): QlooGraphSnapshot {
  if (readyCache) {
    return readyCache.graph;
  }
  return fixtureGraph();
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
  try {
    const types = QLOO_SEARCH_TYPE_BY_DOMAIN[fixture.domain];
    const data = (await qlooFetch(
      "/search",
      { query: fixture.name, types, take: 1 },
      fetchOpts,
    )) as { results?: SearchHit[] };
    const hit = data.results?.[0];
    return hit?.entity_id ?? null;
  } catch (err) {
    if (err instanceof QlooHttpError) {
      console.warn(
        `[qloo] search ${err.status} for "${fixture.name}" — skipping seed`,
      );
    }
    return null;
  }
}

async function fetchInsightsBatch(
  seedEntityIds: string[],
  targetDomain: QlooDomain,
  fetchOpts: QlooFetchOptions,
): Promise<InsightsHit[]> {
  if (seedEntityIds.length === 0) {
    return [];
  }
  const filterType = qlooInsightsFilterType(targetDomain);
  const data = (await qlooFetch(
    "/v2/insights",
    {
      "filter.type": filterType,
      "signal.interests.entities": seedEntityIds.join(","),
      take: 48,
    },
    fetchOpts,
  )) as { success?: boolean; results?: { entities?: InsightsHit[] } };
  return data.results?.entities ?? [];
}

function mergeEdges(
  edges: QlooAffinityEdge[],
  edgeKeys: Set<string>,
  fromId: string,
  toId: string,
  weight: number,
): void {
  if (weight <= 0) return;
  const key = `${fromId}->${toId}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({ fromId, toId, weight });
}

export async function buildLiveGraphSnapshot(
  fetchOpts: QlooFetchOptions,
  initialProgress?: LiveGraphBuildProgress,
): Promise<QlooGraphSnapshot> {
  const deadline = Date.now() + BUILD_BUDGET_MS;
  const state = initialProgress
    ? cloneProgress(initialProgress)
    : emptyProgress();
  const liveIdToEntity = new Map(state.entities.map((e) => [e.id, e]));
  const edgeKeys = new Set(
    state.edges.map((e) => `${e.fromId}->${e.toId}`),
  );

  const fixturesToSearch = FIXTURE_GRAPH.entities.filter(
    (f) => !state.searchedFixtures.has(f.id),
  );

  const liveIds = await mapWithConcurrency(
    fixturesToSearch,
    POOL_CONCURRENCY,
    deadline,
    (fixture) => searchEntityId(fixture, fetchOpts),
  );

  for (let i = 0; i < fixturesToSearch.length; i++) {
    const fixture = fixturesToSearch[i];
    state.searchedFixtures.add(fixture.id);
    const liveId = liveIds[i];
    if (!liveId) continue;
    state.fixtureIdMap[fixture.id] = liveId;
    if (liveIdToEntity.has(liveId)) continue;
    const entity: QlooEntity = {
      id: liveId,
      name: fixture.name,
      domain: fixture.domain,
      tags: fixture.tags,
    };
    state.entities.push(entity);
    liveIdToEntity.set(liveId, entity);
  }

  if (state.entities.length < MIN_RESOLVED_ENTITIES) {
    throw new Error(
      `Live graph build failed: only ${state.entities.length}/${FIXTURE_GRAPH.entities.length} entities resolved`,
    );
  }

  const allSeedIds = state.entities.map((e) => e.id);
  const insightDomains = ALL_DOMAINS.filter(
    (d) => !state.insightsDomainsDone.has(d),
  );

  await mapWithConcurrency(
    insightDomains,
    POOL_CONCURRENCY,
    deadline,
    async (targetDomain) => {
      if (budgetExpired(deadline)) {
        return;
      }
      try {
        const hits = await fetchInsightsBatch(
          allSeedIds,
          targetDomain,
          fetchOpts,
        );
        state.insightsDomainsDone.add(targetDomain);
        for (const hit of hits) {
          const target = liveIdToEntity.get(hit.entity_id);
          if (!target || target.domain !== targetDomain) continue;
          const weight = hit.query?.affinity ?? 0;
          for (const seed of state.entities) {
            if (seed.domain === targetDomain) continue;
            mergeEdges(state.edges, edgeKeys, seed.id, target.id, weight);
          }
        }
      } catch (err) {
        if (err instanceof QlooHttpError) {
          console.warn(
            `[qloo] batched insights ${err.status} for ${targetDomain}`,
          );
          state.insightsDomainsDone.add(targetDomain);
          return;
        }
        throw err;
      }
    },
  );

  partial = cloneProgress(state);

  if (state.edges.length < MIN_LIVE_EDGES) {
    throw new Error(
      `Live graph build incomplete: ${state.edges.length}/${MIN_LIVE_EDGES} edges`,
    );
  }

  return {
    version: liveGraphVersion(),
    entities: state.entities,
    edges: state.edges,
    fixtureIdMap: state.fixtureIdMap,
    dataSource: "live",
  };
}

function scheduleRetry(fetchOpts: QlooFetchOptions): void {
  retryAfter = Date.now() + RETRY_COOLDOWN_MS;
  lastStatus =
    readyCache !== null ? "ready" : partial !== null ? "warming" : "degraded";
  setTimeout(() => {
    warmLiveGraphCache(fetchOpts);
  }, RETRY_COOLDOWN_MS);
}

function runBackgroundBuild(fetchOpts: QlooFetchOptions): Promise<void> {
  const stale = readyCache;
  lastStatus = stale ? "ready" : "warming";

  return buildLiveGraphSnapshot(fetchOpts, partial ?? undefined)
    .then((graph) => {
      readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
      partial = null;
      retryAfter = 0;
      lastStatus = "ready";
    })
    .catch((err) => {
      console.warn(
        `[qloo] background graph build: ${err instanceof Error ? err.message : "failed"}`,
      );
      if (readyCache) {
        lastStatus = "ready";
      } else {
        lastStatus = partial ? "warming" : "degraded";
      }
      scheduleRetry(fetchOpts);
    })
    .finally(() => {
      inflight = null;
      const now = Date.now();
      if (
        readyCache &&
        readyCache.expiresAt <= now &&
        !inflight &&
        now >= retryAfter
      ) {
        warmLiveGraphCache(fetchOpts);
      }
    });
}

/** Starts a background graph build; requests never await this. */
export function warmLiveGraphCache(fetchOpts: QlooFetchOptions): void {
  const now = Date.now();
  if (readyCache && readyCache.expiresAt > now) {
    return;
  }
  if (inflight) {
    return;
  }
  if (now < retryAfter) {
    return;
  }
  if (!readyCache) {
    lastStatus = "warming";
  }
  inflight = runBackgroundBuild(fetchOpts);
}

/** @deprecated Requests should use getServingLiveGraph — kept for tests. */
export async function getCachedLiveGraph(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  warmLiveGraphCache(fetchOpts);
  if (inflight) {
    await inflight;
  }
  if (readyCache) {
    return readyCache.graph;
  }
  throw new Error("Live graph not ready");
}
